'use strict';

// AI failures are not a data-source problem: the score panel already reports them.
const NON_SOURCE_ERRORS = new Set(['ai']);

/**
 * Reduces a sync result to what the sidebar shows: when it ran and which sources failed.
 *
 * @param {{errors?: Array<{source: string}>}} syncResult - Value returned by syncDaemon.sync().
 * @param {number} now - Epoch ms of completion.
 * @returns {{at: number, failedSources: string[]}} Summary with each failed source listed once.
 */
function summarizeSync(syncResult, now) {
  const failed = [];
  for (const error of syncResult.errors || []) {
    if (!NON_SOURCE_ERRORS.has(error.source) && !failed.includes(error.source)) {
      failed.push(error.source);
    }
  }
  return { at: now, failedSources: failed };
}

module.exports = { summarizeSync };
