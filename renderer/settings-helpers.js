'use strict';

/* Pure helpers for the settings window, loaded via <script> and required by the tests. */

// First segment of a config path -> settings tab that edits it.
const TAB_BY_SECTION = {
  sync: 'generale',
  sources: 'sorgenti',
  ai: 'ai',
  wallpaper: 'wallpaper',
  sidebar: 'sidebar',
  notifications: 'notifiche',
  meeting_dock: 'notifiche',
  ui: 'ui',
  language: 'ui',
  work_shift: 'turno',
  engine: 'avanzate',
};

function isFilled(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Whether the edited config differs from the last saved one.
 *
 * @param {object} current - Config being edited.
 * @param {object} saved - Config as last saved (or loaded).
 * @returns {boolean} True when there are unsaved changes.
 */
function isConfigDirty(current, saved) {
  return JSON.stringify(current) !== JSON.stringify(saved);
}

/**
 * Finds the settings tab that owns a config path reported by validation.
 *
 * @param {string} path - Dot-separated path, e.g. "ai.provider_timeout_ms".
 * @returns {string|null} Tab id, or null when no tab owns that section.
 */
function tabForIssuePath(path) {
  // The usage band toggle lives in wallpaper config but is edited in its own tab.
  if (String(path).startsWith('wallpaper.show_ai_usage')) {
    return 'limiti';
  }
  const section = String(path).split('.')[0];
  return TAB_BY_SECTION[section] || null;
}

/**
 * Whether Google Calendar has the client credentials it needs (saved secrets arrive masked).
 *
 * @param {{oauth?: {client_id?: string, client_secret?: string}}} gcal - Google Calendar config.
 * @returns {boolean} True when both client id and secret are present.
 */
function isGoogleConfigured(gcal) {
  const oauth = (gcal && gcal.oauth) || {};
  return isFilled(oauth.client_id) && isFilled(oauth.client_secret);
}

/**
 * Whether Jira has at least one complete instance.
 *
 * @param {{instances?: Array<{domain: string, email: string, api_token: string}>}} jira - Jira config.
 * @returns {boolean} True when an instance has domain, email and API token.
 */
function isJiraConfigured(jira) {
  return ((jira && jira.instances) || []).some(
    (inst) => isFilled(inst.domain) && isFilled(inst.email) && isFilled(inst.api_token),
  );
}

/**
 * Whether at least one AI provider key is filled in.
 *
 * @param {Record<string, string>|undefined} apiKeys - Provider id -> key.
 * @returns {boolean} True when AI scoring has a provider to call.
 */
function hasAnyAiKey(apiKeys) {
  return Object.values(apiKeys || {}).some(isFilled);
}

/**
 * Turns a validation issue into a sentence in the UI language (zod messages are English).
 *
 * @param {{code: string, minimum?: number, maximum?: number}} issue - Issue from the save response.
 * @param {Function} translate - i18n function (key, params) => string.
 * @returns {string} Plain-language explanation of what to change.
 */
function describeIssue(issue, translate) {
  if (issue.code === 'too_big' && issue.maximum !== undefined) {
    return translate('settings.err_max', { n: issue.maximum });
  }
  if (issue.code === 'too_small' && issue.minimum !== undefined) {
    return translate('settings.err_min', { n: issue.minimum });
  }
  return translate('settings.save_error_generic');
}

if (typeof module !== 'undefined') {
  module.exports = {
    isConfigDirty,
    tabForIssuePath,
    isGoogleConfigured,
    isJiraConfigured,
    hasAnyAiKey,
    describeIssue,
  };
}
