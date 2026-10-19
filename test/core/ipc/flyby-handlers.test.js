const { createFlybyHandlers } = require('../../../core/ipc/flyby-handlers');
const { DEFAULTS } = require('../../../config/defaults');

function setup(options = {}) {
  let config = globalThis.structuredClone(DEFAULTS);
  const deps = {
    getConfig: vi.fn(() => config),
    applyConfig: vi.fn((next) => (config = next)),
    now: () => 1000,
    ...options,
  };
  return { deps, handlers: createFlybyHandlers(deps), replaceConfig: (next) => (config = next) };
}

describe('flyby handlers', () => {
  it('reads state from current config, including missing and null fields', () => {
    const { handlers, replaceConfig } = setup();
    expect(handlers['flyby:get-state']()).toEqual({ enabled: true, snoozed_until: null });
    replaceConfig({});
    expect(handlers['flyby:get-state']('ignored')).toEqual({ enabled: true, snoozed_until: null });
    replaceConfig({ meeting_flyby: { enabled: false, snoozed_until: 12 } });
    expect(handlers['flyby:get-state']()).toEqual({ enabled: false, snoozed_until: 12 });
  });

  it.each([
    ['snooze-1h', true, 3601000],
    ['snooze-3h', true, 10801000],
    ['snooze-24h', true, 86401000],
    ['disable', false, null],
    ['reactivate', true, null],
  ])('applies %s and returns persisted state', (action, enabled, snoozed_until) => {
    const { handlers, deps } = setup();
    expect(handlers['flyby:set-state'](action)).toEqual({
      ok: true,
      state: { enabled, snoozed_until },
    });
    expect(deps.applyConfig.mock.calls[0][0].meeting_flyby).toMatchObject({
      enabled,
      snoozed_until,
    });
  });

  it('reads state again after applyConfig reassigns config', () => {
    const { handlers, deps, replaceConfig } = setup();
    deps.applyConfig.mockImplementation(() =>
      replaceConfig({ meeting_flyby: { enabled: true, snoozed_until: 77 } }),
    );
    expect(handlers['flyby:set-state']('disable')).toEqual({
      ok: true,
      state: { enabled: true, snoozed_until: 77 },
    });
  });

  it.each(['unknown', undefined, null, {}])('rejects invalid action %j', (action) => {
    const { handlers, deps } = setup();
    expect(handlers['flyby:set-state'](action)).toEqual({ ok: false, error: 'INVALID_ACTION' });
    expect(deps.applyConfig).not.toHaveBeenCalled();
    expect(handlers['flyby:get-state']()).toEqual({ enabled: true, snoozed_until: null });
  });

  it('returns VALIDATION_ERROR for an invalid config', () => {
    const { handlers, deps, replaceConfig } = setup();
    replaceConfig({});
    expect(handlers['flyby:set-state']('disable')).toEqual({
      ok: false,
      error: 'VALIDATION_ERROR',
    });
    expect(deps.applyConfig).not.toHaveBeenCalled();
    expect(handlers['flyby:get-state']()).toEqual({ enabled: true, snoozed_until: null });
  });

  it('defaults the clock to Date.now', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(5000);
    try {
      const { handlers } = setup({ now: undefined });
      expect(handlers['flyby:set-state']('snooze-1h').state.snoozed_until).toBe(3605000);
    } finally {
      clock.mockRestore();
    }
  });

  it.each(['flyby:get-state', 'flyby:set-state'])('%s propagates read errors', (channel) => {
    const { handlers, deps } = setup();
    deps.getConfig.mockImplementation(() => {
      throw new Error('read');
    });
    expect(() => handlers[channel]('disable')).toThrow('read');
  });

  it('propagates persistence errors', () => {
    const { handlers, deps } = setup();
    deps.applyConfig.mockImplementation(() => {
      throw new Error('disk');
    });
    expect(() => handlers['flyby:set-state']('disable')).toThrow('disk');
  });
});
