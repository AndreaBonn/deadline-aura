'use strict';

const db = require('../../store/db');
const { run } = require('../../core/deadline-engine');

const MS_PER_HOUR = 3600000;

describe('deadline-engine run()', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
    // Mechanical scoring must not read the developer's persisted AI score.
    vi.spyOn(db, 'getLatestAiScore').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('returns global_score 0 when no active tasks exist', () => {
    vi.spyOn(db, 'getActiveTasks').mockReturnValue([]);

    const result = run({ lookaheadHours: 72 });

    expect(result.global_score).toBe(0);
    expect(result.tasks).toHaveLength(0);
    expect(result).toHaveProperty('computed_at');
  });

  it('computes scores for active tasks within lookahead', () => {
    vi.spyOn(db, 'getActiveTasks').mockReturnValue([
      {
        id: 't1',
        source: 'gcal',
        title: 'Urgent',
        due_at: Date.now() + 2 * MS_PER_HOUR,
        priority: 1,
        is_done: 0,
        ai_stress: null,
        ai_category: null,
      },
    ]);

    const result = run({ lookaheadHours: 72 });

    // Single priority-1 task at 2h: 1-exp(-0.05*2/2), rounded to 3 decimals.
    expect(result.global_score).toBe(0.049);
    expect(result.tasks.map(({ id, urgency_score }) => ({ id, urgency_score }))).toEqual([
      { id: 't1', urgency_score: 0.049 },
    ]);
  });

  it('uses end-of-week as minimum lookahead regardless of config', () => {
    const spy = vi.spyOn(db, 'getActiveTasks').mockReturnValue([]);

    run({ lookaheadHours: 1 });

    // getActiveTasks should be called with at least end-of-week ms
    const calledWithMs = spy.mock.calls[0][0];
    // End of week is at least a few hours away
    expect(calledWithMs).toBeGreaterThan(MS_PER_HOUR);
  });

  it('passes custom options through to computeGlobalScore', () => {
    vi.spyOn(db, 'getActiveTasks').mockReturnValue([
      {
        id: 't1',
        source: 'gcal',
        title: 'Task',
        due_at: Date.now() + 24 * MS_PER_HOUR,
        priority: 2,
        is_done: 0,
        ai_stress: null,
        ai_category: null,
      },
    ]);

    const result = run({ lookaheadHours: 72, k: 0.2 });

    // Custom k=0.2, priority weight=1.5 and 24h: 1-exp(-0.2*1.5/24).
    expect(result.global_score).toBe(0.012);
  });

  it('uses config lookaheadHours when larger than end-of-week', () => {
    const spy = vi.spyOn(db, 'getActiveTasks').mockReturnValue([]);

    run({ lookaheadHours: 8760 }); // 1 year

    const calledWithMs = spy.mock.calls[0][0];
    expect(calledWithMs).toBeGreaterThanOrEqual(8760 * MS_PER_HOUR);
  });

  it('works without options', () => {
    vi.spyOn(db, 'getActiveTasks').mockReturnValue([]);
    vi.spyOn(db, 'getLatestAiScore').mockReturnValue(null);

    const result = run();

    expect(result.global_score).toBe(0);
  });
});
