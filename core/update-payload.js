'use strict';

/**
 * Builds the deadline-engine options from the app config.
 *
 * @param {{sync: {lookahead_hours: number}, engine: {k_constant?: number, priority_weights?: object}}} config
 * @returns {{lookaheadHours: number, k: number|undefined, priorityWeights: object|undefined}}
 */
function engineOptionsFromConfig(config) {
  return {
    lookaheadHours: config.sync.lookahead_hours,
    k: config.engine.k_constant,
    priorityWeights: config.engine.priority_weights,
  };
}

/**
 * Extracts the sidebar's AI note and stress forecast from the cached AI response.
 *
 * @param {object|null|undefined} aiResponse - Parsed cache entry, null when absent or malformed.
 * @returns {{clinicalNote: string|null, stressForecast: object[]}}
 */
function aiNotesFromCache(aiResponse) {
  return {
    clinicalNote: aiResponse?.note || aiResponse?.clinical_note || null,
    stressForecast: aiResponse?.daily_breakdown || [],
  };
}

/**
 * Assembles the payload of the sidebar "update" message.
 *
 * @param {object} parts - Engine result, palette, pinned id set, favorite ids, cached AI
 *   response, last sync status, Google readiness and first-run hint flag.
 * @returns {object} Sidebar update payload.
 */
function buildSidebarUpdate(parts) {
  const { clinicalNote, stressForecast } = aiNotesFromCache(parts.aiResponse);
  return {
    engineResult: parts.engineResult,
    palette: parts.palette,
    pinnedTaskIds: Array.from(parts.pinnedIds),
    favoriteTaskIds: parts.favoriteIds,
    clinicalNote,
    stressForecast,
    syncStatus: parts.syncStatus,
    googleCalendarReady: parts.googleCalendarReady,
    showFirstRunHint: parts.showFirstRunHint,
  };
}

module.exports = { engineOptionsFromConfig, aiNotesFromCache, buildSidebarUpdate };
