const { DEFAULTS } = require('../../../config/defaults');
const { configSchema } = require('../../../config/schema');
const masking = require('../../../config/secret-masking');
const { registerIpc } = require('../../../core/ipc/register-ipc');
const { createConfigApplier } = require('../../../core/ipc/config-applier');
const { createSettingsHandlers } = require('../../../core/ipc/settings-handlers');
const { createFlybyHandlers } = require('../../../core/ipc/flyby-handlers');
const { createSidebarWindow } = require('../../../main-process/sidebar-window');
const { createFakeElectron } = require('../../main-process/fakes');

function setupApplier() {
  const calls = [];
  const applier = createConfigApplier({
    saveConfig: (data) => calls.push(['save', data]),
    loadConfig: () => {
      calls.push(['load']);
      return { loaded: true };
    },
    setConfig: (config) => calls.push(['set', config]),
    scheduleDataSync: () => calls.push(['schedule']),
    notifySidebar: (config) => calls.push(['notify', config]),
  });
  return { applier, calls };
}

describe('createConfigApplier', () => {
  it('applySettings saves, reloads, publishes, reschedules the sync, then notifies', () => {
    const { applier, calls } = setupApplier();
    applier.applySettings({ raw: 1 });
    expect(calls).toEqual([
      ['save', { raw: 1 }],
      ['load'],
      ['set', { loaded: true }],
      ['schedule'],
      ['notify', { loaded: true }],
    ]);
  });

  it('applyFlyby saves, reloads, publishes and notifies, without touching the sync schedule', () => {
    const { applier, calls } = setupApplier();
    applier.applyFlyby({ raw: 2 });
    expect(calls).toEqual([
      ['save', { raw: 2 }],
      ['load'],
      ['set', { loaded: true }],
      ['notify', { loaded: true }],
    ]);
  });

  it.each(['applySettings', 'applyFlyby'])('%s stops at a failing save', (method) => {
    const calls = [];
    const applier = createConfigApplier({
      saveConfig: () => {
        throw new Error('disk');
      },
      loadConfig: () => calls.push('load'),
      setConfig: () => calls.push('set'),
      scheduleDataSync: () => calls.push('schedule'),
      notifySidebar: () => calls.push('notify'),
    });
    expect(() => applier[method]({})).toThrow('disk');
    expect(calls).toEqual([]);
  });
});

// The whole path a renderer request takes: ipcMain -> handler -> applier -> sidebar.
function setupWiring(sidebarState = 'live') {
  const electron = createFakeElectron();
  const sidebar = createSidebarWindow({
    BrowserWindow: electron.BrowserWindow,
    screen: electron.screen,
    getConfig: () => ({ sidebar: { width: 260 } }),
  });
  if (sidebarState !== 'absent') {
    sidebar.create();
  }
  if (sidebarState === 'destroyed') {
    electron.windows[0].destroyed = true;
  }
  const calls = [];
  const state = { config: globalThis.structuredClone(DEFAULTS), persisted: null, failSave: false };
  const applier = createConfigApplier({
    saveConfig: (next) => {
      if (state.failSave) {
        throw new Error('disk');
      }
      calls.push('saveConfig');
      state.persisted = next;
    },
    loadConfig: () => {
      calls.push('loadConfig');
      return { ...state.persisted, language: 'en' };
    },
    setConfig: (config) => {
      state.config = config;
    },
    scheduleDataSync: () => calls.push(['scheduleDataSync', state.config.language]),
    notifySidebar: (config) => sidebar.send('config-changed', config),
  });
  const handlers = {};
  registerIpc(
    { handle: (channel, handler) => (handlers[channel] = handler), on: () => {} },
    {
      handle: {
        ...createSettingsHandlers({
          getConfig: () => state.config,
          defaults: DEFAULTS,
          configSchema,
          ...masking,
          describeSourceStatus: vi.fn(),
          collectSourceFacts: vi.fn(),
          gcal: {},
          jira: {},
          getLastSyncStatus: () => null,
          applyConfig: applier.applySettings,
        }),
        ...createFlybyHandlers({ getConfig: () => state.config, applyConfig: applier.applyFlyby }),
      },
    },
  );
  const sidebarSends = () => (electron.windows[0] ? electron.windows[0].sent : []);
  return { handlers, calls, state, sidebarSends };
}

describe('config IPC wiring against the real sidebar send guard', () => {
  it.each(['live', 'absent', 'destroyed'])(
    'settings save with %s sidebar',
    async (sidebarState) => {
      const { handlers, calls, state, sidebarSends } = setupWiring(sidebarState);
      const reply = await handlers['settings:save-config'](
        {},
        globalThis.structuredClone(DEFAULTS),
      );
      expect(reply).toEqual({ ok: true });
      expect(calls).toEqual(['saveConfig', 'loadConfig', ['scheduleDataSync', 'en']]);
      const expectedSends = sidebarState === 'live' ? 1 : 0;
      expect(sidebarSends()).toHaveLength(expectedSends);
      if (expectedSends) {
        expect(sidebarSends()[0][0]).toBe('config-changed');
        expect(sidebarSends()[0][1].language).toBe('en');
      }
      expect(state.config.language).toBe('en');
    },
  );

  it.each(['live', 'absent', 'destroyed'])(
    'flyby disable with %s sidebar',
    async (sidebarState) => {
      const { handlers, calls, sidebarSends } = setupWiring(sidebarState);
      const reply = await handlers['flyby:set-state']({}, 'disable');
      expect(reply).toEqual({ ok: true, state: { enabled: false, snoozed_until: null } });
      expect(calls).toEqual(['saveConfig', 'loadConfig']);
      expect(sidebarSends()).toHaveLength(sidebarState === 'live' ? 1 : 0);
    },
  );

  it.each([
    ['settings:save-config', () => globalThis.structuredClone(DEFAULTS)],
    ['flyby:set-state', () => 'disable'],
  ])('%s rejects through IPC when persistence fails', async (channel, makePayload) => {
    const { handlers, state, calls, sidebarSends } = setupWiring();
    state.failSave = true;
    await expect(
      Promise.resolve().then(() => handlers[channel]({}, makePayload())),
    ).rejects.toThrow('disk');
    expect(calls).toEqual([]);
    expect(sidebarSends()).toEqual([]);
  });
});
