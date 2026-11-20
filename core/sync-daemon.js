'use strict';

require('dotenv').config();

const db = require('../store/db');
const gcal = require('../integrations/google-calendar');
const gtasks = require('../integrations/google-tasks');
const jira = require('../integrations/jira');
const outlook = require('../integrations/outlook');
const aiScorer = require('../ai/ai-scorer');
const { PROMPT_VERSION } = require('../ai/prompt');
const crypto = require('crypto');

// SHA-256 is used here purely as a change-detection fingerprint, not for
// security purposes. Collision probability (~2^-128) is negligible for this
// use case and does not require explicit collision handling.
// PROMPT_VERSION participates in the hash so any change to the prompt or
// parser invalidates the cache automatically — no manual clear needed.
function computeEventsHash(tasks) {
  const data = tasks
    .map((t) => `${t.id}|${t.title}|${t.due_at}|${t.priority}`)
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(`v=${PROMPT_VERSION}\n${data}`).digest('hex');
}

function shouldRecalcAi(config) {
  const cache = db
    .getDb()
    .prepare('SELECT computed_at FROM ai_cache ORDER BY computed_at DESC LIMIT 1')
    .get();
  if (!cache) {
    return true;
  }

  const recalcMs = (config.ai?.recalc_hours || 6) * 3600000;
  return Date.now() - cache.computed_at > recalcMs;
}

async function sync(config) {
  const errors = [];
  let gcalCount = 0;
  let gtasksCount = 0;
  let jiraCount = 0;
  let outlookCount = 0;

  const gcalEvents = await fetchWithErrorCapture(
    () => gcal.fetchEvents(config),
    'google_calendar',
    errors,
  );

  const googleTasks = await fetchWithErrorCapture(
    () => gtasks.fetchTasks(config),
    'google_tasks',
    errors,
  );

  // Issues from the Jira sites that answered when another site did not.
  let jiraPartialIssues = [];
  const jiraIssues = await fetchWithErrorCapture(
    async () => {
      try {
        return await jira.fetchIssues(config);
      } catch (err) {
        jiraPartialIssues = err.partialIssues || [];
        throw err;
      }
    },
    'jira',
    errors,
  );

  const outlookEvents = await fetchWithErrorCapture(
    () => outlook.fetchEvents(config),
    'outlook',
    errors,
  );

  const database = db.getDb();
  const upsertMany = database.transaction((tasks, source) => {
    const activeIds = tasks.map((t) => t.id);
    db.markStale(source, activeIds);

    for (const task of tasks) {
      db.upsertTask(task);
    }

    return tasks.length;
  });

  const failedSources = new Set(errors.map((e) => e.source));

  if (
    !failedSources.has('google_calendar') &&
    (gcalEvents.length > 0 || config.sources.google_calendar.enabled)
  ) {
    gcalCount = upsertMany(gcalEvents, 'gcal');
  }

  if (!failedSources.has('google_tasks') && config.sources.google_calendar.enabled) {
    gtasksCount = upsertMany(googleTasks, 'gtasks');
  }

  if (!failedSources.has('jira') && (jiraIssues.length > 0 || config.sources.jira.enabled)) {
    jiraCount = upsertMany(jiraIssues, 'jira');
  } else if (jiraPartialIssues.length > 0) {
    // Refresh what the healthy sites returned, but mark nothing stale: the issues of the
    // failed site would otherwise vanish from the desktop.
    database.transaction((tasks) => tasks.forEach((task) => db.upsertTask(task)))(
      jiraPartialIssues,
    );
    jiraCount = jiraPartialIssues.length;
  }

  if (
    !failedSources.has('outlook') &&
    (outlookEvents.length > 0 || config.sources.outlook?.enabled)
  ) {
    outlookCount = upsertMany(outlookEvents, 'outlook');
  }

  const allTasks = [
    ...gcalEvents,
    ...googleTasks,
    ...jiraIssues,
    ...jiraPartialIssues,
    ...outlookEvents,
  ];

  if (config.ai?.enabled && allTasks.length > 0) {
    await runAiScoring(allTasks, config, errors);
  }

  return { gcal: gcalCount, gtasks: gtasksCount, jira: jiraCount, outlook: outlookCount, errors };
}

async function runAiScoring(tasks, config, errors) {
  try {
    const currentHash = computeEventsHash(tasks);
    const cached = db.getAiCache(currentHash);

    const needsRecalc = shouldRecalcAi(config);

    const activeTasks = db.getActiveTasks(config.sync.lookahead_hours * 3600000);

    const cachedResult = cached && !needsRecalc ? readCachedResult(cached) : null;
    if (cachedResult && Array.isArray(cachedResult.task_ids)) {
      applyAiScores(cachedResult, tasksScoredBy(cachedResult.task_ids, activeTasks));
      return;
    }

    const result = await aiScorer.scoreTasks(activeTasks, config);

    if (result) {
      // per_event ids index the list that was scored: keep its task ids so a later cache hit
      // still lands on the same tasks after the active list has changed.
      const taskIds = activeTasks.map((task) => task.id);
      db.setAiCache(currentHash, JSON.stringify({ ...result, task_ids: taskIds }));
      applyAiScores(result, activeTasks);
    }
  } catch (err) {
    errors.push({ source: 'ai', message: err.message });
  }
}

// An unreadable cache row is a miss: scoring again rewrites it.
function readCachedResult(cached) {
  try {
    return JSON.parse(cached.response_json);
  } catch {
    return null;
  }
}

// Rebuild the scored list in its original order; a task no longer active leaves a gap.
function tasksScoredBy(taskIds, activeTasks) {
  const activeById = new Map(activeTasks.map((task) => [task.id, task]));
  return taskIds.map((id) => activeById.get(id) || null);
}

function applyAiScores(aiResult, activeTasks) {
  if (!aiResult || !aiResult.per_event) {
    return;
  }

  for (const event of aiResult.per_event) {
    const idx = event.id - 1; // AI uses 1-based index from prompt
    const task = activeTasks[idx];
    if (!task) {
      console.warn(`[ai] per_event id=${event.id} has no matching active task`);
      continue;
    }
    db.updateAiScores(task.id, {
      stress: event.stress,
      category: event.category,
      reasoning: event.reasoning,
      cognitive_type: event.cognitive_type,
    });
  }

  if (typeof aiResult.global_stress === 'number') {
    db.saveGlobalScore(aiResult.global_stress / 10);
  }
}

async function fetchWithErrorCapture(fetchFn, source, errors) {
  try {
    return await fetchFn();
  } catch (err) {
    errors.push({ source, message: err.message });
    return [];
  }
}

if (require.main === module) {
  const { loadConfig } = require('../config/loader');

  sync(loadConfig())
    .then((result) => {
      console.log(
        `Sync complete: gcal=${result.gcal}, gtasks=${result.gtasks}, jira=${result.jira}, outlook=${result.outlook}`,
      );
      if (result.errors.length > 0) {
        console.error('Errors:', result.errors);
      }
      db.close();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Sync failed:', err);
      db.close();
      process.exit(1);
    });
}

module.exports = { sync, computeEventsHash, applyAiScores };
