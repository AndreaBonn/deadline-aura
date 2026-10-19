const { formatCountdown } = require('../../core/postit-renderer');

const HOUR_MS = 3600000;
const NOW = new Date('2026-10-19T12:00:00Z').getTime();

describe('postit-renderer - formatCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows minutes when less than an hour is left', () => {
    expect(formatCountdown(NOW + 0.5 * HOUR_MS)).toBe('30m');
  });

  it('shows 1h instead of 60m when the minutes round up to the hour', () => {
    expect(formatCountdown(NOW + (59.7 / 60) * HOUR_MS)).toBe('1h');
  });

  it('shows whole hours within the day', () => {
    expect(formatCountdown(NOW + 5.5 * HOUR_MS)).toBe('5h');
  });

  it('returns an empty string without a due date', () => {
    expect(formatCountdown(null)).toBe('');
  });
});
