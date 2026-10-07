'use strict';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
}));

const { EventEmitter } = require('events');
const Module = require('module');
const i18n = require('../../i18n');
const flybyPath = require.resolve('../../core/meeting-flyby');
const originalFlybyModule = require.cache[flybyPath];
const NOW = Date.parse('2026-10-07T09:00:00Z');
const STAGGER_MS = 2500;
const LIFETIME_MS = 17000;
const CONFIG = { meeting_flyby: { enabled: true, trigger_seconds: 60, duration_seconds: 6 } };
const DISPLAY = { bounds: { x: -1440, y: 37, width: 1440, height: 902 } };
const MEETING = { id: 'standup', title: 'Standup', start_at: NOW + 60000 };
let electron;
let flyby;
let windows;
let db;
let screen;

function createWindow() {
  const nativeEvents = new EventEmitter();
  const rendererEvents = new EventEmitter();
  let destroyed = false;
  const win = {
    setIgnoreMouseEvents: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    loadFile: vi.fn(),
    showInactive: vi.fn(),
    on: vi.fn(nativeEvents.on.bind(nativeEvents)),
    emit: nativeEvents.emit.bind(nativeEvents),
    isDestroyed: vi.fn(() => destroyed),
    close: vi.fn(() => {
      destroyed = true;
    }),
    webContents: {
      once: vi.fn(rendererEvents.once.bind(rendererEvents)),
      emit: rendererEvents.emit.bind(rendererEvents),
      send: vi.fn(),
    },
  };
  windows.push(win);
  return win;
}

beforeAll(async () => {
  electron = await import('electron');
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  // Vitest's ESM mock does not intercept the lazy CommonJS require in production.
  const originalLoad = Module._load;
  vi.spyOn(Module, '_load').mockImplementation(function (request, ...args) {
    return request === 'electron' ? electron : originalLoad.call(this, request, ...args);
  });
  delete require.cache[flybyPath];
  flyby = require('../../core/meeting-flyby');
  windows = [];
  electron.BrowserWindow.mockImplementation(createWindow);
  electron.BrowserWindow.fromWebContents = vi.fn((sender) =>
    windows.find((win) => win.webContents === sender),
  );
  db = { getUpcomingCalendarEvents: vi.fn(() => [MEETING]) };
  screen = { getAllDisplays: vi.fn(() => [DISPLAY]) };
  i18n.setLanguage('en');
});

afterEach(() => {
  flyby.destroyAll();
  flyby._testing.cooldownMap.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  i18n.setLanguage('it');
});

afterAll(() => {
  if (originalFlybyModule) {
    require.cache[flybyPath] = originalFlybyModule;
  } else {
    delete require.cache[flybyPath];
  }
});

