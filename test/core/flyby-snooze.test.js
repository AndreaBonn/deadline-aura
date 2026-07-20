'use strict';

const {
  isFlybySuppressed,
  buildFlybyPatch,
  applyFlybyAction,
  SNOOZE_DURATIONS_MS,
  FLYBY_ACTIONS,
} = require('../../core/flyby-snooze');
const { validateConfig } = require('../../config/schema');
const { DEFAULTS } = require('../../config/defaults');

const NOW = 1_700_000_000_000;

describe('isFlybySuppressed', () => {
  it('suppresses when disabled regardless of snooze', () => {
    expect(isFlybySuppressed({ enabled: false, snoozed_until: null, now: NOW })).toBe(true);
  });

  it('suppresses while snoozed until a future instant', () => {
    expect(isFlybySuppressed({ enabled: true, snoozed_until: NOW + 1000, now: NOW })).toBe(true);
  });

  it('does not suppress once the snooze instant has passed', () => {
    expect(isFlybySuppressed({ enabled: true, snoozed_until: NOW - 1, now: NOW })).toBe(false);
  });

  it('does not suppress at the exact snooze expiry instant', () => {
    expect(isFlybySuppressed({ enabled: true, snoozed_until: NOW, now: NOW })).toBe(false);
  });

  it('does not suppress when enabled and not snoozed', () => {
    expect(isFlybySuppressed({ enabled: true, snoozed_until: null, now: NOW })).toBe(false);
  });

  it('treats a missing snoozed_until as not snoozed', () => {
    expect(isFlybySuppressed({ enabled: true, now: NOW })).toBe(false);
  });
});

describe('buildFlybyPatch', () => {
  it('snoozes one hour from now', () => {
    expect(buildFlybyPatch('snooze-1h', NOW)).toEqual({
      enabled: true,
      snoozed_until: NOW + SNOOZE_DURATIONS_MS['1h'],
    });
  });

  it('snoozes three hours from now', () => {
    expect(buildFlybyPatch('snooze-3h', NOW)).toEqual({
      enabled: true,
      snoozed_until: NOW + 3 * 60 * 60 * 1000,
    });
  });

  it('snoozes twenty-four hours from now', () => {
    expect(buildFlybyPatch('snooze-24h', NOW)).toEqual({
      enabled: true,
      snoozed_until: NOW + 24 * 60 * 60 * 1000,
    });
  });

  it('disables permanently and clears any snooze', () => {
    expect(buildFlybyPatch('disable', NOW)).toEqual({ enabled: false, snoozed_until: null });
  });

  it('reactivates by enabling and clearing the snooze', () => {
    expect(buildFlybyPatch('reactivate', NOW)).toEqual({ enabled: true, snoozed_until: null });
  });

  it('returns null for an unknown action', () => {
    expect(buildFlybyPatch('nope', NOW)).toBeNull();
  });

  it('exposes exactly the five menu actions', () => {
    expect(FLYBY_ACTIONS).toEqual([
      'snooze-1h',
      'snooze-3h',
      'snooze-24h',
      'disable',
      'reactivate',
    ]);
  });
});

describe('applyFlybyAction', () => {
  const baseConfig = {
    ...DEFAULTS,
    meeting_flyby: {
      enabled: true,
      trigger_seconds: 60,
      duration_seconds: 20,
      snoozed_until: null,
    },
  };

  it('returns null for an unknown action without touching config', () => {
    expect(applyFlybyAction(baseConfig, 'bogus', NOW)).toBeNull();
  });

  it('sets a future snooze while keeping the other flyby fields', () => {
    const next = applyFlybyAction(baseConfig, 'snooze-3h', NOW);
    expect(next.meeting_flyby).toEqual({
      enabled: true,
      trigger_seconds: 60,
      duration_seconds: 20,
      snoozed_until: NOW + 3 * 60 * 60 * 1000,
    });
  });

  it('disables permanently and clears the snooze', () => {
    const next = applyFlybyAction(baseConfig, 'disable', NOW);
    expect(next.meeting_flyby.enabled).toBe(false);
    expect(next.meeting_flyby.snoozed_until).toBeNull();
  });

  it('reactivates by enabling and clearing the snooze', () => {
    const snoozed = {
      ...baseConfig,
      meeting_flyby: { ...baseConfig.meeting_flyby, enabled: false, snoozed_until: NOW + 1000 },
    };
    const next = applyFlybyAction(snoozed, 'reactivate', NOW);
    expect(next.meeting_flyby.enabled).toBe(true);
    expect(next.meeting_flyby.snoozed_until).toBeNull();
  });

  it('does not mutate the input config', () => {
    applyFlybyAction(baseConfig, 'snooze-1h', NOW);
    expect(baseConfig.meeting_flyby.snoozed_until).toBeNull();
  });

  it('produces a config that still passes schema validation', () => {
    for (const action of FLYBY_ACTIONS) {
      const next = applyFlybyAction(baseConfig, action, NOW);
      expect(() => validateConfig(next), action).not.toThrow();
    }
  });

  it('leaves unrelated config sections untouched', () => {
    const next = applyFlybyAction(baseConfig, 'disable', NOW);
    expect(next.sidebar).toEqual(baseConfig.sidebar);
    expect(next.sync).toEqual(baseConfig.sync);
  });
});
