'use strict';

const db = require('../store/db');
const { isCalendarSource } = require('./calendar-sources');

const DEFAULT_PRIORITY_WEIGHTS = [2.0, 1.5, 1.0, 0.5];
const DEFAULT_K = 0.05;
const MS_PER_HOUR = 3600000;
const AI_SCORE_MAX_AGE_MS = 12 * 3600000; // AI score valid for 12 hours
const VOLUME_THRESHOLD = 5; // Above this, volume amplifies mechanical score
const VOLUME_AMPLIFIER = 0.15; // Per-event amplification above threshold
const BACKLOG_VOLUME_WEIGHT = 0.2; // Backlog tasks count 20% for volume calc
const VOLUME_AMP_MIN_BASE = 0.3; // Volume amplifies existing urgency; without urgency, idle events do not create stress
const AI_BLEND_WEIGHT = 0.7; // Weight of AI score in the final blend
const MECHANICAL_BLEND_WEIGHT = 0.3; // Weight of mechanical score in the final blend
const TOP_DRIVERS_COUNT = 3; // How many top tasks to include in the breakdown

function taskWeight(task, priorityWeights) {
  return task.ai_stress ? task.ai_stress / 5 : priorityWeights[task.priority - 1] || 1.0;
}

function scoredTask(task, fields) {
  return {
    id: task.id,
    title: task.title,
    due_at: fields.due_at,
    start_at: task.start_at || null,
    urgency_score: fields.urgency_score,
    hours_remaining: fields.hours_remaining,
    priority: task.priority,
    source: task.source,
    web_url: task.web_url || null,
    ai_stress: task.ai_stress || null,
    ai_category: task.ai_category || null,
  };
}

function computeTaskUrgency(
  task,
  { k = DEFAULT_K, priorityWeights = DEFAULT_PRIORITY_WEIGHTS } = {},
) {
  if (task.is_done) {
    return null;
  }

  if (task.due_at === null || task.due_at === undefined) {
    return scoredTask(task, { due_at: null, urgency_score: 0.1, hours_remaining: null });
  }

  const hoursRemaining = (task.due_at - Date.now()) / MS_PER_HOUR;

  if (hoursRemaining < 0) {
    return scoredTask(task, {
      due_at: task.due_at,
      urgency_score: 1.0,
      hours_remaining: hoursRemaining,
    });
  }

  const urgencyRaw = taskWeight(task, priorityWeights) / Math.max(hoursRemaining, 0.5);
  const urgencyScore = 1 - Math.exp(-k * urgencyRaw);

  return scoredTask(task, {
    due_at: task.due_at,
    urgency_score: Math.round(urgencyScore * 1000) / 1000,
    hours_remaining: Math.round(hoursRemaining * 10) / 10,
  });
}

/**
 * Compute the mechanical score from already-scored tasks.
 *
 * Returns a single number to preserve the existing signature. For a structured
 * breakdown (base, volume boost, off filter), use describeMechanicalScore.
 */
function computeMechanicalScore(scored, priorityWeights) {
  return describeMechanicalScore(scored, priorityWeights).score;
}

function emptyMechanicalDetail(reasonKey, oooCount) {
  return {
    score: 0,
    reason_key: reasonKey,
    base: 0,
    active_count: 0,
    ooo_filtered_count: oooCount,
    volume_amp_applied: false,
    effective_volume: 0,
    calendar_count: 0,
    backlog_count: 0,
  };
}

