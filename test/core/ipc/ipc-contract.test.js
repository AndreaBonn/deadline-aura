const fs = require('fs');
const path = require('path');
const { createLocalTaskHandlers } = require('../../../core/ipc/local-task-handlers');
const { createCalendarHandlers } = require('../../../core/ipc/calendar-handlers');
const { createSettingsHandlers } = require('../../../core/ipc/settings-handlers');
const { createFlybyHandlers } = require('../../../core/ipc/flyby-handlers');
const { createAppStateHandlers } = require('../../../core/ipc/app-state-handlers');
const { createIntegrationHandlers } = require('../../../core/ipc/integration-handlers');
const { createAiUsageHandlers } = require('../../../core/ipc/ai-usage-handlers');
const { createTaskFavoriteHandlers } = require('../../../core/ipc/task-favorite-handlers');
const { createWindowHandlers } = require('../../../main-process/window-handlers');

const ROOT = path.resolve(__dirname, '../../..');
const INVOKE_PATTERN = /ipcRenderer\.(?:invoke|send)\(\s*'([^']+)'/g;

function preloadChannels(pattern = INVOKE_PATTERN) {
  const channels = new Set();
  const files = fs.readdirSync(ROOT).filter((f) => /^preload.*\.js$/.test(f));
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const match of source.matchAll(pattern)) {
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

  it('settings and Jira handlers match invoked channels, excluding settings window events', () => {
    const invoked = preloadChannels(/ipcRenderer\.invoke\(\s*'([^']+)'/g);
    expect(Object.keys(createSettingsHandlers({})).sort()).toEqual(
      channelsWithPrefix(invoked, ['settings:', 'jira:']),
    );
    expect(channelsWithPrefix(invoked, ['settings:', 'jira:'])).toHaveLength(5);
  });

  it('flyby handlers match invoked channels, excluding event-based window controls', () => {
    const invoked = preloadChannels(/ipcRenderer\.invoke\(\s*'([^']+)'/g);
    expect(Object.keys(createFlybyHandlers({})).sort()).toEqual(
      channelsWithPrefix(invoked, ['flyby:']),
    );
    expect(channelsWithPrefix(invoked, ['flyby:'])).toHaveLength(2);
  });

  it('app-level groups register request/response channels with handle and events with on', () => {
    const invoked = preloadChannels(/ipcRenderer\.invoke\(\s*'([^']+)'/g);
    const sent = preloadChannels(/ipcRenderer\.send\(\s*'([^']+)'/g);
    const groups = [
      createAppStateHandlers({}),
      createIntegrationHandlers({}),
      { handle: createAiUsageHandlers({}) },
      createTaskFavoriteHandlers({}),
      createWindowHandlers({}),
    ];
    const handle = groups.flatMap((g) => Object.keys(g.handle || {}));
    const on = groups.flatMap((g) => Object.keys(g.on || {}));
    expect(handle).toHaveLength(7);
    expect(on).toHaveLength(8);
    handle.forEach((channel) => expect(invoked.has(channel)).toBe(true));
    on.forEach((channel) => expect(sent.has(channel)).toBe(true));
  });
});
