'use strict';

const { formatElapsed } = require('../../renderer/sidebar-utils');

describe('formatElapsed', () => {
  it('returns 00:00 for current timestamp', () => {
    const result = formatElapsed(new Date().toISOString());
    expect(result).toBe('00:00');
  });

  it('returns MM:SS for sub-hour elapsed', () => {
    const start = new Date(Date.now() - 5 * 60 * 1000 - 30 * 1000).toISOString();
    expect(formatElapsed(start)).toBe('05:30');
  });

  it('returns HH:MM:SS when elapsed exceeds one hour', () => {
    const start = new Date(Date.now() - 3661 * 1000).toISOString();
    expect(formatElapsed(start)).toBe('01:01:01');
  });

  it('returns 00:00 for future timestamps (clamps to zero)', () => {
    const future = new Date(Date.now() + 60000).toISOString();
    expect(formatElapsed(future)).toBe('00:00');
  });

  it('pads single-digit values with leading zeros', () => {
    const start = new Date(Date.now() - 9000).toISOString();
    expect(formatElapsed(start)).toBe('00:09');
  });

  it('formats exactly one hour', () => {
    const start = new Date(Date.now() - 3600 * 1000).toISOString();
    expect(formatElapsed(start)).toBe('01:00:00');
  });
});
