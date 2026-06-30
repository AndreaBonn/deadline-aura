const db = require('../../store/db');
const {
  computeTaskUrgency,
  computeGlobalScore,
  DEFAULT_K,
  DEFAULT_PRIORITY_WEIGHTS,
  AI_SCORE_MAX_AGE_MS,
} = require('../../core/deadline-engine');

const MS_PER_HOUR = 3600000;

// These tests assert mechanical-only scoring. The engine falls back to
// db.getLatestAiScore() when no aiScore is passed in options, which would
// otherwise read the real on-disk database and make results environment-
// dependent. Neutralize that fallback so the tests are deterministic.
beforeEach(() => {
  vi.spyOn(db, 'getLatestAiScore').mockReturnValue(null);
});

function makeTask(overrides = {}) {
  return {
    id: 'test_1',
    source: 'gcal',
    title: 'Test Task',
    due_at: Date.now() + 24 * MS_PER_HOUR,
    priority: 3,
    is_done: 0,
    ai_stress: null,
    ai_category: null,
    ...overrides,
  };
}

describe('deadline-engine branch coverage', () => {
  describe('computeTaskUrgency', () => {
    it('returns score 0.1 when due_at is undefined', () => {
      const task = makeTask({ due_at: undefined });
      const result = computeTaskUrgency(task);
      expect(result.urgency_score).toBe(0.1);
      expect(result.hours_remaining).toBeNull();
    });

    it('uses fallback weight 1.0 for priority outside weights array', () => {
      const task = makeTask({ priority: 10, due_at: Date.now() + 4 * MS_PER_HOUR });
      const result = computeTaskUrgency(task);
      expect(result.urgency_score).toBeGreaterThan(0);
      expect(result.urgency_score).toBeLessThan(1);
    });

    it('preserves ai_category in result', () => {
      const task = makeTask({ ai_category: 'work-critical', due_at: Date.now() + 2 * MS_PER_HOUR });
      const result = computeTaskUrgency(task);
      expect(result.ai_category).toBe('work-critical');
    });

    it('sets ai_stress to null when task has falsy ai_stress', () => {
      const task = makeTask({ ai_stress: 0, due_at: Date.now() + 2 * MS_PER_HOUR });
      const result = computeTaskUrgency(task);
      expect(result.ai_stress).toBeNull();
    });

    it('includes overdue task fields correctly', () => {
      const task = makeTask({ due_at: Date.now() - 5 * MS_PER_HOUR, ai_stress: 8 });
      const result = computeTaskUrgency(task);
      expect(result.urgency_score).toBe(1.0);
      expect(result.id).toBe('test_1');
      expect(result.title).toBe('Test Task');
      expect(result.priority).toBe(3);
      expect(result.source).toBe('gcal');
      expect(result.ai_stress).toBe(8);
    });
  });

  describe('computeGlobalScore', () => {
    it('uses fallback weight for priority outside array', () => {
      const tasks = [makeTask({ id: 'a', priority: 10, due_at: Date.now() + 4 * MS_PER_HOUR })];
      const result = computeGlobalScore(tasks);
      expect(result.global_score).toBeGreaterThan(0);
    });

    it('uses ai_stress as weight in global calculation', () => {
      const tasks = [makeTask({ id: 'a', ai_stress: 9, due_at: Date.now() + 2 * MS_PER_HOUR })];
      const result = computeGlobalScore(tasks);
      expect(result.global_score).toBeGreaterThan(0);
    });

    it('all done tasks yields global_score 0', () => {
      const tasks = [makeTask({ id: 'a', is_done: 1 }), makeTask({ id: 'b', is_done: 1 })];
      const result = computeGlobalScore(tasks);
      expect(result.global_score).toBe(0);
      expect(result.tasks).toHaveLength(0);
    });
  });

  describe('AI score blending', () => {
    it('uses AI score when recent, blended 70/30 with mechanical', () => {
      const tasks = [makeTask({ id: 'a', due_at: Date.now() + 48 * MS_PER_HOUR })];
      const aiScore = { global_stress: 8, computed_at: Date.now() - 1000 };
      const result = computeGlobalScore(tasks, { aiScore });
      // AI normalized = 0.8, mechanical is tiny, so result ≈ 0.8 * 0.7 + tiny * 0.3
      expect(result.global_score).toBeGreaterThanOrEqual(0.5);
    });

    it('ignores stale AI score (older than 12h)', () => {
      const tasks = [makeTask({ id: 'a', due_at: Date.now() + 48 * MS_PER_HOUR })];
      const aiScore = { global_stress: 9, computed_at: Date.now() - AI_SCORE_MAX_AGE_MS - 1000 };
      const result = computeGlobalScore(tasks, { aiScore });
      // Falls back to mechanical only — should be low for distant event
      expect(result.global_score).toBeLessThan(0.3);
    });
  });

  describe('volume amplification', () => {
    it('applies the amp when both gates pass (base above threshold AND volume above threshold)', () => {
      // All tasks overdue (urgency_score = 1.0 each) → base = 1.0. With 10
      // tasks, calendar volume of 10 exceeds the threshold of 5 → amp gates open.
      // We do not assert the score change here: a base of 1.0 leaves no
      // headroom for the boost to add value. We assert the flag instead.
      const overdueTasks = Array.from({ length: 10 }, (_, i) =>
        makeTask({ id: `t${i}`, due_at: Date.now() - MS_PER_HOUR, priority: 1 }),
      );
      const result = computeGlobalScore(overdueTasks);
      expect(result.breakdown.mechanical.volume_amp_applied).toBe(true);
    });

    it('does NOT amplify when base urgency is below the gate (idle calendar)', () => {
      // Distant deadlines → low base urgency → volume amp must stay dormant
      // even with many events. Prevents the "populated calendar always = max stress" bug.
      const manyDistantTasks = Array.from({ length: 30 }, (_, i) =>
        makeTask({ id: `t${i}`, due_at: Date.now() + 72 * MS_PER_HOUR }),
      );
      const result = computeGlobalScore(manyDistantTasks);
      expect(result.global_score).toBeLessThan(0.3);
    });

    it('caps amplified score at 1.0', () => {
      const tasks = Array.from({ length: 30 }, (_, i) =>
        makeTask({ id: `t${i}`, due_at: Date.now() + 1 * MS_PER_HOUR, priority: 1 }),
      );
      const result = computeGlobalScore(tasks);
      expect(result.global_score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('exported constants', () => {
    it('DEFAULT_K is 0.05', () => {
      expect(DEFAULT_K).toBe(0.05);
    });

    it('DEFAULT_PRIORITY_WEIGHTS has 4 elements', () => {
      expect(DEFAULT_PRIORITY_WEIGHTS).toHaveLength(4);
      expect(DEFAULT_PRIORITY_WEIGHTS).toEqual([2.0, 1.5, 1.0, 0.5]);
    });
  });
});
