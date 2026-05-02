'use strict';

const db = require('../store/db');

const DEFAULT_PRIORITY_WEIGHTS = [2.0, 1.5, 1.0, 0.5];
const DEFAULT_K = 0.05;
const MS_PER_HOUR = 3600000;

function computeTaskUrgency(task, { k = DEFAULT_K, priorityWeights = DEFAULT_PRIORITY_WEIGHTS } = {}) {
  if (task.is_done) {
    return null;
  }

  if (task.due_at === null || task.due_at === undefined) {
    return {
      id: task.id,
      title: task.title,
      urgency_score: 0.1,
      hours_remaining: null,
      priority: task.priority,
      source: task.source,
      ai_stress: task.ai_stress || null,
      ai_category: task.ai_category || null,
    };
  }

  const hoursRemaining = (task.due_at - Date.now()) / MS_PER_HOUR;

  if (hoursRemaining < 0) {
    return {
      id: task.id,
      title: task.title,
      urgency_score: 1.0,
      hours_remaining: hoursRemaining,
      priority: task.priority,
      source: task.source,
      ai_stress: task.ai_stress || null,
      ai_category: task.ai_category || null,
    };
  }

  const weight = task.ai_stress
    ? task.ai_stress / 5
    : priorityWeights[task.priority - 1] || 1.0;

  const urgencyRaw = weight / Math.max(hoursRemaining, 0.5);
  const urgencyScore = 1 - Math.exp(-k * urgencyRaw);

  return {
    id: task.id,
    title: task.title,
    urgency_score: Math.round(urgencyScore * 1000) / 1000,
    hours_remaining: Math.round(hoursRemaining * 10) / 10,
    priority: task.priority,
    source: task.source,
    ai_stress: task.ai_stress || null,
    ai_category: task.ai_category || null,
  };
}

function computeGlobalScore(tasks, options = {}) {
  const { priorityWeights = DEFAULT_PRIORITY_WEIGHTS } = options;

  const scored = tasks
    .map((task) => computeTaskUrgency(task, options))
    .filter((result) => result !== null);

  if (scored.length === 0) {
    return {
      global_score: 0,
      tasks: [],
      computed_at: Date.now(),
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const task of scored) {
    const weight = task.ai_stress
      ? task.ai_stress / 5
      : priorityWeights[task.priority - 1] || 1.0;

    weightedSum += task.urgency_score * weight;
    totalWeight += weight;
  }

  const globalScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 1000) / 1000 : 0;

  return {
    global_score: globalScore,
    tasks: scored.sort((a, b) => b.urgency_score - a.urgency_score),
    computed_at: Date.now(),
  };
}

function run(options = {}) {
  const { lookaheadHours = 72 } = options;
  const tasks = db.getActiveTasks(lookaheadHours * MS_PER_HOUR);
  const result = computeGlobalScore(tasks, options);

  db.saveGlobalScore(result.global_score);

  return result;
}

module.exports = {
  computeTaskUrgency,
  computeGlobalScore,
  run,
  DEFAULT_PRIORITY_WEIGHTS,
  DEFAULT_K,
};
