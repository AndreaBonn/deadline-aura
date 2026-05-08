'use strict';

const DEFAULT_STRESS_THRESHOLD = 7;
const DEFAULT_CONSECUTIVE_DAYS = 3;

/**
 * Extracts per-day cognitive factors from ai_cache history rows.
 *
 * @param {Array<{response_json: string, computed_at: number}>} aiCacheRows
 * @returns {Array<{date: string, cognitive_factors: object, global_stress: number}>}
 */
function extractDailyFactors(aiCacheRows) {
  const byDate = new Map();
  for (const row of aiCacheRows) {
    let parsed;
    try {
      parsed = JSON.parse(row.response_json);
    } catch {
      continue;
    }
    if (!parsed.cognitive_factors) {
      continue;
    }
    const breakdown = parsed.daily_breakdown || [];
    for (const day of breakdown) {
      if (day.date && !byDate.has(day.date)) {
        byDate.set(day.date, {
          date: day.date,
          stress: day.stress,
          cognitive_factors: parsed.cognitive_factors,
          global_stress: parsed.global_stress,
        });
      }
    }
    if (breakdown.length === 0) {
      const dateKey = new Date(row.computed_at).toISOString().slice(0, 10);
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, {
          date: dateKey,
          stress: parsed.global_stress,
          cognitive_factors: parsed.cognitive_factors,
          global_stress: parsed.global_stress,
        });
      }
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Checks if two YYYY-MM-DD date strings are exactly 1 day apart.
 *
 * @param {string} dateA
 * @param {string} dateB
 * @returns {boolean}
 */
function areAdjacentDays(dateA, dateB) {
  const msA = new Date(dateA + 'T00:00:00Z').getTime();
  const msB = new Date(dateB + 'T00:00:00Z').getTime();
  const diffMs = Math.abs(msB - msA);
  const ONE_DAY_MS = 24 * 3600000;
  return diffMs === ONE_DAY_MS;
}

/**
 * Counts maximum consecutive *adjacent* days where a predicate holds.
 * Resets the streak when dates have gaps (e.g. weekend, downtime).
 *
 * @param {Array<{date: string}>} sortedDays - Sorted by date ASC.
 * @param {function} predicate
 * @returns {number}
 */
function maxConsecutive(sortedDays, predicate) {
  let max = 0;
  let current = 0;
  let prevDate = null;
  for (const day of sortedDays) {
    if (!predicate(day)) {
      current = 0;
      prevDate = day.date;
      continue;
    }
    if (prevDate && !areAdjacentDays(prevDate, day.date)) {
      current = 1;
    } else {
      current++;
    }
    if (current > max) {
      max = current;
    }
    prevDate = day.date;
  }
  return max;
}

/**
 * Detects burnout risk from longitudinal AI cache data.
 *
 * @param {Array<{response_json: string, computed_at: number}>} aiCacheHistory
 * @param {{stress_threshold?: number, consecutive_days?: number}} [options]
 * @returns {{isAtRisk: boolean, triggers: string[], severity: string}}
 */
function detectBurnoutRisk(aiCacheHistory, options) {
  const stressThreshold = options?.stress_threshold || DEFAULT_STRESS_THRESHOLD;
  const consecutiveDays = options?.consecutive_days || DEFAULT_CONSECUTIVE_DAYS;
  const triggers = [];

  const dailyFactors = extractDailyFactors(aiCacheHistory || []);

  if (dailyFactors.length >= consecutiveDays) {
    const avgStress =
      dailyFactors.reduce((sum, d) => sum + (d.stress || d.global_stress || 0), 0) /
      dailyFactors.length;
    if (avgStress >= stressThreshold) {
      triggers.push(
        `Stress medio della settimana elevato (${avgStress.toFixed(1)}/10). Considera di delegare o posticipare.`,
      );
    }
  }

  const consecutiveNoRecovery = maxConsecutive(
    dailyFactors,
    (d) => d.cognitive_factors?.recovery_adequacy === 'insufficient',
  );
  if (consecutiveNoRecovery >= consecutiveDays) {
    triggers.push(
      `Recupero insufficiente per ${consecutiveNoRecovery} giorni consecutivi. Servono pause reali.`,
    );
  }

  const consecutiveEmotional = maxConsecutive(
    dailyFactors,
    (d) => d.cognitive_factors?.emotional_load === 'high',
  );
  if (consecutiveEmotional >= consecutiveDays) {
    triggers.push(
      `Carico emotivo alto per ${consecutiveEmotional} giorni consecutivi. Attenzione al sovraccarico.`,
    );
  }

  const severity = triggers.length >= 2 ? 'high' : triggers.length === 1 ? 'moderate' : 'none';

  return {
    isAtRisk: triggers.length > 0,
    triggers,
    severity,
  };
}

module.exports = { detectBurnoutRisk, extractDailyFactors, maxConsecutive, areAdjacentDays };
