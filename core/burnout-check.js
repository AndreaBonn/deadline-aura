'use strict';

const HOUR_MS = 3600000;
const DEFAULT_CHECK_INTERVAL_HOURS = 2;
const HISTORY_DAYS = 7;

/** Interval of the periodic burnout check, from the config at the time of the call. */
function burnoutIntervalMs(config) {
  return (config.burnout?.check_interval_hours || DEFAULT_CHECK_INTERVAL_HOURS) * HOUR_MS;
}

/**
 * Build the periodic burnout check: reads the live config on every run.
 *
 * @param {object} deps - Injected collaborators.
 * @param {() => object} deps.getConfig - Live config accessor.
 * @param {{getAiCacheHistory: Function}} deps.db - Store.
 * @param {{detectBurnoutRisk: Function}} deps.burnoutDetector - Detector.
 * @param {{sendBurnoutWarning: Function}} deps.notifier - Notifier.
 * @returns {() => void}
 */
function createBurnoutCheck({ getConfig, db, burnoutDetector, notifier }) {
  return () => {
    const config = getConfig();
    if (!config.burnout?.enabled) {
      return;
    }
    const warning = burnoutDetector.detectBurnoutRisk(db.getAiCacheHistory(HISTORY_DAYS), {
      stress_threshold: config.burnout?.stress_threshold,
      consecutive_days: config.burnout?.consecutive_days,
    });
    if (warning.isAtRisk) {
      notifier.sendBurnoutWarning(warning, config);
    }
  };
}

module.exports = { createBurnoutCheck, burnoutIntervalMs };
