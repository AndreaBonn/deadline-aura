'use strict';

const fs = require('fs');
const path = require('path');
const { createAppIpcGroups } = require('../../main-process/app-ipc');

const ROOT = path.resolve(__dirname, '../..');
const PRELOAD_CHANNEL = /ipcRenderer\.(invoke|send)\(\s*'([^']+)'/g;
// Registered directly on ipcMain by the window modules that own them (meeting dock,
// overlay, and core/meeting-flyby.js, whose listeners need the IPC event).
const WINDOW_OWNED =
  /^(meeting-dock:|overlay-|open-overlay$|pin-task$|unpin-task$|save-positions$|flyby:done$|flyby:set-ignore$)/;

function preloadChannels() {
  const channels = { invoke: new Set(), send: new Set() };
  for (const file of fs.readdirSync(ROOT).filter((f) => /^preload.*\.js$/.test(f))) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const [, kind, channel] of source.matchAll(PRELOAD_CHANNEL)) {
      if (!WINDOW_OWNED.test(channel)) {
        channels[kind].add(channel);
      }
    }
  }
  return channels;
}

function fakeDeps() {
  const noop = () => {};
  return new Proxy({}, { get: (_target, key) => (key === 'getConfig' ? () => ({}) : noop) });
}

describe('createAppIpcGroups', () => {
  it('registers every invoked preload channel as a handle', () => {
    const groups = createAppIpcGroups(fakeDeps());
    expect(Object.keys(groups.handle).sort()).toEqual([...preloadChannels().invoke].sort());
  });

  it('registers every sent preload channel as an on listener', () => {
    const groups = createAppIpcGroups(fakeDeps());
    expect(Object.keys(groups.on).sort()).toEqual([...preloadChannels().send].sort());
  });

  it('wires real handler functions, not placeholders', () => {
    const groups = createAppIpcGroups(fakeDeps());
    const handlers = [...Object.values(groups.handle), ...Object.values(groups.on)];
    expect(handlers.length).toBeGreaterThan(20);
    expect(handlers.every((handler) => typeof handler === 'function')).toBe(true);
  });
});
