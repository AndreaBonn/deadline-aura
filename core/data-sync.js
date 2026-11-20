'use strict';

const DEFAULT_DATA_SYNC_MINUTES = 10;
const MINUTE_MS = 60000;
// Past this age a cycle counts as hung (a request with no answer): new syncs stop waiting for
// it. Above the 5 minutes a Google consent page may legitimately keep a cycle open.
const STALE_CYCLE_MS = 10 * MINUTE_MS;

class DataSync {
  #deps;
  #setIntervalFn;
  #clearIntervalFn;
  #lastStatus = null;
  #timer = null;
  #timerMinutes = null;
  // The cycle in flight, {promise, startedAt}. Startup, manual and periodic syncs share it:
  // two overlapping cycles pay the AI scoring twice and the last to finish overwrites the
  // newer status.
  #inFlight = null;
  // A manual sync asked while a cycle runs: it runs once after it, since the user may have just
  // authorized a source the running cycle started without.
  #manualRerun = null;

  constructor(deps) {
    this.#deps = deps;
    this.#setIntervalFn = deps.setIntervalFn || setInterval;
    this.#clearIntervalFn = deps.clearIntervalFn || clearInterval;
  }

  // Public methods are arrow fields: main.js passes them around detached.
  #runningCycle() {
    const now = (this.#deps.now || Date.now)();
    if (this.#inFlight && now - this.#inFlight.startedAt < STALE_CYCLE_MS) {
      return this.#inFlight.promise;
    }
    return null;
  }

  // A request that finds a cycle running gets that cycle, with that cycle's options (force
  // included): what it needs is fresh data, which the running cycle is fetching.
  runSyncAndRefresh = (options) => {
    const running = this.#runningCycle();
    if (running) {
      return running;
    }
    const { runSyncCycle, summarize, refresh, log } = this.#deps;
    const entry = { startedAt: (this.#deps.now || Date.now)(), promise: null };
    entry.promise = Promise.resolve(
      runSyncCycle({
        summarize,
        onStatus: (summary) => {
          this.#lastStatus = summary;
        },
        refresh: (...args) => refresh(...args),
        log,
        ...options,
      }),
    ).finally(() => {
      // A hung cycle replaced by a newer one must not clear the newer one.
      if (this.#inFlight === entry) {
        this.#inFlight = null;
      }
    });
    this.#inFlight = entry;
    return entry.promise;
  };

  runManualSync = () => {
    const options = {
      tag: 'sync-now',
      failureLabel: 'Manual sync error:',
      sync: () => this.#deps.getSyncDaemon().sync(this.#deps.getConfig()),
    };
    const running = this.#runningCycle();
    if (!running) {
      return this.runSyncAndRefresh(options);
    }
    if (!this.#manualRerun) {
      this.#manualRerun = this.#afterCycle(running).then(() => {
        this.#manualRerun = null;
        return this.runSyncAndRefresh(options);
      });
    }
    return this.#manualRerun;
  };

  // Settles when the running cycle ends or turns stale, whichever comes first. Only the order
  // matters here: the running cycle reports its own failure to its callers.
  #afterCycle(running) {
    const now = (this.#deps.now || Date.now)();
    const remaining = this.#inFlight.startedAt + STALE_CYCLE_MS - now;
    let timeout;
    const stale = new Promise((resolve) => (timeout = setTimeout(resolve, remaining)));
    return Promise.race([running.catch(() => {}), stale]).finally(() => clearTimeout(timeout));
  }

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

  stop = () => {
    this.#clearIntervalFn(this.#timer);
    this.#timer = null;
  };
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
