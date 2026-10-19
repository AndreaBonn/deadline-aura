'use strict';

const { mergeIpcGroups } = require('../core/ipc/register-ipc');
const { createLocalTaskHandlers } = require('../core/ipc/local-task-handlers');
const { createCalendarHandlers } = require('../core/ipc/calendar-handlers');
const { createSettingsHandlers } = require('../core/ipc/settings-handlers');
const { createFlybyHandlers } = require('../core/ipc/flyby-handlers');
const { createAppStateHandlers } = require('../core/ipc/app-state-handlers');
const { createIntegrationHandlers } = require('../core/ipc/integration-handlers');
const { createAiUsageHandlers } = require('../core/ipc/ai-usage-handlers');
const { createTaskFavoriteHandlers } = require('../core/ipc/task-favorite-handlers');
const { createWindowHandlers } = require('./window-handlers');
const { describeSourceStatus, collectSourceFacts } = require('../core/source-status');
const { maskConfigForRenderer, restoreTokens } = require('../config/secret-masking');
const { DEFAULTS } = require('../config/defaults');
const { configSchema } = require('../config/schema');

function createConfigGroup(deps) {
  return {
    handle: {
      ...createLocalTaskHandlers({ localQueries: deps.localQueries, refresh: deps.refresh }),
      ...createCalendarHandlers({
        gcal: deps.gcal,
        getConfig: deps.getConfig,
        saveConfig: deps.saveConfig,
      }),
      ...createSettingsHandlers({
        getConfig: deps.getConfig,
        defaults: DEFAULTS,
        maskConfigForRenderer,
        restoreTokens,
        configSchema,
        describeSourceStatus,
        collectSourceFacts,
        gcal: deps.gcal,
        jira: deps.jira,
        getLastSyncStatus: deps.getLastSyncStatus,
        applyConfig: deps.applySettings,
      }),
      ...createFlybyHandlers({ getConfig: deps.getConfig, applyConfig: deps.applyFlyby }),
    },
  };
}

function createServiceGroups(deps) {
  return [
    createAppStateHandlers({
      getConfig: deps.getConfig,
      deadlineEngine: deps.deadlineEngine,
      db: deps.db,
      i18n: deps.i18n,
      firstRunHint: deps.firstRunHint,
      log: deps.log,
    }),
    createIntegrationHandlers({
      gcal: deps.gcal,
      getConfig: deps.getConfig,
      runManualSync: deps.runManualSync,
      openLink: deps.openLink,
    }),
    {
      handle: createAiUsageHandlers({
        runCaptureCommand: deps.runCaptureCommand,
        syncCaptureBin: deps.syncCaptureBin,
        homedir: deps.homedir,
      }),
    },
    createTaskFavoriteHandlers({ favoriteQueries: deps.favoriteQueries, refresh: deps.refresh }),
  ];
}

/**
 * Build every IPC channel main.js registers in one call, except those the
 * meeting-dock and overlay window modules register themselves.
 *
 * Stateful dependencies are injected; config is read through `getConfig()` on
 * every call because main.js reassigns it after each save.
 *
 * @param {object} deps - Windows (sidebar, settings), stores, integrations,
 *   accessors (getConfig, getLastSyncStatus), actions (refresh, runManualSync,
 *   openLink, saveConfig, applySettings, applyFlyby) and ai-usage capture hooks.
 * @returns {{handle: object, on: object}} Merged groups; throws on a duplicate channel.
 */
function createAppIpcGroups(deps) {
  return mergeIpcGroups(
    createWindowHandlers({ sidebar: deps.sidebar, settings: deps.settings }),
    ...createServiceGroups(deps),
    createConfigGroup(deps),
  );
}

module.exports = { createAppIpcGroups };
