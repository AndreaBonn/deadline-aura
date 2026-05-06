'use strict';

require('dotenv').config();

const db = require('../store/db');
const gcal = require('../integrations/google-calendar');
const jira = require('../integrations/jira');
const aiScorer = require('../ai/ai-scorer');
const crypto = require('crypto');

// SHA-256 is used here purely as a change-detection fingerprint, not for
// security purposes. Collision probability (~2^-128) is negligible for this
// use case and does not require explicit collision handling.
function computeEventsHash(tasks) {
  const data = tasks
    .map((t) => `${t.id}|${t.title}|${t.due_at}|${t.priority}`)
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(data).digest('hex');
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
  let jiraCount = 0;

  const gcalEvents = await fetchWithErrorCapture(
    () => gcal.fetchEvents(config),
    'google_calendar',
    errors,
  );

  const jiraIssues = await fetchWithErrorCapture(() => jira.fetchIssues(config), 'jira', errors);

  const database = db.getDb();
  const upsertMany = database.transaction((tasks, source) => {
    const activeIds = tasks.map((t) => t.id);
    db.markStale(source, activeIds);

    for (const task of tasks) {
      db.upsertTask(task);
    }

    return tasks.length;
  });

  if (gcalEvents.length > 0 || config.sources.google_calendar.enabled) {
    gcalCount = upsertMany(gcalEvents, 'gcal');
  }

  if (jiraIssues.length > 0 || config.sources.jira.enabled) {
    jiraCount = upsertMany(jiraIssues, 'jira');
  }

  const allTasks = [...gcalEvents, ...jiraIssues];

  if (config.ai?.enabled && allTasks.length > 0) {
    await runAiScoring(allTasks, config, errors);
  }

  return { gcal: gcalCount, jira: jiraCount, errors };
}

async function runAiScoring(tasks, config, errors) {
  try {
    const currentHash = computeEventsHash(tasks);
    const cached = db.getAiCache(currentHash);

    const needsRecalc = shouldRecalcAi(config);

    const activeTasks = db.getActiveTasks(config.sync.lookahead_hours * 3600000);

    if (cached && !needsRecalc) {
      applyAiScores(JSON.parse(cached.response_json), activeTasks);
      return;
    }

    const result = await aiScorer.scoreTasks(activeTasks, config);

    if (result) {
      db.setAiCache(currentHash, JSON.stringify(result));
      applyAiScores(result, activeTasks);
    }
  } catch (err) {
    errors.push({ source: 'ai', message: err.message });
  }
}

function applyAiScores(aiResult, activeTasks) {
  if (!aiResult || !aiResult.per_event) {
    return;
  }

  for (const event of aiResult.per_event) {
    const idx = event.id - 1; // AI uses 1-based index from prompt
    const task = activeTasks[idx];
    if (!task) {
      console.warn(`[ai] per_event id=${event.id} has no matching task (index out of bounds)`);
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
      console.log(`Sync complete: gcal=${result.gcal}, jira=${result.jira}`);
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
