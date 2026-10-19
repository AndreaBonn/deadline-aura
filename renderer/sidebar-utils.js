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
  // Round the total minutes once, so 59.6 minutes become the next hour rather than "60m".
  const totalMinutes = Math.round(hoursRemaining * 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  if (hoursRemaining < 24) {
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
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

// Text needs more lightness than the card border to reach 4.5:1 on the dark sidebar.
const URGENCY_TEXT_LIGHTNESS = 66;

/**
 * Same hue as urgencyToColor(), lightened for text on the dark sidebar.
 *
 * @param {number} score - Urgency score in [0, 1].
 * @returns {string} CSS hsl() color string readable on #0a0c14.
 */
function urgencyToTextColor(score) {
  const hue = Math.round(160 - score * 160);
  const sat = Math.round(45 + score * 25);
  return `hsl(${hue}, ${sat}%, ${URGENCY_TEXT_LIGHTNESS}%)`;
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
// Kept in sync with CALENDAR_SOURCES in core/calendar-sources.js: this file is
// loaded as a plain browser script, so it cannot require the shared module.
const CALENDAR_SOURCES = ['gcal', 'outlook'];

function getEventStatus(task, now) {
  if (CALENDAR_SOURCES.includes(task.source) && task.start_at && task.due_at) {
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

const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;

function extractJiraKey(title) {
  const match = title.match(JIRA_KEY_PATTERN);
  return match ? match[1] : null;
}

function buildEventSummary(jiraKey, title) {
  if (!jiraKey) {
    return title;
  }
  const cleanTitle = title
    .replace(jiraKey, '')
    .replace(/^[\s·-]+/, '')
    .trim();
  return '[' + jiraKey + '] - ' + cleanTitle;
}

const PRIORITY_KEYS = {
  1: 'priorities.critical',
  2: 'priorities.high',
  3: 'priorities.medium',
  4: 'priorities.low',
};

/**
 * Maps a numeric task priority (1 highest) to the i18n key of its word label.
 *
 * @param {number|null|undefined} priority - Priority from 1 to 4.
 * @returns {string|null} i18n key, or null when the task has no valid priority.
 */
function priorityKey(priority) {
  return PRIORITY_KEYS[priority] || null;
}

/**
 * Formats a 0-1 urgency score as a value out of 100 ("63/100").
 *
 * @param {number} score - Global urgency score, nominally in [0, 1].
 * @returns {string} Score out of 100, clamped to the 0-100 range.
 */
function formatScore100(score) {
  const clamped = Math.max(0, Math.min(score, 1));
  return `${Math.round(clamped * 100)}/100`;
}

/**
 * Returns the tasks that are not already listed among the favorites.
 *
 * @param {Array<{id: string}>} tasks - Tasks to filter.
 * @param {Set<string>} favoriteIds - Ids of the favorite tasks.
 * @returns {Array<{id: string}>} New array without the favorites.
 */
function withoutFavorites(tasks, favoriteIds) {
  return tasks.filter((task) => !favoriteIds.has(task.id));
}

/**
 * Returns the i18n key describing the meeting-flyby state shown in the cat menu.
 *
 * @param {{enabled: boolean, snoozed_until: number|null}} state - Flyby state.
 * @param {number} now - Current epoch ms.
 * @returns {string} One of flyby_menu.state_active, state_snoozed, state_disabled.
 */
function flybyStateKey(state, now) {
  if (!state.enabled) {
    return 'flyby_menu.state_disabled';
  }
  if (typeof state.snoozed_until === 'number' && now < state.snoozed_until) {
    return 'flyby_menu.state_snoozed';
  }
  return 'flyby_menu.state_active';
}

const SYNC_SOURCE_NAMES = {
  google_calendar: 'Google Calendar',
  google_tasks: 'Google Tasks',
  jira: 'Jira',
  outlook: 'Outlook',
};

/**
 * Builds the footer text for the last data sync.
 *
 * @param {{at: number, failedSources: string[]}|null} status - Summary sent by the main process.
 * @param {Function} translate - i18n function (key, params) => string.
 * @param {Function} formatTime - Formats an epoch ms as a short clock time.
 * @returns {{text: string, problem: string|null}} Status line and, if any, the failure line.
 */
function formatSyncStatus(status, translate, formatTime) {
  if (!status) {
    return { text: '--', problem: null };
  }
  const text = translate('sidebar.updated_at', { time: formatTime(status.at) });
  if (!status.failedSources || status.failedSources.length === 0) {
    return { text: text, problem: null };
  }
  const names = status.failedSources.map((source) => SYNC_SOURCE_NAMES[source] || source);
  return { text: text, problem: translate('sidebar.sync_problem', { sources: names.join(', ') }) };
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escapes text for HTML content and attribute values.
 *
 * @param {*} text - Value to escape; null and undefined become ''.
 * @returns {string} Escaped string, safe inside quoted attributes too.
 */
function escapeHtml(text) {
  const str = text === null || text === undefined ? '' : String(text);
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// CommonJS export for Node.js / test environment.
// In the browser the functions are available as globals via <script src>.
if (typeof module !== 'undefined') {
  module.exports = {
    formatCountdown,
    urgencyToColor,
    urgencyToTextColor,
    formatElapsed,
    getEventStatus,
    JIRA_KEY_PATTERN,
    extractJiraKey,
    buildEventSummary,
    priorityKey,
    formatScore100,
    withoutFavorites,
    flybyStateKey,
    formatSyncStatus,
    escapeHtml,
  };
}
