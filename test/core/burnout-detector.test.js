'use strict';

const {
  detectBurnoutRisk,
  extractDailyFactors,
  maxConsecutive,
  areAdjacentDays,
} = require('../../core/burnout-detector');

function makeAiCacheRow({ date, stress, recovery, emotional, globalStress }) {
  return {
    response_json: JSON.stringify({
      global_stress: globalStress || stress,
      daily_breakdown: [{ date, stress }],
      cognitive_factors: {
        recovery_adequacy: recovery || 'sufficient',
        emotional_load: emotional || 'low',
        context_switching: 'low',
        fragmentation: 'low',
        deep_work_ratio: 0.5,
        decision_fatigue_risk: 'low',
      },
    }),
    computed_at: new Date(date + 'T12:00:00').getTime(),
  };
}

describe('burnout-detector', () => {
  describe('areAdjacentDays', () => {
    it('returns true for consecutive days', () => {
      expect(areAdjacentDays('2026-05-01', '2026-05-02')).toBe(true);
    });

    it('returns true regardless of order', () => {
      expect(areAdjacentDays('2026-05-02', '2026-05-01')).toBe(true);
    });

    it('returns false for days with gap', () => {
      expect(areAdjacentDays('2026-05-01', '2026-05-03')).toBe(false);
    });

    it('returns false for same day', () => {
      expect(areAdjacentDays('2026-05-01', '2026-05-01')).toBe(false);
    });

    it('handles month boundary', () => {
      expect(areAdjacentDays('2026-04-30', '2026-05-01')).toBe(true);
    });
  });

  describe('extractDailyFactors', () => {
    it('returns empty array for empty input', () => {
      expect(extractDailyFactors([])).toEqual([]);
    });

    it('extracts daily factors from ai_cache rows', () => {
      const rows = [
        makeAiCacheRow({ date: '2026-05-01', stress: 5, recovery: 'sufficient' }),
        makeAiCacheRow({ date: '2026-05-02', stress: 8, recovery: 'insufficient' }),
      ];
      const result = extractDailyFactors(rows);
      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2026-05-01');
      expect(result[1].stress).toBe(8);
    });

    it('deduplicates by date keeping first occurrence', () => {
      const rows = [
        makeAiCacheRow({ date: '2026-05-01', stress: 5 }),
        makeAiCacheRow({ date: '2026-05-01', stress: 9 }),
      ];
      const result = extractDailyFactors(rows);
      expect(result).toHaveLength(1);
      expect(result[0].stress).toBe(5);
    });

    it('skips rows with malformed JSON', () => {
      const rows = [
        { response_json: 'not-json', computed_at: Date.now() },
        makeAiCacheRow({ date: '2026-05-01', stress: 5 }),
      ];
      const result = extractDailyFactors(rows);
      expect(result).toHaveLength(1);
    });

    it('falls back to computed_at date when no daily_breakdown', () => {
      const row = {
        response_json: JSON.stringify({
          global_stress: 6,
          cognitive_factors: { recovery_adequacy: 'sufficient' },
        }),
        computed_at: new Date('2026-05-03T12:00:00').getTime(),
      };
      const result = extractDailyFactors([row]);
      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2026-05-03');
    });
  });

  describe('maxConsecutive', () => {
    it('returns 0 for empty array', () => {
      expect(maxConsecutive([], () => true)).toBe(0);
    });

    it('counts consecutive adjacent days', () => {
      const days = [
        { date: '2026-05-01', v: true },
        { date: '2026-05-02', v: true },
        { date: '2026-05-03', v: true },
        { date: '2026-05-04', v: false },
        { date: '2026-05-05', v: true },
      ];
      expect(maxConsecutive(days, (d) => d.v)).toBe(3);
    });

    it('returns 0 when no matches', () => {
      const days = [
        { date: '2026-05-01', v: false },
        { date: '2026-05-02', v: false },
      ];
      expect(maxConsecutive(days, (d) => d.v)).toBe(0);
    });

    it('resets streak on date gap even if predicate holds', () => {
      const days = [
        { date: '2026-05-01', v: true },
        { date: '2026-05-02', v: true },
        { date: '2026-05-05', v: true }, // gap: 3 days
        { date: '2026-05-06', v: true },
      ];
      expect(maxConsecutive(days, (d) => d.v)).toBe(2);
    });

    it('handles single-day streak', () => {
      const days = [
        { date: '2026-05-01', v: false },
        { date: '2026-05-02', v: true },
        { date: '2026-05-03', v: false },
      ];
      expect(maxConsecutive(days, (d) => d.v)).toBe(1);
    });
  });

  describe('detectBurnoutRisk', () => {
    it('returns no risk with empty data', () => {
      const result = detectBurnoutRisk([], {});
      expect(result.isAtRisk).toBe(false);
      expect(result.triggers).toHaveLength(0);
      expect(result.severity).toBe('none');
    });

    it('returns no risk with insufficient days', () => {
      const rows = [
        makeAiCacheRow({ date: '2026-05-01', stress: 9, recovery: 'insufficient' }),
        makeAiCacheRow({ date: '2026-05-02', stress: 9, recovery: 'insufficient' }),
      ];
      const result = detectBurnoutRisk(rows, {});
      expect(result.isAtRisk).toBe(false);
    });

    it('triggers on high average stress over 3+ adjacent days', () => {
      const rows = [
        makeAiCacheRow({ date: '2026-05-01', stress: 8 }),
        makeAiCacheRow({ date: '2026-05-02', stress: 9 }),
        makeAiCacheRow({ date: '2026-05-03', stress: 7 }),
      ];
      const result = detectBurnoutRisk(rows, {});
      expect(result.isAtRisk).toBe(true);
      expect(result.triggers[0]).toContain('Stress medio');
    });

    it('does not trigger when stress below threshold', () => {
      const rows = [
        makeAiCacheRow({ date: '2026-05-01', stress: 4 }),
        makeAiCacheRow({ date: '2026-05-02', stress: 5 }),
        makeAiCacheRow({ date: '2026-05-03', stress: 3 }),
      ];
      const result = detectBurnoutRisk(rows, {});
      expect(result.isAtRisk).toBe(false);
    });

    it('respects custom stress_threshold from options', () => {
      const rows = [
        makeAiCacheRow({ date: '2026-05-01', stress: 5 }),
        makeAiCacheRow({ date: '2026-05-02', stress: 5 }),
        makeAiCacheRow({ date: '2026-05-03', stress: 5 }),
      ];
      const lowThreshold = detectBurnoutRisk(rows, { stress_threshold: 4 });
      expect(lowThreshold.isAtRisk).toBe(true);

      const highThreshold = detectBurnoutRisk(rows, { stress_threshold: 6 });
      expect(highThreshold.isAtRisk).toBe(false);
    });

    it('respects custom consecutive_days from options', () => {
      const rows = [
        makeAiCacheRow({ date: '2026-05-01', stress: 5, recovery: 'insufficient' }),
        makeAiCacheRow({ date: '2026-05-02', stress: 5, recovery: 'insufficient' }),
      ];
      const result = detectBurnoutRisk(rows, { consecutive_days: 2 });
      expect(result.isAtRisk).toBe(true);
      expect(result.triggers.some((t) => t.includes('Recupero insufficiente'))).toBe(true);
    });

    it('triggers on 3 consecutive days of insufficient recovery', () => {
      const rows = [
        makeAiCacheRow({ date: '2026-05-01', stress: 5, recovery: 'insufficient' }),
        makeAiCacheRow({ date: '2026-05-02', stress: 5, recovery: 'insufficient' }),
        makeAiCacheRow({ date: '2026-05-03', stress: 5, recovery: 'insufficient' }),
      ];
      const result = detectBurnoutRisk(rows, {});
      expect(result.isAtRisk).toBe(true);
      expect(result.triggers.some((t) => t.includes('Recupero insufficiente'))).toBe(true);
    });

    it('does not trigger recovery when days have gap', () => {
      const rows = [
        makeAiCacheRow({ date: '2026-05-01', stress: 5, recovery: 'insufficient' }),
        makeAiCacheRow({ date: '2026-05-02', stress: 5, recovery: 'insufficient' }),
        makeAiCacheRow({ date: '2026-05-05', stress: 5, recovery: 'insufficient' }), // gap
      ];
      const result = detectBurnoutRisk(rows, {});
      expect(result.triggers.some((t) => t.includes('Recupero insufficiente'))).toBe(false);
    });

    it('triggers on 3 consecutive days of high emotional load', () => {
      const rows = [
        makeAiCacheRow({ date: '2026-05-01', stress: 5, emotional: 'high' }),
        makeAiCacheRow({ date: '2026-05-02', stress: 5, emotional: 'high' }),
        makeAiCacheRow({ date: '2026-05-03', stress: 5, emotional: 'high' }),
      ];
      const result = detectBurnoutRisk(rows, {});
      expect(result.isAtRisk).toBe(true);
      expect(result.triggers.some((t) => t.includes('Carico emotivo'))).toBe(true);
    });

    it('returns severity "high" when 2+ triggers active', () => {
      const rows = [
        makeAiCacheRow({ date: '2026-05-01', stress: 8, recovery: 'insufficient', emotional: 'high' }),
        makeAiCacheRow({ date: '2026-05-02', stress: 9, recovery: 'insufficient', emotional: 'high' }),
        makeAiCacheRow({ date: '2026-05-03', stress: 8, recovery: 'insufficient', emotional: 'high' }),
      ];
      const result = detectBurnoutRisk(rows, {});
      expect(result.severity).toBe('high');
      expect(result.triggers.length).toBeGreaterThanOrEqual(2);
    });

    it('returns severity "moderate" with exactly 1 trigger', () => {
      const rows = [
        makeAiCacheRow({ date: '2026-05-01', stress: 5, recovery: 'insufficient' }),
        makeAiCacheRow({ date: '2026-05-02', stress: 5, recovery: 'insufficient' }),
        makeAiCacheRow({ date: '2026-05-03', stress: 5, recovery: 'insufficient' }),
      ];
      const result = detectBurnoutRisk(rows, {});
      expect(result.severity).toBe('moderate');
      expect(result.triggers).toHaveLength(1);
    });

    it('handles null aiCacheHistory gracefully', () => {
      const result = detectBurnoutRisk(null, {});
      expect(result.isAtRisk).toBe(false);
    });
  });
});
