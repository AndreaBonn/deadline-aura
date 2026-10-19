const fs = require('fs');
const path = require('path');
const { createLocalTaskHandlers } = require('../../../core/ipc/local-task-handlers');
const { createCalendarHandlers } = require('../../../core/ipc/calendar-handlers');

const ROOT = path.resolve(__dirname, '../../..');
const INVOKE_PATTERN = /ipcRenderer\.(?:invoke|send)\(\s*'([^']+)'/g;

function preloadChannels() {
  const channels = new Set();
  const files = fs.readdirSync(ROOT).filter((f) => /^preload.*\.js$/.test(f));
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const match of source.matchAll(INVOKE_PATTERN)) {
      channels.add(match[1]);
    }
  }
  return channels;
}

function channelsWithPrefix(channels, prefixes) {
  return [...channels].filter((c) => prefixes.some((p) => c.startsWith(p))).sort();
}

describe('IPC channel contract with preload scripts', () => {
  it('the preload scripts expose a non-empty channel set (the scan itself works)', () => {
    expect(channelsWithPrefix(preloadChannels(), ['local-task:', 'calendar:']).length).toBe(9);
  });

  it('local-task handlers match the channels invoked by the preload scripts', () => {
    const registered = Object.keys(createLocalTaskHandlers({})).sort();
    expect(registered).toEqual(channelsWithPrefix(preloadChannels(), ['local-task:']));
  });

  it('calendar handlers match the channels invoked by the preload scripts', () => {
    const registered = Object.keys(createCalendarHandlers({})).sort();
    expect(registered).toEqual(channelsWithPrefix(preloadChannels(), ['calendar:']));
  });
});
