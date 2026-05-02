const { computeTaskUrgency, computeGlobalScore, DEFAULT_K, DEFAULT_PRIORITY_WEIGHTS } = require('../../core/deadline-engine');

const MS_PER_HOUR = 3600000;

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
      const tasks = [
        makeTask({ id: 'a', ai_stress: 9, due_at: Date.now() + 2 * MS_PER_HOUR }),
      ];
      const result = computeGlobalScore(tasks);
      expect(result.global_score).toBeGreaterThan(0);
    });

    it('all done tasks yields global_score 0', () => {
      const tasks = [
        makeTask({ id: 'a', is_done: 1 }),
        makeTask({ id: 'b', is_done: 1 }),
      ];
      const result = computeGlobalScore(tasks);
      expect(result.global_score).toBe(0);
      expect(result.tasks).toHaveLength(0);
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
