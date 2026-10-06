'use strict';

const {
  normalizeWindow,
  formatCountdown,
  formatResetAt,
  formatReset,
  countdownBucket,
  isStale,
  STALE_AFTER_MS,
} = require('../../core/ai-usage-format');

const ROME_TZ = 'Europe/Rome';

describe('normalizeWindow', () => {
  it('returns null for a null window', () => {
    expect(normalizeWindow(null, 0)).toBeNull();
  });

  it('marks an already-passed reset as expired with pct 0', () => {
    const nowMs = 2_000_000;
    const win = { pct: 55, resetsAt: 1_000 };
    expect(normalizeWindow(win, nowMs)).toEqual({
      pct: 0,
      resetsAt: 1_000,
      inferred: true,
      expired: true,
    });
  });

  it('marks a reset exactly at now as expired', () => {
    const win = { pct: 30, resetsAt: 1_000 };
    expect(normalizeWindow(win, 1_000_000)).toEqual({
      pct: 0,
      resetsAt: 1_000,
      inferred: true,
      expired: true,
    });
  });

  it('keeps a future reset as not expired', () => {
    const win = { pct: 42, resetsAt: 2_000 };
    expect(normalizeWindow(win, 1_000_000)).toEqual({
      pct: 42,
      resetsAt: 2_000,
      inferred: false,
      expired: false,
    });
  });

  it('clamps pct above 100 down to 100', () => {
    const win = { pct: 120, resetsAt: 2_000 };
    expect(normalizeWindow(win, 1_000_000).pct).toBe(100);
  });

  it('clamps negative pct up to 0', () => {
    const win = { pct: -5, resetsAt: 2_000 };
    expect(normalizeWindow(win, 1_000_000).pct).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('returns empty string when the reset has already passed', () => {
    expect(formatCountdown(1_000, 1_000_000, 'it')).toBe('');
  });

  it('floors 59 minutes to the 15-minute step below 24h', () => {
    const nowMs = 0;
    const resetsAtS = 59 * 60;
    expect(formatCountdown(resetsAtS, nowMs, 'it')).toBe('~45m');
  });

  it('shows <15m under the first step', () => {
    const nowMs = 0;
    const resetsAtS = 14 * 60;
    expect(formatCountdown(resetsAtS, nowMs, 'it')).toBe('<15m');
  });

  it('floors 23h59m to 23h45m below 24h', () => {
    const nowMs = 0;
    const resetsAtS = 23 * 3600 + 59 * 60;
    expect(formatCountdown(resetsAtS, nowMs, 'it')).toBe('~23h 45m');
  });

  it('switches to day+hour format at exactly 24h', () => {
    const nowMs = 0;
    const resetsAtS = 24 * 3600;
    expect(formatCountdown(resetsAtS, nowMs, 'it')).toBe('1g 0h');
  });

  it('formats 3d4h30m as 3g 4h in italian, floored to the hour', () => {
    const nowMs = 0;
    const resetsAtS = 3 * 86400 + 4 * 3600 + 30 * 60;
    expect(formatCountdown(resetsAtS, nowMs, 'it')).toBe('3g 4h');
  });

  it('formats the same delta as 3d 4h in english', () => {
    const nowMs = 0;
    const resetsAtS = 3 * 86400 + 4 * 3600 + 30 * 60;
    expect(formatCountdown(resetsAtS, nowMs, 'en')).toBe('3d 4h');
  });

  it('formats 45m without rounding loss', () => {
    const nowMs = 0;
    expect(formatCountdown(45 * 60, nowMs, 'it')).toBe('~45m');
  });
});

describe('formatResetAt', () => {
  it('shows only HH:MM when the reset falls on the same local day', () => {
    // now: 2026-10-06T08:00:00+02:00 (Rome), reset: 2026-10-06T14:30:00+02:00
    const nowMs = new Date('2026-10-06T06:00:00.000Z').getTime();
    const resetsAtS = new Date('2026-10-06T12:30:00.000Z').getTime() / 1000;
    expect(formatResetAt(resetsAtS, nowMs, 'it', { timeZone: ROME_TZ })).toBe('14:30');
  });

  it('prefixes the abbreviated weekday when the reset falls on a different day (it)', () => {
    // now: 2026-10-06T08:00:00+02:00 (Rome, tuesday), reset: 2026-10-09T09:00:00+02:00 (friday)
    const nowMs = new Date('2026-10-06T06:00:00.000Z').getTime();
    const resetsAtS = new Date('2026-10-09T07:00:00.000Z').getTime() / 1000;
    expect(formatResetAt(resetsAtS, nowMs, 'it', { timeZone: ROME_TZ })).toBe('ven 09:00');
  });

  it('prefixes the abbreviated weekday in english', () => {
    const nowMs = new Date('2026-10-06T06:00:00.000Z').getTime();
    const resetsAtS = new Date('2026-10-09T07:00:00.000Z').getTime() / 1000;
    expect(formatResetAt(resetsAtS, nowMs, 'en', { timeZone: ROME_TZ })).toBe('Fri 09:00');
  });
});

describe('formatReset', () => {
  it('combines the clock time and the parenthesized countdown', () => {
    // now: 2026-10-06T12:15:00+02:00, reset: 2026-10-06T14:30:00+02:00 -> same day, +2h15m
    const nowMs = new Date('2026-10-06T10:15:00.000Z').getTime();
    const resetsAtS = new Date('2026-10-06T12:30:00.000Z').getTime() / 1000;
    expect(formatReset(resetsAtS, nowMs, 'it', { timeZone: ROME_TZ })).toBe('14:30 (~2h 15m)');
  });

  it('combines weekday+clock and the day-granularity countdown', () => {
    // now: 2026-10-06T05:00:00+02:00 (tuesday), reset: 2026-10-09T09:00:00+02:00 (friday) -> 3g 4h
    const nowMs = new Date('2026-10-06T03:00:00.000Z').getTime();
    const resetsAtS = new Date('2026-10-09T07:00:00.000Z').getTime() / 1000;
    expect(formatReset(resetsAtS, nowMs, 'it', { timeZone: ROME_TZ })).toBe('ven 09:00 (3g 4h)');
  });
});

describe('countdownBucket', () => {
  it('stays unchanged within the same 15-minute step below 24h', () => {
    const resetsAtS = 100 * 60;
    const nowA = 0;
    const nowB = 3 * 60 * 1000; // 3 minutes later, same 15-min bucket
    expect(countdownBucket(resetsAtS, nowA)).toBe(countdownBucket(resetsAtS, nowB));
  });

  it('changes once the delta crosses into the next 15-minute step', () => {
    const resetsAtS = 100 * 60;
    const nowA = 0;
    const nowB = 16 * 60 * 1000; // 16 minutes later, crossed one 15-min step
    expect(countdownBucket(resetsAtS, nowA)).not.toBe(countdownBucket(resetsAtS, nowB));
  });

  it('stays unchanged within the same hour above 24h', () => {
    const resetsAtS = 100 * 3600 + 30 * 60; // 100h30m: not on an exact hour boundary
    const nowA = 0;
    const nowB = 10 * 60 * 1000; // 10 minutes later, same hour bucket
    expect(countdownBucket(resetsAtS, nowA)).toBe(countdownBucket(resetsAtS, nowB));
  });

  it('changes once the delta crosses into the next hour above 24h', () => {
    const resetsAtS = 100 * 3600;
    const nowA = 0;
    const nowB = 61 * 60 * 1000; // 61 minutes later, crossed one hour step
    expect(countdownBucket(resetsAtS, nowA)).not.toBe(countdownBucket(resetsAtS, nowB));
  });
});

describe('isStale', () => {
  it('is not stale right at capture time', () => {
    expect(isStale(1_000, 1_000_000, STALE_AFTER_MS)).toBe(false);
  });

  it('is not stale one millisecond before the threshold', () => {
    const capturedAtS = 0;
    const nowMs = STALE_AFTER_MS - 1;
    expect(isStale(capturedAtS, nowMs, STALE_AFTER_MS)).toBe(false);
  });

  it('is stale exactly at the threshold', () => {
    const capturedAtS = 0;
    const nowMs = STALE_AFTER_MS;
    expect(isStale(capturedAtS, nowMs, STALE_AFTER_MS)).toBe(true);
  });

  it('is stale well past the threshold', () => {
    const capturedAtS = 0;
    const nowMs = STALE_AFTER_MS * 10;
    expect(isStale(capturedAtS, nowMs, STALE_AFTER_MS)).toBe(true);
  });

  it('treats a capture timestamp in the future as not stale', () => {
    const capturedAtS = 10_000;
    const nowMs = 0;
    expect(isStale(capturedAtS, nowMs, STALE_AFTER_MS)).toBe(false);
  });

  it('exports STALE_AFTER_MS as 30 minutes', () => {
    expect(STALE_AFTER_MS).toBe(30 * 60 * 1000);
  });
});
