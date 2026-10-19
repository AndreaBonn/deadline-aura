'use strict';

/**
 * Summarizes, for the settings window, whether each data source works.
 *
 * States, from the most to the least actionable: "setup" (on but fields missing),
 * "authorize" (Google only: credentials present, access not granted yet), "error"
 * (configured but failed in the last sync), "ok", and "off" (switched off).
 *
 * @param {{
 *   google: {enabled: boolean, hasCredentials: boolean, authorized: boolean},
 *   outlook: {enabled: boolean, hasUrl: boolean},
 *   jira: {enabled: boolean, instanceCount: number},
 *   failedSources: string[],
 * }} input - Facts gathered by the main process from the saved config and the last sync.
 * @returns {Array<{id: string, state: string}>} One entry per source, in display order.
 */
function describeSourceStatus({ google, outlook, jira, failedSources }) {
  const failed = new Set(failedSources);
  const stateFor = (id, enabled, configured) => {
    if (!enabled) {
      return 'off';
    }
    if (!configured) {
      return 'setup';
    }
    return failed.has(id) ? 'error' : 'ok';
  };

  let googleState = stateFor('google_calendar', google.enabled, google.hasCredentials);
  // Without granted access a failure is expected: point to the missing step instead.
  if ((googleState === 'ok' || googleState === 'error') && !google.authorized) {
    googleState = 'authorize';
  }

  return [
    { id: 'google_calendar', state: googleState },
    { id: 'outlook', state: stateFor('outlook', outlook.enabled, outlook.hasUrl) },
    { id: 'jira', state: stateFor('jira', jira.enabled, jira.instanceCount > 0) },
  ];
}

module.exports = { describeSourceStatus };
