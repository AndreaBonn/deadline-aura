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
  const fetched = await fetchAllSources(config, errors);
  const counts = persistAllSources(fetched, config, errors);

  const allTasks = [
    ...fetched.gcalEvents,
    ...fetched.googleTasks,
    ...fetched.jiraIssues,
    ...fetched.jiraPartialIssues,
    ...fetched.outlookEvents,
  ];

  if (config.ai?.enabled && allTasks.length > 0) {
    await runAiScoring(allTasks, config, errors);
  }

  return { ...counts, errors };
}

// Replace a source: whatever it no longer returns is marked stale.
const replaceSourceTasks = (tasks, source) => {
  db.markStale(
    source,
    tasks.map((task) => task.id),
  );
  tasks.forEach((task) => db.upsertTask(task));
  return tasks.length;
};

// Each source decides on its own whether an empty or failed fetch may touch the stored tasks.
function persistAllSources(fetched, config, errors) {
  const failed = new Set(errors.map((error) => error.source));
  const replace = db.getDb().transaction(replaceSourceTasks);

  return {
    gcal: persistGcal(fetched.gcalEvents, config, failed, replace),
    gtasks: persistGtasks(fetched.googleTasks, config, failed, replace),
    jira: persistJira(fetched, config, failed, replace),
    outlook: persistOutlook(fetched.outlookEvents, config, failed, replace),
  };
}

function persistGcal(events, config, failed, replace) {
  if (failed.has('google_calendar')) {
    return 0;
  }
  const hasEvents = events.length > 0;
  return hasEvents || config.sources.google_calendar.enabled ? replace(events, 'gcal') : 0;
}

// Google Tasks has no switch of its own: it follows the calendar one.
function persistGtasks(tasks, config, failed, replace) {
  if (failed.has('google_tasks') || !config.sources.google_calendar.enabled) {
    return 0;
  }
  return replace(tasks, 'gtasks');
}

function persistOutlook(events, config, failed, replace) {
  if (failed.has('outlook')) {
    return 0;
  }
  return events.length > 0 || config.sources.outlook?.enabled ? replace(events, 'outlook') : 0;
}

function persistJira({ jiraIssues, jiraPartialIssues }, config, failed, replace) {
  if (!failed.has('jira') && (jiraIssues.length > 0 || config.sources.jira.enabled)) {
    return replace(jiraIssues, 'jira');
  }
  if (jiraPartialIssues.length === 0) {
    return 0;
  }
  // Refresh what the healthy sites returned, but mark nothing stale: the issues of the
  // failed site would otherwise vanish from the desktop.
  db.getDb().transaction((tasks) => tasks.forEach((task) => db.upsertTask(task)))(
    jiraPartialIssues,
  );
  return jiraPartialIssues.length;
}

// Issues from the Jira sites that answered when another site did not travel on the error.
async function fetchJira(config) {
  try {
    return { issues: await jira.fetchIssues(config), partialIssues: [] };
  } catch (err) {
    return { issues: [], partialIssues: err.partialIssues || [], error: err };
  }
}

async function fetchAllSources(config, errors) {
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
  const jiraResult = await fetchJira(config);
  if (jiraResult.error) {
    errors.push({ source: 'jira', message: jiraResult.error.message });
  }
  const outlookEvents = await fetchWithErrorCapture(
    () => outlook.fetchEvents(config),
    'outlook',
    errors,
  );
  return {
    gcalEvents,
    googleTasks,
    jiraIssues: jiraResult.issues,
    jiraPartialIssues: jiraResult.partialIssues,
    outlookEvents,
  };
}

async function runAiScoring(tasks, config, errors) {
  try {
    const currentHash = computeEventsHash(tasks);
    const cached = db.getAiCache(currentHash);

    const needsRecalc = shouldRecalcAi(config);

    const activeTasks = db.getActiveTasks(config.sync.lookahead_hours * 3600000);

    const cachedResult = cached && !needsRecalc ? readCachedResult(cached) : null;
    if (cachedResult && Array.isArray(cachedResult.task_ids)) {
      const scoredTasks = tasksScoredBy(cachedResult.task_ids, activeTasks);
      const stillActive = scoredTasks.filter(Boolean).length;
      console.log(
        `[ai] cache hit: ${stillActive} of ${scoredTasks.length} scored tasks still active`,
      );
      applyAiScores(cachedResult, scoredTasks);
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
    // The parse error quotes the row, which holds task titles: log the fact only.
    console.warn('[ai] unreadable cache row, rescoring');
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
