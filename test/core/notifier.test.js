const { shouldNotify, findMostUrgentTask, formatCountdown, send } = require('../../core/notifier');

function makeConfig(overrides = {}) {
  return {
    notifications: {
      enabled: true,
      threshold_score: 0.85,
      cooldown_minutes: 30,
      ...overrides,
    },
  };
}

function makeEngineResult(overrides = {}) {
  return {
    global_score: 0.9,
    tasks: [
      { id: 't1', title: 'Urgent Task', urgency_score: 0.95, priority: 1, hours_remaining: 2 },
    ],
    ...overrides,
  };
}

describe('notifier', () => {
  describe('formatCountdown', () => {
    it('returns empty string for null hours', () => {
      expect(formatCountdown(null)).toBe('');
    });

    it('returns "scaduto" for negative hours', () => {
      expect(formatCountdown(-5)).toBe('scaduto');
    });

    it('returns minutes for less than 1 hour', () => {
      expect(formatCountdown(0.5)).toBe('tra 30 minuti');
    });

    it('returns hours for 1+ hours', () => {
      expect(formatCountdown(3)).toBe('tra 3 ore');
    });

    it('rounds minutes correctly for fractional hours under 1', () => {
      expect(formatCountdown(0.25)).toBe('tra 15 minuti');
    });

    it('rounds hours correctly', () => {
      expect(formatCountdown(2.7)).toBe('tra 3 ore');
    });

    it('returns "tra 0 minuti" for zero', () => {
      expect(formatCountdown(0)).toBe('tra 0 minuti');
    });
  });

  describe('findMostUrgentTask', () => {
    it('returns null for empty array', () => {
      expect(findMostUrgentTask([])).toBeNull();
    });

    it('returns the task with highest urgency_score', () => {
      const tasks = [
        { id: 'a', urgency_score: 0.5, priority: 1 },
        { id: 'b', urgency_score: 0.9, priority: 2 },
        { id: 'c', urgency_score: 0.7, priority: 1 },
      ];
      expect(findMostUrgentTask(tasks).id).toBe('b');
    });

    it('prefers higher priority (lower number) on tie', () => {
      const tasks = [
        { id: 'a', urgency_score: 0.9, priority: 3 },
        { id: 'b', urgency_score: 0.9, priority: 1 },
      ];
      expect(findMostUrgentTask(tasks).id).toBe('b');
    });

    it('returns single task from single-element array', () => {
      const tasks = [{ id: 'only', urgency_score: 0.5, priority: 2 }];
      expect(findMostUrgentTask(tasks).id).toBe('only');
    });

    it('keeps first task when scores and priorities are equal', () => {
      const tasks = [
        { id: 'first', urgency_score: 0.8, priority: 2 },
        { id: 'second', urgency_score: 0.8, priority: 2 },
      ];
      expect(findMostUrgentTask(tasks).id).toBe('first');
    });
  });

  describe('shouldNotify', () => {
    it('returns false when notifications disabled', () => {
      const config = makeConfig({ enabled: false });
      expect(shouldNotify(makeEngineResult(), config)).toBe(false);
    });

    it('returns false when global_score below threshold', () => {
      const config = makeConfig({ threshold_score: 0.85 });
      const result = makeEngineResult({ global_score: 0.5 });
      expect(shouldNotify(result, config)).toBe(false);
    });

    it('returns false when no task above 0.9 urgency', () => {
      const config = makeConfig();
      const result = makeEngineResult({
        tasks: [{ id: 't1', urgency_score: 0.8, priority: 1 }],
      });
      expect(shouldNotify(result, config)).toBe(false);
    });

    it('returns true when conditions met', () => {
      const config = makeConfig();
      const result = makeEngineResult();
      expect(shouldNotify(result, config)).toBe(true);
    });
  });

  describe('send', () => {
    it('returns sent: false when shouldNotify returns false', () => {
      const config = makeConfig({ enabled: false });
      const result = send(makeEngineResult(), config);
      expect(result.sent).toBe(false);
    });

    it('returns sent: false when no critical tasks exist', () => {
      const config = makeConfig();
      const engineResult = makeEngineResult({
        global_score: 0.9,
        tasks: [{ id: 't1', urgency_score: 0.5, priority: 1 }],
      });
      const result = send(engineResult, config);
      expect(result.sent).toBe(false);
    });

    it('returns sent: false when global score below threshold', () => {
      const config = makeConfig({ threshold_score: 0.99 });
      const result = send(makeEngineResult({ global_score: 0.5 }), config);
      expect(result.sent).toBe(false);
    });
  });
});
