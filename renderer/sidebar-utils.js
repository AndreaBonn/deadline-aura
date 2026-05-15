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

/**
 * Formats elapsed milliseconds from a start ISO timestamp into HH:MM:SS or MM:SS.
 *
 * @param {string} startIso - ISO 8601 start timestamp.
 * @returns {string} Formatted elapsed time string.
 */
function formatElapsed(startIso) {
  const diff = Math.max(0, Date.now() - new Date(startIso).getTime());
  const totalSeconds = Math.floor(diff / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? pad(h) + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
}

/**
 * Determines the display status of a calendar/task event.
 *
 * @param {object} task - Task object with start_at, due_at, hours_remaining, source.
 * @param {number} now - Current timestamp in ms.
 * @returns {{ status: string, label: string }} status ('ongoing'|'ended'|'future'|'default') and display label.
 */
function getEventStatus(task, now) {
  if (task.source === 'gcal' && task.start_at && task.due_at) {
    if (now >= task.start_at && now < task.due_at) {
      const endDate = new Date(task.due_at);
      const endTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return { status: 'ongoing', label: _t('countdown.ongoing') + ' - ' + endTime };
    }
    if (now >= task.due_at) {
      return { status: 'ended', label: _t('countdown.ended') };
    }
    const startDate = new Date(task.start_at);
    const startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const hoursToStart = (task.start_at - now) / 3600000;
    return { status: 'future', label: startTime + ' - ' + formatCountdown(hoursToStart) };
  }
  return { status: 'default', label: formatCountdown(task.hours_remaining) };
}

// CommonJS export for Node.js / test environment.
// In the browser the functions are available as globals via <script src>.
if (typeof module !== 'undefined') {
  module.exports = { formatCountdown, urgencyToColor, formatElapsed, getEventStatus };
}
