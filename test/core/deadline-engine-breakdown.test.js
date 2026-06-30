'use strict';

const db = require('../../store/db');
const {
  computeGlobalScore,
  describeMechanicalScore,
  AI_BLEND_WEIGHT,
  MECHANICAL_BLEND_WEIGHT,
  TOP_DRIVERS_COUNT,
} = require('../../core/deadline-engine');

const MS_PER_HOUR = 3600000;

// The "no AI" breakdown cases assert mechanical-only weights. Neutralize the
// engine's db.getLatestAiScore() fallback so a fresh score in the real on-disk
// database can't leak in and flip the blend weights.
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

describe('describeMechanicalScore', () => {
  it('returns reason "empty" when no tasks scored', () => {
    const detail = describeMechanicalScore([], [2.0, 1.5, 1.0, 0.5]);
    expect(detail.score).toBe(0);
    expect(detail.reason_key).toBe('empty');
    expect(detail.active_count).toBe(0);
  });

  it('returns reason "all_off" when every task is OOO', () => {
    const ooo = [
      { urgency_score: 0.1, source: 'gcal', priority: 3, ai_stress: 1, ai_category: 'off' },
      { urgency_score: 0.1, source: 'gcal', priority: 3, ai_stress: 1, ai_category: 'off' },
    ];
    const detail = describeMechanicalScore(ooo, [2.0, 1.5, 1.0, 0.5]);
    expect(detail.score).toBe(0);
    expect(detail.reason_key).toBe('all_off');
    expect(detail.ooo_filtered_count).toBe(2);
  });

  it('returns reason "no_imminent_urgency" on idle calendar (base below gate)', () => {
    const distant = Array.from({ length: 12 }, () => ({
      urgency_score: 0.1,
      source: 'gcal',
      priority: 3,
      ai_stress: null,
      ai_category: null,
    }));
    const detail = describeMechanicalScore(distant, [2.0, 1.5, 1.0, 0.5]);
    expect(detail.reason_key).toBe('no_imminent_urgency');
    expect(detail.volume_amp_applied).toBe(false);
    expect(detail.base).toBeLessThan(0.3);
  });

  it('returns reason "volume_amplified" and flags the amp when base is high and volume exceeds threshold', () => {
    const urgent = Array.from({ length: 12 }, () => ({
      urgency_score: 0.9,
      source: 'gcal',
      priority: 1,
      ai_stress: 8,
      ai_category: 'work-critical',
    }));
    const detail = describeMechanicalScore(urgent, [2.0, 1.5, 1.0, 0.5]);
    expect(detail.reason_key).toBe('volume_amplified');
    expect(detail.volume_amp_applied).toBe(true);
    expect(detail.score).toBeGreaterThan(detail.base);
  });

  it('reports active vs ooo counts after filter', () => {
    const mixed = [
      {
        urgency_score: 0.5,
        source: 'gcal',
        priority: 2,
        ai_stress: 5,
        ai_category: 'work-routine',
      },
      { urgency_score: 0.1, source: 'gcal', priority: 3, ai_stress: 1, ai_category: 'off' },
      { urgency_score: 0.1, source: 'gcal', priority: 3, ai_stress: 1, ai_category: 'off' },
    ];
    const detail = describeMechanicalScore(mixed, [2.0, 1.5, 1.0, 0.5]);
    expect(detail.active_count).toBe(1);
    expect(detail.ooo_filtered_count).toBe(2);
  });
});

describe('computeGlobalScore breakdown', () => {
  it('exposes the blend weights used in the final score', () => {
    const tasks = [makeTask()];
    const result = computeGlobalScore(tasks, { aiScore: null });
    expect(result.breakdown).toBeDefined();
    expect(result.breakdown.blend.ai_weight).toBe(0);
    expect(result.breakdown.blend.mechanical_weight).toBe(1);
  });

  it('exposes AI blend weights when AI score is fresh', () => {
    const tasks = [makeTask()];
    const aiScore = { global_stress: 7, computed_at: Date.now() };
    const result = computeGlobalScore(tasks, { aiScore });
    expect(result.breakdown.blend.ai_weight).toBe(AI_BLEND_WEIGHT);
    expect(result.breakdown.blend.mechanical_weight).toBe(MECHANICAL_BLEND_WEIGHT);
    expect(result.breakdown.ai.fresh).toBe(true);
    expect(result.breakdown.ai.normalized).toBe(0.7);
  });

  it('marks AI as stale and ignores it in the blend when older than the cutoff', () => {
    const tasks = [makeTask()];
    const aiScore = { global_stress: 8, computed_at: Date.now() - 24 * MS_PER_HOUR };
    const result = computeGlobalScore(tasks, { aiScore });
    expect(result.breakdown.ai.fresh).toBe(false);
    expect(result.breakdown.blend.ai_weight).toBe(0);
    expect(result.breakdown.blend.mechanical_weight).toBe(1);
  });

  it(`includes up to ${TOP_DRIVERS_COUNT} top drivers sorted by urgency`, () => {
    const tasks = [
      makeTask({ id: 'a', title: 'A', due_at: Date.now() + 1 * MS_PER_HOUR, priority: 1 }),
      makeTask({ id: 'b', title: 'B', due_at: Date.now() + 2 * MS_PER_HOUR, priority: 2 }),
      makeTask({ id: 'c', title: 'C', due_at: Date.now() + 4 * MS_PER_HOUR, priority: 3 }),
      makeTask({ id: 'd', title: 'D', due_at: Date.now() + 100 * MS_PER_HOUR, priority: 4 }),
    ];
    const result = computeGlobalScore(tasks);
    expect(result.breakdown.top_drivers).toHaveLength(TOP_DRIVERS_COUNT);
    expect(result.breakdown.top_drivers[0].id).toBe('a');
    expect(result.breakdown.top_drivers[0].urgency_score).toBeGreaterThan(
      result.breakdown.top_drivers[1].urgency_score,
    );
  });

  it('top driver entries carry the metadata the UI needs to render them', () => {
    const tasks = [
      makeTask({
        id: 'a',
        title: 'Demo Sprint',
        source: 'jira',
        ai_stress: 8,
        ai_category: 'work-critical',
      }),
    ];
    const result = computeGlobalScore(tasks);
    const top = result.breakdown.top_drivers[0];
    expect(top).toMatchObject({
      id: 'a',
      title: 'Demo Sprint',
      source: 'jira',
      ai_stress: 8,
      ai_category: 'work-critical',
    });
    expect(top).toHaveProperty('urgency_score');
    expect(top).toHaveProperty('hours_remaining');
  });

  it('returns an empty breakdown when there are no scored tasks', () => {
    const result = computeGlobalScore([]);
    expect(result.global_score).toBe(0);
    expect(result.breakdown.top_drivers).toEqual([]);
    expect(result.breakdown.mechanical.reason_key).toBe('empty');
  });
});
