'use strict';

const { applyFlybyAction } = require('../flyby-snooze');
const { configSchema } = require('../../config/schema');

function readFlybyState(config) {
  return {
    enabled: config.meeting_flyby?.enabled !== false,
    snoozed_until: config.meeting_flyby?.snoozed_until ?? null,
  };
}

function setState({ getConfig, applyConfig, now = Date.now }) {
  return (action) => {
    const next = applyFlybyAction(getConfig(), action, now());
    if (!next) {
      return { ok: false, error: 'INVALID_ACTION' };
    }
    const result = configSchema.safeParse(next);
    if (!result.success) {
      return { ok: false, error: 'VALIDATION_ERROR' };
    }
    applyConfig(result.data);
    return { ok: true, state: readFlybyState(getConfig()) };
  };
}

/**
 * Build the meeting flyby IPC handlers.
 * @param {object} deps - Current config accessor, persistence and optional clock.
 * @returns {Object<string, Function>} Channel -> handler(payload).
 */
function createFlybyHandlers(deps) {
  return {
    'flyby:get-state': () => readFlybyState(deps.getConfig()),
    'flyby:set-state': setState(deps),
  };
}

module.exports = { createFlybyHandlers };
