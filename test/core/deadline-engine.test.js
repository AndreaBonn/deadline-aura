const { computeTaskUrgency, computeGlobalScore } = require('../../core/deadline-engine');

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

describe('deadline-engine', () => {
  describe('computeTaskUrgency', () => {
    it('returns score 1.0 for overdue task', () => {
      const task = makeTask({ due_at: Date.now() - MS_PER_HOUR });
      const result = computeTaskUrgency(task);
      expect(result.urgency_score).toBe(1.0);
      expect(result.hours_remaining).toBeLessThan(0);
    });

    it('returns score 0.1 for task without due_at', () => {
      const task = makeTask({ due_at: null });
      const result = computeTaskUrgency(task);
      expect(result.urgency_score).toBe(0.1);
      expect(result.hours_remaining).toBeNull();
    });

    it('returns null for done task', () => {
      const task = makeTask({ is_done: 1 });
      const result = computeTaskUrgency(task);
      expect(result).toBeNull();
    });

    it('returns higher score for higher priority (lower number)', () => {
      const highPri = makeTask({ priority: 1, due_at: Date.now() + 4 * MS_PER_HOUR });
      const lowPri = makeTask({ priority: 4, due_at: Date.now() + 4 * MS_PER_HOUR });

      const highResult = computeTaskUrgency(highPri);
      const lowResult = computeTaskUrgency(lowPri);

      expect(highResult.urgency_score).toBeGreaterThan(lowResult.urgency_score);
    });

    it('returns higher score for closer deadline', () => {
      const soon = makeTask({ due_at: Date.now() + 1 * MS_PER_HOUR });
      const later = makeTask({ due_at: Date.now() + 48 * MS_PER_HOUR });

      const soonResult = computeTaskUrgency(soon);
      const laterResult = computeTaskUrgency(later);

      expect(soonResult.urgency_score).toBeGreaterThan(laterResult.urgency_score);
    });

    it('uses ai_stress as weight when available', () => {
      const withAi = makeTask({ ai_stress: 9, due_at: Date.now() + 4 * MS_PER_HOUR });
      const withoutAi = makeTask({ ai_stress: null, due_at: Date.now() + 4 * MS_PER_HOUR });

      const aiResult = computeTaskUrgency(withAi);
      const mechResult = computeTaskUrgency(withoutAi);

      expect(aiResult.urgency_score).toBeGreaterThan(mechResult.urgency_score);
    });

    it('score is between 0 and 1 for future task', () => {
      const task = makeTask({ due_at: Date.now() + 10 * MS_PER_HOUR });
      const result = computeTaskUrgency(task);
      expect(result.urgency_score).toBeGreaterThanOrEqual(0);
      expect(result.urgency_score).toBeLessThanOrEqual(1);
    });

    it('different k_constant changes the curve', () => {
      const task = makeTask({ due_at: Date.now() + 4 * MS_PER_HOUR, priority: 1 });

      const lowK = computeTaskUrgency(task, { k: 0.01 });
      const highK = computeTaskUrgency(task, { k: 0.2 });

      expect(highK.urgency_score).toBeGreaterThan(lowK.urgency_score);
    });
  });

  describe('computeGlobalScore', () => {
    it('returns 0 for empty task list', () => {
      const result = computeGlobalScore([]);
      expect(result.global_score).toBe(0);
      expect(result.tasks).toHaveLength(0);
    });

    it('computes weighted average of task scores', () => {
      const tasks = [
        makeTask({ id: 'a', priority: 1, due_at: Date.now() + 2 * MS_PER_HOUR }),
        makeTask({ id: 'b', priority: 4, due_at: Date.now() + 48 * MS_PER_HOUR }),
      ];

      const result = computeGlobalScore(tasks);

      expect(result.global_score).toBeGreaterThan(0);
      expect(result.global_score).toBeLessThanOrEqual(1);
      expect(result.tasks).toHaveLength(2);
    });

    it('excludes done tasks from calculation', () => {
      const tasks = [
        makeTask({ id: 'a', is_done: 1 }),
        makeTask({ id: 'b', due_at: Date.now() + 24 * MS_PER_HOUR }),
      ];

      const result = computeGlobalScore(tasks);
      expect(result.tasks).toHaveLength(1);
    });

    it('sorts tasks by urgency_score descending', () => {
      const tasks = [
        makeTask({ id: 'low', priority: 4, due_at: Date.now() + 72 * MS_PER_HOUR }),
        makeTask({ id: 'high', priority: 1, due_at: Date.now() + 1 * MS_PER_HOUR }),
      ];

      const result = computeGlobalScore(tasks);
      expect(result.tasks[0].id).toBe('high');
    });

    it('includes computed_at timestamp', () => {
      const before = Date.now();
      const result = computeGlobalScore([makeTask()]);
      expect(result.computed_at).toBeGreaterThanOrEqual(before);
    });
  });
});
