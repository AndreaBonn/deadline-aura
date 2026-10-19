'use strict';

/**
 * One data-sync cycle: sync, publish the summary, log source errors, refresh the UI.
 * A failure anywhere in the cycle is logged and never propagated.
 *
 * @param {object} deps - Injected collaborators.
 * @param {string} deps.tag - Log prefix for source errors, e.g. "data-sync".
 * @param {string} deps.failureLabel - Log prefix for an exception.
 * @param {() => Promise<{errors?: object[]}>} deps.sync - Runs the sync.
 * @param {(result: object, now: number) => object} deps.summarize - Reduces the result.
 * @param {(summary: object) => void} deps.onStatus - Receives the summary.
 * @param {(options?: {force: boolean}) => unknown} deps.refresh - Redraws the UI.
 * @param {{error: Function}} deps.log - Logger.
 * @param {boolean} [deps.force] - Forwarded to refresh as { force: true }.
 * @param {() => number} [deps.now] - Clock, defaults to Date.now.
 * @returns {Promise<void>}
 */
async function runSyncCycle({
  tag,
  failureLabel,
  sync,
  summarize,
  onStatus,
  refresh,
  log,
  force = false,
  now = Date.now,
}) {
  try {
    const syncResult = await sync();
    onStatus(summarize(syncResult, now()));
    if (syncResult.errors && syncResult.errors.length > 0) {
      log.error(`[${tag}] errors:`, JSON.stringify(syncResult.errors));
    }
    if (force) {
      refresh({ force: true });
    } else {
      refresh();
    }
  } catch (err) {
    log.error(failureLabel, err.message);
  }
}

module.exports = { runSyncCycle };