function weightedBase(active, priorityWeights) {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const task of active) {
    const weight = taskWeight(task, priorityWeights);
    weightedSum += task.urgency_score * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

function amplifyByVolume(rawBase, active) {
  const calendarCount = active.filter((task) => isCalendarSource(task.source)).length;
  const backlogCount = active.length - calendarCount;
  const effectiveVolume = calendarCount + backlogCount * BACKLOG_VOLUME_WEIGHT;
  const excessEvents = Math.max(0, effectiveVolume - VOLUME_THRESHOLD);
  const volumeBoost = excessEvents * VOLUME_AMPLIFIER;
  const applied = rawBase >= VOLUME_AMP_MIN_BASE && volumeBoost > 0;
  const finalBase = applied ? Math.min(1, rawBase + volumeBoost * (1 - rawBase)) : rawBase;
  return { calendarCount, backlogCount, effectiveVolume, applied, finalBase };
}

function mechanicalReasonKey(rawBase, volumeAmpApplied) {
  if (volumeAmpApplied) {
    return 'volume_amplified';
  }
  return rawBase < VOLUME_AMP_MIN_BASE ? 'no_imminent_urgency' : 'urgency_below_volume_threshold';
}

/**
 * Compute the mechanical score and return rich diagnostics about how the
 * result was reached. Used by the score-explainability breakdown.
 */
function describeMechanicalScore(scored, priorityWeights) {
  const active = scored.filter((task) => task.ai_category !== 'off');
  const oooCount = scored.length - active.length;
  if (active.length === 0) {
    return emptyMechanicalDetail(scored.length === 0 ? 'empty' : 'all_off', oooCount);
  }
  const rawBase = weightedBase(active, priorityWeights);
  const volume = amplifyByVolume(rawBase, active);
  return {
    score: Math.round(volume.finalBase * 1000) / 1000,
    reason_key: mechanicalReasonKey(rawBase, volume.applied),
    base: Math.round(rawBase * 1000) / 1000,
    active_count: active.length,
    ooo_filtered_count: oooCount,
    volume_amp_applied: volume.applied,
    effective_volume: Math.round(volume.effectiveVolume * 10) / 10,
    calendar_count: volume.calendarCount,
    backlog_count: volume.backlogCount,
  };
}

function pickTopDrivers(sortedTasks, count) {
  return sortedTasks.slice(0, count).map((t) => ({
    id: t.id,
    title: t.title,
    source: t.source,
    urgency_score: t.urgency_score,
    ai_stress: t.ai_stress || null,
    ai_category: t.ai_category || null,
    hours_remaining: t.hours_remaining,
    web_url: t.web_url || null,
  }));
}

function emptyGlobalScore(computedAt, priorityWeights) {
  return {
    global_score: 0,
    tasks: [],
    computed_at: computedAt,
    breakdown: {
      global_score: 0,
      ai: null,
      mechanical: describeMechanicalScore([], priorityWeights),
      blend: { ai_weight: 0, mechanical_weight: 1 },
      top_drivers: [],
      computed_at: computedAt,
    },
  };
}

function resolveAiScore(options) {
  if (options.aiScore) {
    return options.aiScore;
  }
  try {
    return db.getLatestAiScore();
  } catch {
    // DB not available (e.g. in tests), fall through to mechanical
    return null;
  }
}

function describeAiScore(aiScore, computedAt) {
  if (!aiScore) {
    return null;
  }
  return {
    global_stress: aiScore.global_stress,
    normalized: aiScore.global_stress / 10,
    computed_at: aiScore.computed_at,
    age_ms: computedAt - aiScore.computed_at,
    fresh: computedAt - aiScore.computed_at < AI_SCORE_MAX_AGE_MS,
  };
}

function computeGlobalScore(tasks, options = {}) {
  const { priorityWeights = DEFAULT_PRIORITY_WEIGHTS } = options;
  const computedAt = Date.now();
  const scored = tasks
    .map((task) => computeTaskUrgency(task, options))
    .filter((result) => result !== null);
  if (scored.length === 0) {
    return emptyGlobalScore(computedAt, priorityWeights);
  }
  const mechanicalDetail = describeMechanicalScore(scored, priorityWeights);
  const aiBreakdown = describeAiScore(resolveAiScore(options), computedAt);
  const globalScore = aiBreakdown?.fresh
    ? Math.round(
        (aiBreakdown.normalized * AI_BLEND_WEIGHT +
          mechanicalDetail.score * MECHANICAL_BLEND_WEIGHT) *
          1000,
      ) / 1000
    : mechanicalDetail.score;
  const sortedTasks = scored.sort((a, b) => b.urgency_score - a.urgency_score);
  return {
    global_score: globalScore,
    tasks: sortedTasks,
    computed_at: computedAt,
    breakdown: {
      global_score: globalScore,
      ai: aiBreakdown,
      mechanical: mechanicalDetail,
      blend: aiBreakdown?.fresh
        ? { ai_weight: AI_BLEND_WEIGHT, mechanical_weight: MECHANICAL_BLEND_WEIGHT }
        : { ai_weight: 0, mechanical_weight: 1 },
      top_drivers: pickTopDrivers(sortedTasks, TOP_DRIVERS_COUNT),
      computed_at: computedAt,
    },
  };
}

function getLookaheadEnd() {
  const now = new Date();
  const minEnd = new Date(now);
  minEnd.setDate(now.getDate() + 7);
  const dayOfWeek = minEnd.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const endDate = new Date(minEnd);
  endDate.setDate(minEnd.getDate() + daysUntilSunday);
  endDate.setHours(23, 59, 59, 999);
  return endDate;
}

function getLookaheadMs() {
  return getLookaheadEnd().getTime() - Date.now();
}

function run(options = {}) {
  const { lookaheadHours } = options;
  const lookaheadMs = getLookaheadMs();
  const configMs = lookaheadHours ? lookaheadHours * MS_PER_HOUR : 0;
  const effectiveMs = Math.max(lookaheadMs, configMs);
  const tasks = db.getActiveTasks(effectiveMs);
  return computeGlobalScore(tasks, options);
}

module.exports = {
  computeTaskUrgency,
  computeGlobalScore,
  computeMechanicalScore,
  describeMechanicalScore,
  run,
  DEFAULT_PRIORITY_WEIGHTS,
  DEFAULT_K,
  AI_SCORE_MAX_AGE_MS,
  AI_BLEND_WEIGHT,
  MECHANICAL_BLEND_WEIGHT,
  TOP_DRIVERS_COUNT,
  getLookaheadEnd,
};
