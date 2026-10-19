'use strict';

const DEFAULT_DATA_SYNC_MINUTES = 10;
const MINUTE_MS = 60000;

/**
 * Data sync orchestration: manual, startup and periodic cycles plus the last status.
 *
 * @param {object} deps - Injected collaborators.
 * @param {() => object} deps.getConfig - Live config accessor.
 * @param {() => {sync: Function}} deps.getSyncDaemon - Lazy accessor of the sync daemon.
 * @param {Function} deps.runSyncCycle - One sync cycle (core/sync-runner).
 * @param {Function} deps.summarize - Reduces a sync result to a status summary.
 * @param {Function} deps.refresh - Redraws the UI, called as refresh() or refresh({force}).
 * @param {{log: Function, error: Function}} deps.log - Logger.
 * @param {Function} [deps.setIntervalFn] - Timer factory.
 * @param {Function} [deps.clearIntervalFn] - Timer canceller.
 * @returns {object} runSyncAndRefresh, runManualSync, scheduleDataSync, startupSync,
 *   getLastStatus, stop.
 */
function createDataSync(deps) {
  const { getConfig, getSyncDaemon, runSyncCycle, summarize, refresh, log } = deps;
  const setIntervalFn = deps.setIntervalFn || setInterval;
  const clearIntervalFn = deps.clearIntervalFn || clearInterval;
  let lastStatus = null;
  let timer = null;
  let timerMinutes = null;

  function runSyncAndRefresh(options) {
    return runSyncCycle({
      summarize,
      onStatus: (summary) => {
        lastStatus = summary;
      },
      refresh: (...args) => refresh(...args),
      log,
      ...options,
    });
  }

  function runManualSync() {
    return runSyncAndRefresh({
      tag: 'sync-now',
      failureLabel: 'Manual sync error:',
      sync: () => getSyncDaemon().sync(getConfig()),
    });
  }

  /** (Re)starts the periodic sync; a changed interval applies without a restart. */
  function scheduleDataSync() {
    const minutes = getConfig().sync.data_interval_minutes || DEFAULT_DATA_SYNC_MINUTES;
    if (timer && minutes === timerMinutes) {
      return;
    }
    clearIntervalFn(timer);
    timerMinutes = minutes;
    const daemon = getSyncDaemon();
    timer = setIntervalFn(
      () =>
        runSyncAndRefresh({
          tag: 'data-sync',
          failureLabel: '[data-sync] error:',
          sync: () => daemon.sync(getConfig()),
          force: true,
        }),
      minutes * MINUTE_MS,
    );
  }

  function startupSync() {
    const daemon = getSyncDaemon();
    return runSyncAndRefresh({
      tag: 'startup-sync',
      failureLabel: '[startup-sync] failed:',
      sync: () =>
        daemon.sync(getConfig()).then((syncResult) => {
          log.log(`[startup-sync] complete: gcal=${syncResult.gcal}, jira=${syncResult.jira}`);
          return syncResult;
        }),
      force: true,
    });
  }

  return {
    runSyncAndRefresh,
    runManualSync,
    scheduleDataSync,
    startupSync,
    getLastStatus: () => lastStatus,
    stop: () => clearIntervalFn(timer),
  };
}

module.exports = { createDataSync };
