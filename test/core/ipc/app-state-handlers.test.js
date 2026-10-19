const { createAppStateHandlers } = require('../../../core/ipc/app-state-handlers');

function setup(overrides = {}) {
  const config = {
    sync: { lookahead_hours: 48 },
    engine: { k_constant: 2, priority_weights: { 1: 5 } },
    work_shift: { weekdays: [1] },
  };
  const deps = {
    getConfig: () => config,
    deadlineEngine: { run: vi.fn(() => ({ breakdown: [{ id: 'a' }], global_score: 7 })) },
    db: { getLatestAiCacheResponse: vi.fn(() => ({ daily_breakdown: [{ day: 1 }] })) },
    i18n: { getTranslations: vi.fn(() => ({ hello: 'ciao' })) },
    firstRunHint: { dismiss: vi.fn() },
    log: { error: vi.fn() },
    ...overrides,
  };
  return { deps, config, groups: createAppStateHandlers(deps) };
}

describe('app state handlers: registration shape', () => {
  it('registers three request/response channels and one fire-and-forget channel', () => {
    const { groups } = setup();
    expect(Object.keys(groups.handle).sort()).toEqual([
      'config:get-work-shift',
      'i18n:get-translations',
      'score:get-breakdown',
    ]);
    expect(Object.keys(groups.on)).toEqual(['onboarding:dismiss-hint']);
  });
});

describe('score:get-breakdown', () => {
  it('runs the engine with options from the live config and pairs it with the AI breakdown', () => {
    const { groups, deps } = setup();
    expect(groups.handle['score:get-breakdown']()).toEqual({
      breakdown: [{ id: 'a' }],
      ai_daily_breakdown: [{ day: 1 }],
    });
    expect(deps.deadlineEngine.run).toHaveBeenCalledWith({
      lookaheadHours: 48,
      k: 2,
      priorityWeights: { 1: 5 },
    });
  });

  it('returns null AI breakdown when there is no cached AI response', () => {
    const { groups } = setup({ db: { getLatestAiCacheResponse: () => null } });
    expect(groups.handle['score:get-breakdown']().ai_daily_breakdown).toBeNull();
  });

  it('returns null AI breakdown when the cached response has none', () => {
    const { groups } = setup({ db: { getLatestAiCacheResponse: () => ({}) } });
    expect(groups.handle['score:get-breakdown']().ai_daily_breakdown).toBeNull();
  });

  it('logs and returns null when the engine throws', () => {
    const { groups, deps } = setup({
      deadlineEngine: {
        run: () => {
          throw new Error('engine down');
        },
      },
    });
    expect(groups.handle['score:get-breakdown']()).toBeNull();
    expect(deps.log.error).toHaveBeenCalledWith('[score:get-breakdown] error:', 'engine down');
  });

  it('logs and returns null when the AI cache read throws', () => {
    const { groups, deps } = setup({
      db: {
        getLatestAiCacheResponse: () => {
          throw new Error('db closed');
        },
      },
    });
    expect(groups.handle['score:get-breakdown']()).toBeNull();
    expect(deps.log.error).toHaveBeenCalledWith('[score:get-breakdown] error:', 'db closed');
  });
});

describe('config:get-work-shift', () => {
  it('returns the work shift of the config as it is on each call', () => {
    const { groups, config } = setup();
    expect(groups.handle['config:get-work-shift']()).toEqual({ weekdays: [1] });
    config.work_shift = { weekdays: [2] };
    expect(groups.handle['config:get-work-shift']()).toEqual({ weekdays: [2] });
  });

  it('returns null when no work shift is configured', () => {
    const { groups, config } = setup();
    delete config.work_shift;
    expect(groups.handle['config:get-work-shift']()).toBeNull();
  });
});

describe('i18n and onboarding channels', () => {
  it('i18n:get-translations returns the current translations', () => {
    const { groups } = setup();
    expect(groups.handle['i18n:get-translations']()).toEqual({ hello: 'ciao' });
  });

  it('onboarding:dismiss-hint dismisses the first-run hint', () => {
    const { groups, deps } = setup();
    groups.on['onboarding:dismiss-hint']();
    expect(deps.firstRunHint.dismiss).toHaveBeenCalledTimes(1);
  });
});