describe('meeting flyby orchestration', () => {
  it('registers each IPC handler only once when initialized twice', () => {
    flyby.init();
    flyby.init();

    expect(electron.ipcMain.on.mock.calls).toEqual([
      ['flyby:done', expect.any(Function)],
      ['flyby:set-ignore', expect.any(Function)],
    ]);
  });

  it('positions the window using the display bounds and rounded cat band', () => {
    flyby.checkAndLaunch({ config: CONFIG, db, screen });

    expect(electron.BrowserWindow.mock.calls).toEqual([
      [expect.objectContaining({ width: 1440, height: 200, x: -1440, y: 326 })],
    ]);
  });

  it('sends the banner before showing and starts the safety lifetime only after loading', () => {
    flyby.checkAndLaunch({ config: CONFIG, db, screen });
    const [win] = windows;
    const timeline = [];
    win.webContents.send.mockImplementation((...args) => timeline.push(args));
    win.showInactive.mockImplementation(() => timeline.push(['show', vi.getTimerCount()]));
    vi.advanceTimersByTime(LIFETIME_MS);
    timeline.push(['before-load', win.close.mock.calls.length, vi.getTimerCount()]);

    win.webContents.emit('did-finish-load');
    timeline.push(['loaded', vi.getTimerCount()]);
    vi.advanceTimersByTime(LIFETIME_MS - 1);
    timeline.push(['before-expiry', win.close.mock.calls.length]);
    vi.advanceTimersByTime(1);
    timeline.push(['expired', win.close.mock.calls.length, vi.getTimerCount()]);

    expect(timeline).toEqual([
      ['before-load', 0, 0],
      ['flyby-init', { text: 'Standup in 1 minute', holdSeconds: 6 }],
      ['show', 0],
      ['loaded', 1],
      ['before-expiry', 0],
      ['expired', 1, 0],
    ]);
  });

  it.each([
    ['absent', {}],
    ['disabled', { meeting_flyby: { enabled: false } }],
    ['snoozed', { meeting_flyby: { enabled: true, snoozed_until: NOW + 60000 } }],
  ])('queries events only after the %s flyby configuration is enabled', (_label, config) => {
    flyby.checkAndLaunch({ config, db, screen });
    const suppressedCalls = [...db.getUpcomingCalendarEvents.mock.calls];

    flyby.checkAndLaunch({ config: CONFIG, db, screen });

    expect({ suppressedCalls, enabledCalls: db.getUpcomingCalendarEvents.mock.calls }).toEqual({
      suppressedCalls: [],
      enabledCalls: [[80000]],
    });
  });

  it('launches a meeting once while repeated checks are within its cooldown', () => {
    flyby.checkAndLaunch({ config: CONFIG, db, screen });
    const initialCount = windows.length;
    vi.advanceTimersByTime(1000);

    flyby.checkAndLaunch({ config: CONFIG, db, screen });

    expect([initialCount, windows.length, db.getUpcomingCalendarEvents.mock.calls.length]).toEqual([
      1, 1, 2,
    ]);
  });

  it('staggers the second meeting on every display by 2500 milliseconds', () => {
    db.getUpcomingCalendarEvents.mockReturnValue([
      MEETING,
      { ...MEETING, id: 'review', title: 'Review' },
    ]);
    screen.getAllDisplays.mockReturnValue([DISPLAY, { bounds: { ...DISPLAY.bounds, x: 0 } }]);

    flyby.checkAndLaunch({ config: CONFIG, db, screen });
    const counts = [windows.length];
    vi.advanceTimersByTime(STAGGER_MS - 1);
    counts.push(windows.length);
    vi.advanceTimersByTime(1);
    counts.push(windows.length);
    windows.forEach((win) => win.webContents.emit('did-finish-load'));

    expect({
      counts,
      texts: windows.map((win) => win.webContents.send.mock.calls[0][1].text),
    }).toEqual({
      counts: [2, 2, 4],
      texts: [
        'Standup in 1 minute',
        'Standup in 1 minute',
        'Review in 58 seconds',
        'Review in 58 seconds',
      ],
    });
  });

  it('closes a completed flyby once, cancels its timer and removes it from active windows', () => {
    flyby.init();
    flyby.checkAndLaunch({ config: CONFIG, db, screen });
    const [win] = windows;
    win.webContents.emit('did-finish-load');
    const timerCounts = [vi.getTimerCount()];
    const done = electron.ipcMain.on.mock.calls.find(([channel]) => channel === 'flyby:done')[1];

    done({ sender: win.webContents });
    timerCounts.push(vi.getTimerCount());
    done({ sender: win.webContents });
    win.isDestroyed.mockClear();
    flyby.destroyAll();
    vi.advanceTimersByTime(LIFETIME_MS);

    expect({
      timerCounts,
      closes: win.close.mock.calls.length,
      activeChecks: win.isDestroyed.mock.calls.length,
    }).toEqual({
      timerCounts: [1, 0],
      closes: 1,
      activeChecks: 0,
    });
  });

  it('cancels the safety timer and forgets a window closed by the native window system', () => {
    flyby.checkAndLaunch({ config: CONFIG, db, screen });
    const [win] = windows;
    win.webContents.emit('did-finish-load');
    const timerCounts = [vi.getTimerCount()];

    win.close();
    win.emit('closed');
    timerCounts.push(vi.getTimerCount());
    flyby.destroyAll();
    vi.advanceTimersByTime(LIFETIME_MS);

    expect({
      timerCounts,
      closes: win.close.mock.calls.length,
      activeChecks: win.isDestroyed.mock.calls.length,
    }).toEqual({
      timerCounts: [1, 0],
      closes: 1,
      activeChecks: 0,
    });
  });

  it('closes all active flybys and cancels every safety timer on destroy', () => {
    screen.getAllDisplays.mockReturnValue([DISPLAY, { bounds: { ...DISPLAY.bounds, x: 0 } }]);
    flyby.checkAndLaunch({ config: CONFIG, db, screen });
    windows.forEach((win) => win.webContents.emit('did-finish-load'));
    const timerCounts = [vi.getTimerCount()];

    flyby.destroyAll();
    timerCounts.push(vi.getTimerCount());
    windows.forEach((win) => win.isDestroyed.mockClear());
    flyby.destroyAll();
    vi.advanceTimersByTime(LIFETIME_MS);

    expect({
      timerCounts,
      closes: windows.map((win) => win.close.mock.calls.length),
      activeChecks: windows.map((win) => win.isDestroyed.mock.calls.length),
    }).toEqual({
      timerCounts: [2, 0],
      closes: [1, 1],
      activeChecks: [0, 0],
    });
  });
});
