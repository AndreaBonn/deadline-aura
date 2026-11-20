const db = require('../../store/db');
const {
  computeTaskUrgency,
  describeMechanicalScore,
  computeGlobalScore,
} = require('../../core/deadline-engine');

const NOW = 1800000000000;
const HOUR = 3600000;
const weights = [2, 1.5, 1, 0.5];
const task = {
  id: 'a',
  title: 'Task',
  source: 'gcal',
  priority: 9,
  start_at: 123,
  web_url: 'https://example.com',
  ai_stress: null,
  ai_category: null,
};
const emptyMechanical = {
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

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.spyOn(db, 'getLatestAiScore').mockReturnValue(null);
});
afterEach(() => vi.restoreAllMocks());

it('characterizes task urgency branches and weights', () => {
  const common = {
    id: 'a',
    title: 'Task',
    start_at: 123,
    priority: 9,
    source: 'gcal',
    web_url: 'https://example.com',
    ai_stress: null,
    ai_category: null,
  };
  expect(computeTaskUrgency({ ...task, due_at: null })).toEqual({
    ...common,
    due_at: null,
    urgency_score: 0.1,
    hours_remaining: null,
  });
  expect(computeTaskUrgency({ ...task, due_at: NOW - HOUR })).toEqual({
    ...common,
    due_at: NOW - HOUR,
    urgency_score: 1,
    hours_remaining: -1,
  });
  expect(computeTaskUrgency({ ...task, due_at: NOW + HOUR })).toEqual({
    ...common,
    due_at: NOW + HOUR,
    urgency_score: 0.049,
    hours_remaining: 1,
  });
  expect(computeTaskUrgency({ ...task, due_at: NOW + HOUR, ai_stress: 10 })).toEqual({
    ...common,
    ai_stress: 10,
    due_at: NOW + HOUR,
    urgency_score: 0.095,
    hours_remaining: 1,
  });
});

it('characterizes empty mechanical results and weighted base', () => {
  expect(describeMechanicalScore([], weights)).toEqual(emptyMechanical);
  expect(describeMechanicalScore([{ ai_category: 'off' }], weights)).toEqual({
    ...emptyMechanical,
    reason_key: 'all_off',
    ooo_filtered_count: 1,
  });
  expect(
    describeMechanicalScore(
      [
        { priority: 9, urgency_score: 0.8 },
        { priority: 1, urgency_score: 0.2 },
      ],
      weights,
    ),
  ).toEqual({
    score: 0.4,
    reason_key: 'urgency_below_volume_threshold',
    base: 0.4,
    active_count: 2,
    ooo_filtered_count: 0,
    volume_amp_applied: false,
    effective_volume: 0.4,
    calendar_count: 0,
    backlog_count: 2,
  });
});

it('characterizes empty global result and fresh and stale AI breakdowns', () => {
  expect(computeGlobalScore([])).toEqual({
    global_score: 0,
    tasks: [],
    computed_at: NOW,
    breakdown: {
      global_score: 0,
      ai: null,
      mechanical: emptyMechanical,
      blend: { ai_weight: 0, mechanical_weight: 1 },
      top_drivers: [],
      computed_at: NOW,
    },
  });
  const scored = {
    id: 'a',
    title: 'Task',
    due_at: null,
    start_at: 123,
    urgency_score: 0.1,
    hours_remaining: null,
    priority: 9,
    source: 'gcal',
    web_url: 'https://example.com',
    ai_stress: null,
    ai_category: null,
  };
  const mechanical = {
    score: 0.1,
    reason_key: 'no_imminent_urgency',
    base: 0.1,
    active_count: 1,
    ooo_filtered_count: 0,
    volume_amp_applied: false,
    effective_volume: 1,
    calendar_count: 1,
    backlog_count: 0,
  };
  const driver = {
    id: 'a',
    title: 'Task',
    source: 'gcal',
    urgency_score: 0.1,
    ai_stress: null,
    ai_category: null,
    hours_remaining: null,
    web_url: 'https://example.com',
  };
  for (const [age, fresh, score, blend] of [
    [HOUR, true, 0.59, { ai_weight: 0.7, mechanical_weight: 0.3 }],
    [13 * HOUR, false, 0.1, { ai_weight: 0, mechanical_weight: 1 }],
  ]) {
    expect(
      computeGlobalScore([{ ...task, due_at: null }], {
        aiScore: { global_stress: 8, computed_at: NOW - age },
      }),
    ).toEqual({
      global_score: score,
      tasks: [scored],
      computed_at: NOW,
      breakdown: {
        global_score: score,
        ai: { global_stress: 8, normalized: 0.8, computed_at: NOW - age, age_ms: age, fresh },
        mechanical,
        blend,
        top_drivers: [driver],
        computed_at: NOW,
      },
    });
  }
});

describe('describeMechanicalScore — volume amplification values', () => {
  function calendarTasks(count, urgency) {
    return Array.from({ length: count }, (_, i) => ({
      id: `gcal_${i}`,
      source: 'gcal',
      priority: 3,
      urgency_score: urgency,
    }));
  }

  it('amplifies when the base urgency sits exactly on the 0.3 gate', () => {
    // 6 calendar events: one above the threshold of 5, boost 0.15 -> 0.3 + 0.15 * 0.7
    const detail = describeMechanicalScore(calendarTasks(6, 0.3), [2.0, 1.5, 1.0, 0.5]);

    expect([detail.score, detail.volume_amp_applied]).toEqual([0.405, true]);
  });

  it('adds 0.15 per event above five, scaled by the remaining headroom', () => {
    // 10 events: boost 5 * 0.15 = 0.75 -> 0.5 + 0.75 * 0.5
    const detail = describeMechanicalScore(calendarTasks(10, 0.5), [2.0, 1.5, 1.0, 0.5]);

    expect(detail.score).toBe(0.875);
  });

  it('caps the amplified score at 1.0 when the boost exceeds the headroom', () => {
    // 30 events: boost 25 * 0.15 = 3.75 -> 0.5 + 3.75 * 0.5 = 2.375, capped
    const detail = describeMechanicalScore(calendarTasks(30, 0.5), [2.0, 1.5, 1.0, 0.5]);

    expect(detail.score).toBe(1);
  });
});
