'use strict';

const db = require('../store/db');
const gcal = require('../integrations/google-calendar');
const jira = require('../integrations/jira');
const aiScorer = require('../ai/ai-scorer');
const crypto = require('crypto');

function computeEventsHash(tasks) {
  const data = tasks
    .map((t) => `${t.id}|${t.title}|${t.due_at}|${t.priority}`)
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(data).digest('hex');
}

function shouldRecalcAi(config) {
  const cache = db.getDb().prepare('SELECT computed_at FROM ai_cache ORDER BY computed_at DESC LIMIT 1').get();
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

  const jiraIssues = await fetchWithErrorCapture(
    () => jira.fetchIssues(config),
    'jira',
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

    if (cached && !needsRecalc) {
      applyAiScores(JSON.parse(cached.response_json));
      return;
    }

    const activeTasks = db.getActiveTasks(config.sync.lookahead_hours * 3600000);
    const result = await aiScorer.scoreTasks(activeTasks, config);

    if (result) {
      db.setAiCache(currentHash, JSON.stringify(result));
      applyAiScores(result);
    }
  } catch (err) {
    errors.push({ source: 'ai', message: err.message });
  }
}

function applyAiScores(aiResult) {
  if (!aiResult || !aiResult.per_event) {
    return;
  }

  for (const event of aiResult.per_event) {
    db.updateAiScores(event.id, {
      stress: event.stress,
      category: event.category,
      reasoning: event.reasoning,
    });
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
  const { DEFAULTS } = require('../config/defaults');

  sync(DEFAULTS)
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

module.exports = { sync, computeEventsHash };
