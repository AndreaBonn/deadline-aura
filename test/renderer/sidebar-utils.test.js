'use strict';

const { formatCountdown, urgencyToColor } = require('../../renderer/sidebar-utils');

describe('formatCountdown', () => {
  describe('null input', () => {
    it('returns empty string when hoursRemaining is null', () => {
      expect(formatCountdown(null)).toBe('');
    });
  });

  describe('overdue tasks', () => {
    it('returns "scaduto" when hoursRemaining is negative', () => {
      expect(formatCountdown(-1)).toBe('scaduto');
    });

    it('returns "scaduto" for deeply overdue tasks', () => {
      expect(formatCountdown(-100)).toBe('scaduto');
    });
  });

  describe('sub-hour deadlines', () => {
    it('returns minutes rounded for 0.5 hours', () => {
      expect(formatCountdown(0.5)).toBe('30m');
    });

    it('returns "1m" for near-zero remaining', () => {
      expect(formatCountdown(0.01)).toBe('1m');
    });

    it('does not return hours format below 1 hour', () => {
      expect(formatCountdown(0.99)).not.toContain('h');
    });
  });

  describe('same-day deadlines (1-24 hours)', () => {
    it('returns whole hours when no remainder minutes', () => {
      expect(formatCountdown(3)).toBe('3h');
    });

    it('includes minutes when remainder exists', () => {
      expect(formatCountdown(2.5)).toBe('2h 30m');
    });

    it('handles rounding at the boundary', () => {
      expect(formatCountdown(1)).toBe('1h');
    });
  });

  describe('next-day deadlines (24-48 hours)', () => {
    it('returns "domani" for 25 hours', () => {
      expect(formatCountdown(25)).toBe('domani');
    });

    it('returns "domani" at the 48-hour boundary (exclusive)', () => {
      expect(formatCountdown(47.9)).toBe('domani');
    });
  });

  describe('multi-day deadlines (>= 48 hours)', () => {
    it('returns days count for 48 hours', () => {
      expect(formatCountdown(48)).toBe('2 giorni');
    });

    it('returns rounded days for 72 hours', () => {
      expect(formatCountdown(72)).toBe('3 giorni');
    });
  });
});

describe('urgencyToColor', () => {
  it('returns a valid CSS hsl() string', () => {
    const result = urgencyToColor(0.5);
    expect(result).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
  });

  it('returns green-range hue at score 0 (calm)', () => {
    const result = urgencyToColor(0);
    // hue = 160 - 0 * 160 = 160 (green-cyan range)
    expect(result).toMatch(/^hsl\(160,/);
  });

  it('returns red-range hue at score 1 (critical)', () => {
    const result = urgencyToColor(1);
    // hue = 160 - 1 * 160 = 0 (red)
    expect(result).toMatch(/^hsl\(0,/);
  });

  it('produces higher saturation at higher scores', () => {
    const low = urgencyToColor(0);
    const high = urgencyToColor(1);
    const satLow = parseInt(low.match(/hsl\(\d+, (\d+)%/)[1], 10);
    const satHigh = parseInt(high.match(/hsl\(\d+, (\d+)%/)[1], 10);
    expect(satHigh).toBeGreaterThan(satLow);
  });

  it('produces higher lightness at higher scores', () => {
    const low = urgencyToColor(0);
    const high = urgencyToColor(1);
    const lightLow = parseInt(low.match(/(\d+)%\)$/)[1], 10);
    const lightHigh = parseInt(high.match(/(\d+)%\)$/)[1], 10);
    expect(lightHigh).toBeGreaterThan(lightLow);
  });
});
