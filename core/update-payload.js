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

module.exports = { engineOptionsFromConfig, aiNotesFromCache };
