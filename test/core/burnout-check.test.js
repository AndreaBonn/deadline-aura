const { createBurnoutCheck, burnoutIntervalMs } = require('../../core/burnout-check');

const HOUR_MS = 3600000;

function setup(burnout, warning = { isAtRisk: true }) {
  const config = { burnout };
  const db = { getAiCacheHistory: vi.fn(() => ['h']) };
  const burnoutDetector = { detectBurnoutRisk: vi.fn(() => warning) };
  const notifier = { sendBurnoutWarning: vi.fn() };
  const check = createBurnoutCheck({ getConfig: () => config, db, burnoutDetector, notifier });
  return { config, db, burnoutDetector, notifier, check };
}

describe('burnoutIntervalMs', () => {
  it('converts the configured hours to milliseconds', () => {
    expect(burnoutIntervalMs({ burnout: { check_interval_hours: 5 } })).toBe(5 * HOUR_MS);
  });

  it.each([[{}], [{ burnout: {} }], [{ burnout: { check_interval_hours: 0 } }]])(
    'defaults to 2 hours for %j',
    (config) => {
      expect(burnoutIntervalMs(config)).toBe(2 * HOUR_MS);
    },
  );
});

describe('createBurnoutCheck', () => {
  it('does nothing when burnout detection is disabled or absent', () => {
    for (const burnout of [undefined, { enabled: false }]) {
      const { check, db, notifier } = setup(burnout);
      check();
      expect(db.getAiCacheHistory).not.toHaveBeenCalled();
      expect(notifier.sendBurnoutWarning).not.toHaveBeenCalled();
    }
  });

  it('detects over the last 7 days with the configured thresholds and notifies on risk', () => {
    const { check, db, burnoutDetector, notifier, config } = setup({
      enabled: true,
      stress_threshold: 7,
      consecutive_days: 3,
    });
    check();
    expect(db.getAiCacheHistory).toHaveBeenCalledWith(7);
    expect(burnoutDetector.detectBurnoutRisk).toHaveBeenCalledWith(['h'], {
      stress_threshold: 7,
      consecutive_days: 3,
    });
    expect(notifier.sendBurnoutWarning).toHaveBeenCalledWith({ isAtRisk: true }, config);
  });

  it('does not notify when the detector reports no risk', () => {
    const { check, notifier } = setup({ enabled: true }, { isAtRisk: false });
    check();
    expect(notifier.sendBurnoutWarning).not.toHaveBeenCalled();
  });
});
