'use strict';

/**
 * Pure snooze/disable logic for the meeting flyby, shared between the main
 * process (gate in meeting-flyby.js) and the sidebar renderer (cat icon state).
 * No DOM and no electron deps, so it loads both as a CommonJS module (tests,
 * main) and as a browser global via <script src> (renderer), like sidebar-utils.
 */

const MS_PER_HOUR = 60 * 60 * 1000;

// Durations offered by the cat menu, in milliseconds.
const SNOOZE_DURATIONS_MS = {
  '1h': 1 * MS_PER_HOUR,
  '3h': 3 * MS_PER_HOUR,
  '24h': 24 * MS_PER_HOUR,
};

// Actions the cat menu can dispatch to flyby:set-state.
const FLYBY_ACTIONS = ['snooze-1h', 'snooze-3h', 'snooze-24h', 'disable', 'reactivate'];

/**
 * Whether the flyby must be suppressed right now.
 *
 * @param {object} state - Current flyby state.
 * @param {boolean} state.enabled - Master enable flag.
 * @param {number|null} [state.snoozed_until] - Epoch ms until which it is snoozed.
 * @param {number} state.now - Current epoch ms.
 * @returns {boolean} True when the flyby should not launch.
 */
function isFlybySuppressed({ enabled, snoozed_until, now }) {
  if (!enabled) {
    return true;
  }
  if (typeof snoozed_until === 'number' && now < snoozed_until) {
    return true;
  }
  return false;
}

/**
 * Build the meeting_flyby patch for a cat-menu action.
 *
 * @param {string} action - One of FLYBY_ACTIONS.
 * @param {number} now - Current epoch ms.
 * @returns {{enabled: boolean, snoozed_until: number|null}|null} Patch, or null if the action is unknown.
 */
function buildFlybyPatch(action, now) {
  switch (action) {
    case 'snooze-1h':
      return { enabled: true, snoozed_until: now + SNOOZE_DURATIONS_MS['1h'] };
    case 'snooze-3h':
      return { enabled: true, snoozed_until: now + SNOOZE_DURATIONS_MS['3h'] };
    case 'snooze-24h':
      return { enabled: true, snoozed_until: now + SNOOZE_DURATIONS_MS['24h'] };
    case 'disable':
      return { enabled: false, snoozed_until: null };
    case 'reactivate':
      return { enabled: true, snoozed_until: null };
    default:
      return null;
  }
}

/**
 * Apply a cat-menu action to a config, patching only meeting_flyby so a
 * concurrent Settings save is not clobbered.
 *
 * @param {object} config - Current config object.
 * @param {string} action - One of FLYBY_ACTIONS.
 * @param {number} now - Current epoch ms.
 * @returns {object|null} A new config with the patch applied, or null if the action is unknown.
 */
function applyFlybyAction(config, action, now) {
  const patch = buildFlybyPatch(action, now);
  if (!patch) {
    return null;
  }
  return { ...config, meeting_flyby: { ...config.meeting_flyby, ...patch } };
}

// CommonJS export for Node.js / test environment.
// In the browser the functions are available as globals via <script src>.
if (typeof module !== 'undefined') {
  module.exports = {
    isFlybySuppressed,
    buildFlybyPatch,
    applyFlybyAction,
    SNOOZE_DURATIONS_MS,
    FLYBY_ACTIONS,
  };
}
