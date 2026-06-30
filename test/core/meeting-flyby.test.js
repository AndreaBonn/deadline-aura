'use strict';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
}));

const i18n = require('../../i18n');
const { _testing } = require('../../core/meeting-flyby');
const {
  findTriggeredMeetings,
  cleanupCooldowns,
  formatRemaining,
  formatLeadText,
  cooldownMap,
  COOLDOWN_MS,
  TRIGGER_WINDOW_MS,
} = _testing;

// Fake translator: echoes key + interpolated count, so tests assert the
// key-selection logic (singular/plural, minutes/seconds) independent of locale.
const fakeT = (key, params) => `${key}:${params.n}`;

beforeEach(() => {
  cooldownMap.clear();
});

describe('findTriggeredMeetings', () => {
  it('triggers meeting within the trigger window', () => {
    const now = Date.now();
    const events = [{ id: 'evt-1', start_at: now + 60000, title: 'Standup' }];

    const result = findTriggeredMeetings(events, 60);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('evt-1');
  });

  it('does not trigger meeting outside the trigger window', () => {
    const now = Date.now();
    const events = [{ id: 'evt-1', start_at: now + 120000, title: 'Far meeting' }];

    const result = findTriggeredMeetings(events, 60);

    expect(result).toHaveLength(0);
  });

  it('does not trigger meeting already in cooldown', () => {
    const now = Date.now();
    cooldownMap.set('evt-1', now);
    const events = [{ id: 'evt-1', start_at: now + 60000, title: 'Standup' }];

    const result = findTriggeredMeetings(events, 60);

    expect(result).toHaveLength(0);
  });

  it('does not trigger events without start_at', () => {
    const events = [{ id: 'evt-1', start_at: null, title: 'All-day' }];

    const result = findTriggeredMeetings(events, 60);

    expect(result).toHaveLength(0);
  });

  it('does not trigger events in the past', () => {
    const now = Date.now();
    const events = [{ id: 'evt-1', start_at: now - 5000, title: 'Past' }];

    const result = findTriggeredMeetings(events, 60);

    expect(result).toHaveLength(0);
  });

  it('triggers at the edge of the trigger window', () => {
    const now = Date.now();
    const edgeMs = 60000 + TRIGGER_WINDOW_MS - 100;
    const events = [{ id: 'evt-1', start_at: now + edgeMs, title: 'Edge' }];

    const result = findTriggeredMeetings(events, 60);

    expect(result).toHaveLength(1);
  });

  it('does not trigger just outside the trigger window', () => {
    const now = Date.now();
    const outsideMs = 60000 + TRIGGER_WINDOW_MS + 1000;
    const events = [{ id: 'evt-1', start_at: now + outsideMs, title: 'Outside' }];

    const result = findTriggeredMeetings(events, 60);

    expect(result).toHaveLength(0);
  });

  it('triggers multiple meetings independently', () => {
    const now = Date.now();
    const events = [
      { id: 'evt-1', start_at: now + 58000, title: 'Meeting A' },
      { id: 'evt-2', start_at: now + 62000, title: 'Meeting B' },
      { id: 'evt-3', start_at: now + 180000, title: 'Meeting C' },
    ];

    const result = findTriggeredMeetings(events, 60);

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(['evt-1', 'evt-2']);
  });

  it('respects custom trigger seconds', () => {
    const now = Date.now();
    const events = [{ id: 'evt-1', start_at: now + 120000, title: 'Two min' }];

    const result = findTriggeredMeetings(events, 120);

    expect(result).toHaveLength(1);
  });
});

describe('cleanupCooldowns', () => {
  it('removes expired cooldown entries', () => {
    const expiredTime = Date.now() - COOLDOWN_MS - 1000;
    cooldownMap.set('old-evt', expiredTime);
    cooldownMap.set('recent-evt', Date.now());

    cleanupCooldowns();

    expect(cooldownMap.has('old-evt')).toBe(false);
    expect(cooldownMap.has('recent-evt')).toBe(true);
  });

  it('keeps entries within cooldown period', () => {
    cooldownMap.set('evt-1', Date.now() - 1000);

    cleanupCooldowns();

    expect(cooldownMap.has('evt-1')).toBe(true);
  });

  it('handles empty cooldown map', () => {
    expect(() => cleanupCooldowns()).not.toThrow();
    expect(cooldownMap.size).toBe(0);
  });
});

describe('formatRemaining', () => {
  it('uses singular minute key for exactly one minute', () => {
    expect(formatRemaining(60, fakeT)).toBe('flyby.in_minute:1');
  });

  it('uses plural minutes key for several minutes', () => {
    expect(formatRemaining(120, fakeT)).toBe('flyby.in_minutes:2');
  });

  it('rounds fractional seconds to the nearest minute', () => {
    expect(formatRemaining(90.4, fakeT)).toBe('flyby.in_minutes:2');
  });

  it('uses plural seconds key below one minute', () => {
    expect(formatRemaining(59, fakeT)).toBe('flyby.in_seconds:59');
  });

  it('uses singular second key for exactly one second', () => {
    expect(formatRemaining(1, fakeT)).toBe('flyby.in_second:1');
  });

  it('clamps negative values to zero seconds', () => {
    expect(formatRemaining(-5, fakeT)).toBe('flyby.in_seconds:0');
  });
});

describe('formatLeadText', () => {
  it('joins title and remaining phrase', () => {
    expect(formatLeadText('Standup', 60, fakeT)).toBe('Standup flyby.in_minute:1');
  });

  it('resolves real Italian copy with correct singular', () => {
    i18n.setLanguage('it');
    expect(formatLeadText('Standup del team', 60, i18n.t)).toBe('Standup del team tra 1 minuto');
  });

  it('resolves real English copy with correct plural', () => {
    i18n.setLanguage('en');
    expect(formatLeadText('Daily sync', 120, i18n.t)).toBe('Daily sync in 2 minutes');
    i18n.setLanguage('it');
  });
});
