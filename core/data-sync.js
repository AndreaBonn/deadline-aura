'use strict';

const DEFAULT_DATA_SYNC_MINUTES = 10;
const MINUTE_MS = 60000;

class DataSync {
  #deps;
  #setIntervalFn;
  #clearIntervalFn;
  #lastStatus = null;
  #timer = null;
  #timerMinutes = null;

  constructor(deps) {
    this.#deps = deps;
    this.#setIntervalFn = deps.setIntervalFn || setInterval;
    this.#clearIntervalFn = deps.clearIntervalFn || clearInterval;
  }

  // Public methods are arrow fields: main.js passes them around detached.
  runSyncAndRefresh = (options) => {
    const { runSyncCycle, summarize, refresh, log } = this.#deps;
    return runSyncCycle({
      summarize,
      onStatus: (summary) => {
        this.#lastStatus = summary;
      },
      refresh: (...args) => refresh(...args),
      log,
      ...options,
    });
  };

  runManualSync = () =>
    this.runSyncAndRefresh({
      tag: 'sync-now',
      failureLabel: 'Manual sync error:',
      sync: () => this.#deps.getSyncDaemon().sync(this.#deps.getConfig()),
    });

  /** (Re)starts the periodic sync; a changed interval applies without a restart. */
  scheduleDataSync = () => {
    const { getConfig, getSyncDaemon } = this.#deps;
    const minutes = getConfig().sync.data_interval_minutes || DEFAULT_DATA_SYNC_MINUTES;
    if (this.#timer && minutes === this.#timerMinutes) {
      return;
    }
    this.#clearIntervalFn(this.#timer);
    this.#timerMinutes = minutes;
    const daemon = getSyncDaemon();
    this.#timer = this.#setIntervalFn(
      () =>
        this.runSyncAndRefresh({
          tag: 'data-sync',
          failureLabel: '[data-sync] error:',
          sync: () => daemon.sync(getConfig()),
          force: true,
        }),
      minutes * MINUTE_MS,
    );
  };

  startupSync = () => {
    const { getConfig, getSyncDaemon, log } = this.#deps;
    const daemon = getSyncDaemon();
    return this.runSyncAndRefresh({
      tag: 'startup-sync',
      failureLabel: '[startup-sync] failed:',
      sync: () =>
        daemon.sync(getConfig()).then((syncResult) => {
          log.log(`[startup-sync] complete: gcal=${syncResult.gcal}, jira=${syncResult.jira}`);
          return syncResult;
        }),
      force: true,
    });
  };

  getLastStatus = () => this.#lastStatus;

  stop = () => this.#clearIntervalFn(this.#timer);
}

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
 * @returns {DataSync} runSyncAndRefresh, runManualSync, scheduleDataSync, startupSync,
 *   getLastStatus, stop.
 */
function createDataSync(deps) {
  return new DataSync(deps);
}

module.exports = { createDataSync };
