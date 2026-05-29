'use strict';

const db = require('../store/db');

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

function computeTaskUrgency(
  task,
  { k = DEFAULT_K, priorityWeights = DEFAULT_PRIORITY_WEIGHTS } = {},
) {
  if (task.is_done) {
    return null;
  }

  if (task.due_at === null || task.due_at === undefined) {
    return {
      id: task.id,
      title: task.title,
      due_at: null,
      start_at: task.start_at || null,
      urgency_score: 0.1,
      hours_remaining: null,
      priority: task.priority,
      source: task.source,
      web_url: task.web_url || null,
      ai_stress: task.ai_stress || null,
      ai_category: task.ai_category || null,
    };
  }

  const hoursRemaining = (task.due_at - Date.now()) / MS_PER_HOUR;

  if (hoursRemaining < 0) {
    return {
      id: task.id,
      title: task.title,
      due_at: task.due_at,
      start_at: task.start_at || null,
      urgency_score: 1.0,
      hours_remaining: hoursRemaining,
      priority: task.priority,
      source: task.source,
      web_url: task.web_url || null,
      ai_stress: task.ai_stress || null,
      ai_category: task.ai_category || null,
    };
  }

  const weight = task.ai_stress ? task.ai_stress / 5 : priorityWeights[task.priority - 1] || 1.0;

  const urgencyRaw = weight / Math.max(hoursRemaining, 0.5);
  const urgencyScore = 1 - Math.exp(-k * urgencyRaw);

  return {
    id: task.id,
    title: task.title,
    due_at: task.due_at,
    start_at: task.start_at || null,
    urgency_score: Math.round(urgencyScore * 1000) / 1000,
    hours_remaining: Math.round(hoursRemaining * 10) / 10,
    priority: task.priority,
    source: task.source,
    web_url: task.web_url || null,
    ai_stress: task.ai_stress || null,
    ai_category: task.ai_category || null,
  };
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

/**
 * Compute the mechanical score and return rich diagnostics about how the
 * result was reached. Used by the score-explainability breakdown.
 */
function describeMechanicalScore(scored, priorityWeights) {
  if (scored.length === 0) {
    return {
      score: 0,
      reason_key: 'empty',
      base: 0,
      active_count: 0,
      ooo_filtered_count: 0,
      volume_amp_applied: false,
      effective_volume: 0,
      calendar_count: 0,
      backlog_count: 0,
    };
  }

  // Drop OOO/vacation tasks before aggregation and volume counting — they
  // represent absence, not load. Without this filter, a week of all-day
  // "ferie" events saturates the volume amplifier and pegs mechanical at 1.0.
  const active = scored.filter((t) => t.ai_category !== 'off');
  const oooCount = scored.length - active.length;

  if (active.length === 0) {
    return {
      score: 0,
      reason_key: 'all_off',
      base: 0,
      active_count: 0,
      ooo_filtered_count: oooCount,
      volume_amp_applied: false,
      effective_volume: 0,
      calendar_count: 0,
      backlog_count: 0,
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const task of active) {
    const weight = task.ai_stress ? task.ai_stress / 5 : priorityWeights[task.priority - 1] || 1.0;
    weightedSum += task.urgency_score * weight;
    totalWeight += weight;
  }

  const rawBase = totalWeight > 0 ? weightedSum / totalWeight : 0;
  let finalBase = rawBase;

  const calendarCount = active.filter((t) => t.source === 'gcal').length;
  const backlogCount = active.length - calendarCount;
  const effectiveVolume = calendarCount + backlogCount * BACKLOG_VOLUME_WEIGHT;

  // Volume amplification only applies when there is already real urgency to
  // compound. A calendar full of distant events (low urgency) does not
  // manufacture stress — that would peg mechanical at 1.0 for any user with
  // a populated multi-day calendar regardless of actual proximity.
  let volumeAmpApplied = false;
  if (rawBase >= VOLUME_AMP_MIN_BASE) {
    const excessEvents = Math.max(0, effectiveVolume - VOLUME_THRESHOLD);
    const volumeBoost = excessEvents * VOLUME_AMPLIFIER;
    if (volumeBoost > 0) {
      finalBase = Math.min(1, rawBase + volumeBoost * (1 - rawBase));
      volumeAmpApplied = true;
    }
  }

  const reasonKey = volumeAmpApplied
    ? 'volume_amplified'
    : rawBase < VOLUME_AMP_MIN_BASE
      ? 'no_imminent_urgency'
      : 'urgency_below_volume_threshold';

  return {
    score: Math.round(finalBase * 1000) / 1000,
    reason_key: reasonKey,
    base: Math.round(rawBase * 1000) / 1000,
    active_count: active.length,
    ooo_filtered_count: oooCount,
    volume_amp_applied: volumeAmpApplied,
    effective_volume: Math.round(effectiveVolume * 10) / 10,
    calendar_count: calendarCount,
    backlog_count: backlogCount,
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
  }));
}

