'use strict';

const { engineOptionsFromConfig } = require('../update-payload');

function scoreBreakdown({ getConfig, deadlineEngine, db, log }) {
  return () => {
    try {
      const result = deadlineEngine.run(engineOptionsFromConfig(getConfig()));
      const aiResponse = db.getLatestAiCacheResponse();
      return {
        breakdown: result.breakdown,
        ai_daily_breakdown: aiResponse?.daily_breakdown || null,
      };
    } catch (err) {
      log.error('[score:get-breakdown] error:', err.message);
      return null;
    }
  };
}

/**
 * Build the read-only app-state handlers plus the first-run hint dismissal.
 *
 * @param {object} deps - Injected collaborators.
 * @param {() => object} deps.getConfig - Live config accessor (read on every call).
 * @param {{run: Function}} deps.deadlineEngine - Score engine.
 * @param {{getLatestAiCacheResponse: Function}} deps.db - Store with the AI cache.
 * @param {{getTranslations: Function}} deps.i18n - Translations source.
 * @param {{dismiss: Function}} deps.firstRunHint - First-run hint state.
 * @param {{error: Function}} deps.log - Logger.
 * @returns {{handle: Object<string, Function>, on: Object<string, Function>}}
 */
function createAppStateHandlers(deps) {
  return {
    handle: {
      'i18n:get-translations': () => deps.i18n.getTranslations(),
      'score:get-breakdown': scoreBreakdown(deps),
      'config:get-work-shift': () => deps.getConfig().work_shift || null,
    },
    on: {
      'onboarding:dismiss-hint': () => deps.firstRunHint.dismiss(),
    },
  };
}

module.exports = { createAppStateHandlers };
