'use strict';

/**
 * Register groups of IPC handlers on ipcMain.
 *
 * Contract: `handle` and `on` are maps channel -> handler. A handler receives
 * only the renderer payload, never the IPC event (no current handler uses
 * event.sender or event.reply; one that needs it stays in main.js).
 *
 * Handler groups are built by factories taking injected dependencies. Mutable
 * app state is passed as accessors, never captured by value: `getConfig()` is
 * called on EVERY invocation because main.js reassigns its config after each
 * save, and `applyConfig(next)` saves, reloads and notifies the sidebar.
 *
 * @param {{handle: Function, on: Function}} ipcMain - Electron ipcMain (or a fake).
 * @param {{handle?: object, on?: object}} groups - Channel -> handler maps.
 */
function registerIpc(ipcMain, { handle = {}, on = {} }) {
  for (const [channel, handler] of Object.entries(handle)) {
    ipcMain.handle(channel, (_event, payload) => handler(payload));
  }
  for (const [channel, handler] of Object.entries(on)) {
    ipcMain.on(channel, (_event, payload) => handler(payload));
  }
}

function mergeSide(groups, side) {
  const merged = {};
  for (const group of groups) {
    for (const [channel, handler] of Object.entries(group[side] || {})) {
      if (channel in merged) {
        throw new Error(`Duplicate IPC channel: ${channel}`);
      }
      merged[channel] = handler;
    }
  }
  return merged;
}

/**
 * Combine handler groups into one `{handle, on}` for registerIpc. A channel
 * defined twice on the same side throws: ipcMain would silently keep only one.
 *
 * @param {...{handle?: object, on?: object}} groups - Factory outputs.
 * @returns {{handle: object, on: object}}
 */
function mergeIpcGroups(...groups) {
  return { handle: mergeSide(groups, 'handle'), on: mergeSide(groups, 'on') };
}

module.exports = { registerIpc, mergeIpcGroups };