function computeGlobalScore(tasks, options = {}) {
  const { priorityWeights = DEFAULT_PRIORITY_WEIGHTS } = options;
  const computedAt = Date.now();

  const scored = tasks
    .map((task) => computeTaskUrgency(task, options))
    .filter((result) => result !== null);

  if (scored.length === 0) {
    return {
      global_score: 0,
      tasks: [],
      computed_at: computedAt,
      breakdown: {
        global_score: 0,
        ai: null,
        mechanical: describeMechanicalScore([], priorityWeights),
        blend: { ai_weight: AI_BLEND_WEIGHT, mechanical_weight: MECHANICAL_BLEND_WEIGHT },
        top_drivers: [],
        computed_at: computedAt,
      },
    };
  }

  const mechanicalDetail = describeMechanicalScore(scored, priorityWeights);
  const mechanicalScore = mechanicalDetail.score;

  // Check for recent AI score — it reflects true psychological load
  let aiScore = options.aiScore || null;
  if (!aiScore) {
    try {
      aiScore = db.getLatestAiScore();
    } catch {
      // DB not available (e.g. in tests), fall through to mechanical
    }
  }

  const aiFresh = aiScore && computedAt - aiScore.computed_at < AI_SCORE_MAX_AGE_MS;

  let globalScore;
  let aiBreakdown = null;

  if (aiFresh) {
    const aiNormalized = aiScore.global_stress / 10;
    // AI is authoritative, but blend with mechanical for recency sensitivity
    globalScore =
      Math.round(
        (aiNormalized * AI_BLEND_WEIGHT + mechanicalScore * MECHANICAL_BLEND_WEIGHT) * 1000,
      ) / 1000;
    aiBreakdown = {
      global_stress: aiScore.global_stress,
      normalized: aiNormalized,
      computed_at: aiScore.computed_at,
      age_ms: computedAt - aiScore.computed_at,
      fresh: true,
    };
  } else {
    globalScore = mechanicalScore;
    if (aiScore) {
      aiBreakdown = {
        global_stress: aiScore.global_stress,
        normalized: aiScore.global_stress / 10,
        computed_at: aiScore.computed_at,
        age_ms: computedAt - aiScore.computed_at,
        fresh: false,
      };
    }
  }

  const sortedTasks = scored.sort((a, b) => b.urgency_score - a.urgency_score);

  return {
    global_score: globalScore,
    tasks: sortedTasks,
    computed_at: computedAt,
    breakdown: {
      global_score: globalScore,
      ai: aiBreakdown,
      mechanical: mechanicalDetail,
      blend: aiFresh
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
  VOLUME_THRESHOLD,
  VOLUME_AMPLIFIER,
  BACKLOG_VOLUME_WEIGHT,
  VOLUME_AMP_MIN_BASE,
  TOP_DRIVERS_COUNT,
  getLookaheadEnd,
};
