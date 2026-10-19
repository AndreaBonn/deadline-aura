'use strict';

function authorizeGoogle({ gcal, getConfig, runManualSync }) {
  return async () => {
    const result = await gcal.authorizeGoogle(getConfig());
    if (result.ok && !result.alreadyAuthorized) {
      // Fill the sidebar right away instead of waiting for the next scheduled sync.
      runManualSync();
    }
    return result;
  };
}

/**
 * Build the handlers that reach outside the app: Google authorization, manual
 * sync and opening links in the external browser.
 *
 * @param {object} deps - Injected collaborators.
 * @param {{authorizeGoogle: Function}} deps.gcal - Google Calendar integration.
 * @param {() => object} deps.getConfig - Live config accessor (read on every call).
 * @param {() => unknown} deps.runManualSync - Starts a manual sync cycle.
 * @param {(url: string) => void} deps.openLink - Opens a url in the external browser.
 * @returns {{handle: Object<string, Function>, on: Object<string, Function>}}
 */
function createIntegrationHandlers(deps) {
  return {
    handle: { 'google:authorize': authorizeGoogle(deps) },
    on: {
      'sync:run': () => {
        deps.runManualSync();
      },
      'shell:open-link': (url) => {
        deps.openLink(url);
      },
    },
  };
}

module.exports = { createIntegrationHandlers };
