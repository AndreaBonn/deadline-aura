'use strict';

const db = require('../../store/db');
const { run } = require('../../core/deadline-engine');

const MS_PER_HOUR = 3600000;

describe('deadline-engine — run()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

    expect(result.global_score).toBeGreaterThan(0);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].id).toBe('t1');
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

    expect(result.global_score).toBeGreaterThan(0);
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
