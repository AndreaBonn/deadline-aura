const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DEFAULTS } = require('../../../config/defaults');
const { configSchema } = require('../../../config/schema');
const { registerIpc } = require('../../../core/ipc/register-ipc');
const { createSettingsHandlers } = require('../../../core/ipc/settings-handlers');
const { createFlybyHandlers } = require('../../../core/ipc/flyby-handlers');
const masking = require('../../../config/secret-masking');
const { createSidebarWindow } = require('../../../main-process/sidebar-window');

// Real SidebarWindow wired to a fake BrowserWindow, so the send guard under test is the shipped one.
function createSidebar(state, calls) {
  class FakeWindow {
    webContents = {
      send: (channel, config) => calls.push([channel, config.language]),
      once: () => {},
    };
    isDestroyed = () => state === 'destroyed';
    setVisibleOnAllWorkspaces = () => {};
    loadFile = () => {};
    on = () => {};
  }
  const primary = { workArea: { x: 0, y: 0 }, workAreaSize: { width: 1000, height: 800 } };
  const sidebar = createSidebarWindow({
    BrowserWindow: FakeWindow,
    screen: { getPrimaryDisplay: () => primary },
    getConfig: () => ({ sidebar: { width: 260 } }),
  });
  if (state !== 'absent') {
    sidebar.create();
  }
  return sidebar;
}

function setup(sidebar = 'live') {
  const calls = [];
  const handlers = {};
  let persisted;
  const context = {
    registerIpc,
    createSettingsHandlers,
    createFlybyHandlers,
    createLocalTaskHandlers: () => ({}),
    createCalendarHandlers: () => ({}),
    ipcMain: { handle: (channel, handler) => (handlers[channel] = handler) },
    localQueries: {},
    runUpdateCycle: vi.fn(),
    gcal: {},
    jira: {},
    config: globalThis.structuredClone(DEFAULTS),
    DEFAULTS,
    configSchema,
    ...masking,
    lastSyncStatus: null,
    describeSourceStatus: vi.fn(),
    collectSourceFacts: vi.fn(),
    saveConfig: (next) => {
      calls.push('saveConfig');
      persisted = next;
    },
    loadConfig: () => {
      calls.push('loadConfig');
      return { ...persisted, language: 'en' };
    },
    scheduleDataSync: () => calls.push(['scheduleDataSync', context.config.language]),
    sidebar: createSidebar(sidebar, calls),
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../../main.js'), 'utf8');
  const start = source.indexOf('  registerIpc(ipcMain, {');
  const end = source.indexOf('\n  const syncDaemon', start);
  // Fail loudly if main.js moves the anchors this test slices on.
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  vm.runInNewContext(source.slice(start, end), context);
  return { calls, handlers, context };
}

describe('main config IPC registration', () => {
  it.each(['live', 'absent', 'destroyed'])(
    'settings persistence order with %s sidebar',
    (sidebar) => {
      const { handlers, calls, context } = setup(sidebar);
      expect(handlers['settings:save-config']({}, globalThis.structuredClone(DEFAULTS))).toEqual({
        ok: true,
      });
      const expected = ['saveConfig', 'loadConfig', ['scheduleDataSync', 'en']];
      if (sidebar === 'live') {
        expected.push(['config-changed', 'en']);
      }
      expect(calls).toEqual(expected);
      expect(handlers['settings:get-config']({}).language).toBe(context.config.language);
      expect(context.config.language).toBe('en');
    },
  );

  it.each(['live', 'absent', 'destroyed'])('flyby persistence order with %s sidebar', (sidebar) => {
    const { handlers, calls } = setup(sidebar);
    expect(handlers['flyby:set-state']({}, 'disable')).toEqual({
      ok: true,
      state: { enabled: false, snoozed_until: null },
    });
    const expected = ['saveConfig', 'loadConfig'];
    if (sidebar === 'live') {
      expected.push(['config-changed', 'en']);
    }
    expect(calls).toEqual(expected);
  });

  it.each(['settings:save-config', 'flyby:set-state'])(
    '%s rejects through IPC on persistence failure',
    async (channel) => {
      const { handlers, context, calls } = setup();
      context.saveConfig = () => {
        throw new Error('disk');
      };
      const payload =
        channel === 'flyby:set-state' ? 'disable' : globalThis.structuredClone(DEFAULTS);
      await expect(Promise.resolve().then(() => handlers[channel]({}, payload))).rejects.toThrow(
        'disk',
      );
      expect(calls).toEqual([]);
    },
  );
});
