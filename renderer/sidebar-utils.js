'use strict';

/* global t */
// i18n: use global t() in browser, require module in Node.js (tests)
function _getTranslator() {
  if (typeof t === 'function') {
    return t;
  }
  if (typeof module !== 'undefined') {
    return require('../i18n').t;
  }
  return function (key) {
    return key;
  };
}

const _t = _getTranslator();

/**
 * Formats a remaining-hours value into a human-readable countdown string.
 *
 * @param {number|null} hoursRemaining - Hours until the deadline, or null if no due date.
 * @returns {string} Formatted string: '', 'scaduto'/'expired', '30m', '2h 15m', etc.
 */
function formatCountdown(hoursRemaining) {
  if (hoursRemaining === null) {
    return '';
  }
  if (hoursRemaining < 0) {
    return _t('countdown.expired');
  }
  if (hoursRemaining < 1) {
    return `${Math.round(hoursRemaining * 60)}m`;
  }
  if (hoursRemaining < 24) {
    const hrs = Math.floor(hoursRemaining);
    const mins = Math.round((hoursRemaining - hrs) * 60);
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  if (hoursRemaining < 48) {
    return _t('countdown.tomorrow');
  }
  return `${Math.round(hoursRemaining / 24)} ${_t('countdown.days')}`;
}

/**
 * Maps a normalised urgency score (0–1) to an HSL background color string.
 *
 * @param {number} score - Urgency score in [0, 1].
 * @returns {string} CSS hsl() color string.
 */
function urgencyToColor(score) {
  const hue = Math.round(160 - score * 160);
  const sat = Math.round(35 + score * 25);
  const light = Math.round(30 + score * 15);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

// CommonJS export for Node.js / test environment.
// In the browser the functions are available as globals via <script src>.
if (typeof module !== 'undefined') {
  module.exports = { formatCountdown, urgencyToColor };
}
