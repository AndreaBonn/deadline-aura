'use strict';

/**
 * Build the AI-usage capture handlers (status/install/uninstall of the capture hooks).
 * Install and uninstall refresh the stable copy of the capture scripts first.
 *
 * @param {object} deps - Injected collaborators.
 * @param {(command: string, options: {home: string}) => unknown} deps.runCaptureCommand
 * @param {() => void} deps.syncCaptureBin - Refreshes the scripts; must not throw.
 * @param {() => string} deps.homedir - User home accessor.
 * @returns {Object<string, Function>} Channel -> handler(payload).
 */
function createAiUsageHandlers({ runCaptureCommand, syncCaptureBin, homedir }) {
  const run = (command) => runCaptureCommand(command, { home: homedir() });
  const syncThenRun = (command) => () => {
    syncCaptureBin();
    return run(command);
  };
  return {
    'ai-usage:capture-status': () => run('status'),
    'ai-usage:capture-install': syncThenRun('install'),
    'ai-usage:capture-uninstall': syncThenRun('uninstall'),
  };
}

module.exports = { createAiUsageHandlers };
