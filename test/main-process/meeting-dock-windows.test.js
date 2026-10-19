const childProcess = require('child_process');

// The spy must exist before the module is required: meeting-dock-windows destructures execFile.
const execSpy = vi.spyOn(childProcess, 'execFile');
const { createMeetingDockWindows } = require('../../main-process/meeting-dock-windows');
const { createFakeElectron } = require('./fakes');

const originalPlatform = process.platform;
const originalDisplay = process.env.DISPLAY;
const NOW = Date.parse('2026-10-19T10:00:00Z');
const MINUTE = 60_000;
let xprop;

function setPlatform(platform, display) {
  Object.defineProperty(process, 'platform', { value: platform });
  if (display === undefined) {
    delete process.env.DISPLAY;
  } else {
    process.env.DISPLAY = display;
  }
}

/** Fake DB: returns meetings starting between `past` minutes ago and `lookahead` minutes ahead. */
function makeDb(meetings) {
  return {
    getUpcomingMeetings: vi.fn((lookaheadMin, pastMin) =>
      meetings.filter((m) => {
        const offset = (m.start - NOW) / MINUTE;
        return offset >= pastMin && offset <= lookaheadMin;
      }),
    ),
  };
}

function minutesFromNow(id, minutes) {
  return { id, title: `Meeting ${id}`, start: NOW + minutes * MINUTE };
}

function setup({ config = { meeting_dock: { enabled: true } }, meetings = [] } = {}) {
  const electron = createFakeElectron();
  const state = { config };
  const openExternalUrl = vi.fn();
  const externalBrowserDependencies = { marker: 'browser-deps' };
  const db = makeDb(meetings);
  const docks = createMeetingDockWindows({
    BrowserWindow: electron.BrowserWindow,
    screen: electron.screen,
    getConfig: () => state.config,
    db,
    openExternalUrl,
    externalBrowserDependencies,
  });
  const handlers = {};
  docks.registerIpc({ on: (channel, handler) => (handlers[channel] = handler) });
  return { electron, docks, state, db, openExternalUrl, externalBrowserDependencies, handlers };
}

beforeEach(() => {
  xprop = [];
  execSpy.mockReset();
  execSpy.mockImplementation((command, args, callback) => {
    xprop.push([command, ...args]);
    callback(null);
  });
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  if (originalDisplay === undefined) {
    delete process.env.DISPLAY;
  } else {
    process.env.DISPLAY = originalDisplay;
  }
});

describe('MeetingDockWindows createMeetingDocks', () => {
  it('creates one dock per display when enabled, each loading the dock page', () => {
    setPlatform('darwin');
    const { docks, electron } = setup();
    docks.createMeetingDocks();
    expect(electron.windows).toHaveLength(2);
    for (const window of electron.windows) {
      expect(window.loadedFile).toMatch(/renderer[\\/]meeting-dock\.html$/);
      expect(window.workspaceCalls).toEqual([[true, { visibleOnFullScreen: false }]]);
    }
  });

  it('creates nothing when the dock is disabled or not configured', () => {
    setPlatform('darwin');
    const disabled = setup({ config: { meeting_dock: { enabled: false } } });
    disabled.docks.createMeetingDocks();
    expect(disabled.electron.windows).toHaveLength(0);
    const missing = setup({ config: {} });
    missing.docks.createMeetingDocks();
    expect(missing.electron.windows).toHaveLength(0);
  });

  it('reads the config on every call', () => {
    setPlatform('darwin');
    const { docks, electron, state } = setup({ config: { meeting_dock: { enabled: false } } });
    docks.createMeetingDocks();
    expect(electron.windows).toHaveLength(0);
    state.config = { meeting_dock: { enabled: true } };
    docks.createMeetingDocks();
    expect(electron.windows).toHaveLength(2);
    state.config = { meeting_dock: { enabled: false } };
    docks.createMeetingDocks();
    expect(electron.windows).toHaveLength(2);
    expect(electron.windows.every((w) => w.destroyed)).toBe(true);
  });

  it('replaces existing docks on a second call', () => {
    setPlatform('darwin');
    const { docks, electron } = setup();
    docks.createMeetingDocks();
    docks.createMeetingDocks();
    expect(electron.windows.map((w) => w.destroyed)).toEqual([true, true, false, false]);
  });

  it('makes docks click-through with mouse forwarding off Linux', () => {
    setPlatform('darwin');
    const { docks, electron } = setup();
    docks.createMeetingDocks();
    for (const window of electron.windows) {
      expect(window.ignoreMouseCalls).toEqual([[true, { forward: true }]]);
    }
  });

  it('keeps docks fully interactive on Linux', () => {
    setPlatform('linux');
    const { docks, electron } = setup();
    docks.createMeetingDocks();
    for (const window of electron.windows) {
      expect(window.ignoreMouseCalls).toEqual([]);
    }
  });
});

describe('MeetingDockWindows sticky desktop on X11', () => {
  it('sets the all-desktops property once a dock has loaded', () => {
    setPlatform('linux', ':0');
    const { docks, electron } = setup();
    docks.createMeetingDocks();
    expect(xprop).toEqual([]);
    electron.windows[1].finishLoad();
    expect(xprop).toEqual([
      [
        'xprop',
        '-id',
        String(electron.windows[1].xid),
        '-f',
        '_NET_WM_DESKTOP',
        '32c',
        '-set',
        '_NET_WM_DESKTOP',
        '0xffffffff',
      ],
    ]);
  });

  it('does not call xprop without DISPLAY or off Linux', () => {
    setPlatform('linux');
    const noDisplay = setup();
    noDisplay.docks.createMeetingDocks();
    noDisplay.electron.windows.forEach((w) => w.finishLoad());
    setPlatform('darwin', ':0');
    const mac = setup();
    mac.docks.createMeetingDocks();
    mac.electron.windows.forEach((w) => w.finishLoad());
    expect(xprop).toEqual([]);
  });

  it('survives a missing native handle', () => {
    setPlatform('linux', ':0');
    const { docks, electron } = setup();
    docks.createMeetingDocks();
    electron.windows[0].nativeHandleFails = true;
    expect(() => electron.windows[0].finishLoad()).not.toThrow();
    expect(xprop).toEqual([]);
  });
});

describe('MeetingDockWindows updateMeetingDocks', () => {
  const meetings = [
    minutesFromNow('past-old', -7),
    minutesFromNow('past-recent', -3),
    minutesFromNow('soon', 8),
    minutesFromNow('later', 20),
  ];

  beforeEach(() => {
    setPlatform('darwin');
  });

  it('sends the default 10-minute window (with 5 minutes of tolerance) to every dock', () => {
    const { docks, electron, db } = setup({ meetings });
    docks.createMeetingDocks();
    docks.updateMeetingDocks();
    const expected = [meetings[1], meetings[2]];
    for (const window of electron.windows) {
      expect(window.sent).toEqual([['meetings-update', expected]]);
    }
    expect(db.getUpcomingMeetings).toHaveBeenCalledWith(10, -5);
  });

  it('honors a configured lookahead', () => {
    const config = { meeting_dock: { enabled: true, lookahead_minutes: 30 } };
    const { docks, electron } = setup({ config, meetings });
    docks.createMeetingDocks();
    docks.updateMeetingDocks();
    expect(electron.windows[0].sent[0][1].map((m) => m.id)).toEqual([
      'past-recent',
      'soon',
      'later',
    ]);
  });

  it('falls back to the default lookahead when it is 0', () => {
    const config = { meeting_dock: { enabled: true, lookahead_minutes: 0 } };
    const { docks, db } = setup({ config, meetings });
    docks.createMeetingDocks();
    docks.updateMeetingDocks();
    expect(db.getUpcomingMeetings).toHaveBeenCalledWith(10, -5);
  });

  it('does nothing when the dock is disabled, without querying the DB', () => {
    const { docks, electron, db, state } = setup({ meetings });
    docks.createMeetingDocks();
    state.config = { meeting_dock: { enabled: false } };
    docks.updateMeetingDocks();
    expect(electron.windows[0].sent).toEqual([]);
    expect(db.getUpcomingMeetings).not.toHaveBeenCalled();
  });

  it('skips destroyed docks and docks without webContents', () => {
    const { docks, electron } = setup({ meetings });
    docks.createMeetingDocks();
    electron.windows[0].destroyed = true;
    electron.windows[1].webContents = null;
    expect(() => docks.updateMeetingDocks()).not.toThrow();
    expect(electron.windows[0].sent).toEqual([]);
  });
});

describe('MeetingDockWindows destroyMeetingDocks', () => {
  it('closes every dock and stops updating them', () => {
    setPlatform('darwin');
    const { docks, electron } = setup({ meetings: [minutesFromNow('m', 1)] });
    docks.createMeetingDocks();
    docks.destroyMeetingDocks();
    expect(electron.windows.map((w) => w.closeCount)).toEqual([1, 1]);
    docks.updateMeetingDocks();
    expect(electron.windows[0].sent).toEqual([]);
  });

  it('does not close an already destroyed dock again', () => {
    setPlatform('darwin');
    const { docks, electron } = setup();
    docks.createMeetingDocks();
    electron.windows[0].destroyed = true;
    docks.destroyMeetingDocks();
    expect(electron.windows.map((w) => w.closeCount)).toEqual([0, 1]);
  });
});

describe('meeting-dock:open-link', () => {
  it('opens a safe URL unchanged when no Google account is configured', () => {
    const { handlers, openExternalUrl, externalBrowserDependencies } = setup();
    handlers['meeting-dock:open-link']({}, 'https://zoom.us/j/123');
    expect(openExternalUrl).toHaveBeenCalledTimes(1);
    expect(openExternalUrl).toHaveBeenCalledWith(
      'https://zoom.us/j/123',
      externalBrowserDependencies,
    );
  });

  it('adds authuser to a Meet URL using the configured Google account', () => {
    const config = { sources: { google_calendar: { google_account: 'me@example.com' } } };
    const { handlers, openExternalUrl } = setup({ config });
    handlers['meeting-dock:open-link']({}, 'https://meet.google.com/abc-defg-hij');
    expect(openExternalUrl.mock.calls[0][0]).toBe(
      'https://meet.google.com/abc-defg-hij?authuser=me%40example.com',
    );
  });

  it('leaves non-Meet URLs untouched even with a Google account', () => {
    const config = { sources: { google_calendar: { google_account: 'me@example.com' } } };
    const { handlers, openExternalUrl } = setup({ config });
    handlers['meeting-dock:open-link']({}, 'https://zoom.us/j/123');
    expect(openExternalUrl.mock.calls[0][0]).toBe('https://zoom.us/j/123');
  });

  it('reads the Google account from the config at each click', () => {
    const { handlers, openExternalUrl, state } = setup({ config: {} });
    handlers['meeting-dock:open-link']({}, 'https://meet.google.com/abc');
    state.config = { sources: { google_calendar: { google_account: 'work@example.com' } } };
    handlers['meeting-dock:open-link']({}, 'https://meet.google.com/abc');
    expect(openExternalUrl.mock.calls.map((c) => c[0])).toEqual([
      'https://meet.google.com/abc',
      'https://meet.google.com/abc?authuser=work%40example.com',
    ]);
  });

  it.each([
    ['loopback', 'http://127.0.0.1:8080/admin'],
    ['private network', 'http://192.168.1.10/'],
    ['file scheme', 'file:///etc/passwd'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['embedded credentials', 'https://user:pw@meet.google.com/abc'],
    ['not a URL', 'not a url'],
  ])('refuses an unsafe URL (%s)', (_label, url) => {
    const { handlers, openExternalUrl } = setup();
    handlers['meeting-dock:open-link']({}, url);
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it.each([[undefined], [null], [42], [{ href: 'https://zoom.us/j/1' }]])(
    'refuses a non-string payload (%j)',
    (payload) => {
      const { handlers, openExternalUrl } = setup();
      handlers['meeting-dock:open-link']({}, payload);
      expect(openExternalUrl).not.toHaveBeenCalled();
    },
  );
});

describe('meeting-dock:set-ignore-mouse', () => {
  function senderOf(window) {
    return { sender: window.webContents };
  }

  it('makes the dock click-through with forwarding when ignoring', () => {
    setPlatform('darwin');
    const { handlers, docks, electron } = setup();
    docks.createMeetingDocks();
    const dock = electron.windows[1];
    dock.ignoreMouseCalls.length = 0;
    handlers['meeting-dock:set-ignore-mouse'](senderOf(dock), true);
    expect(dock.ignoreMouseCalls).toEqual([[true, { forward: true }]]);
    expect(electron.windows[0].ignoreMouseCalls).toEqual([[true, { forward: true }]]);
  });

  it('makes the dock interactive again when not ignoring', () => {
    setPlatform('darwin');
    const { handlers, docks, electron } = setup();
    docks.createMeetingDocks();
    const dock = electron.windows[0];
    dock.ignoreMouseCalls.length = 0;
    handlers['meeting-dock:set-ignore-mouse'](senderOf(dock), false);
    expect(dock.ignoreMouseCalls).toEqual([[false]]);
  });

  it('returns immediately on Linux', () => {
    setPlatform('linux');
    const { handlers, docks, electron } = setup();
    docks.createMeetingDocks();
    const dock = electron.windows[0];
    handlers['meeting-dock:set-ignore-mouse'](senderOf(dock), true);
    handlers['meeting-dock:set-ignore-mouse'](senderOf(dock), false);
    expect(dock.ignoreMouseCalls).toEqual([]);
  });

  it('ignores a destroyed dock and an unknown sender', () => {
    setPlatform('darwin');
    const { handlers, docks, electron } = setup();
    docks.createMeetingDocks();
    const dock = electron.windows[0];
    dock.ignoreMouseCalls.length = 0;
    dock.destroyed = true;
    handlers['meeting-dock:set-ignore-mouse'](senderOf(dock), true);
    expect(dock.ignoreMouseCalls).toEqual([]);
    expect(() => handlers['meeting-dock:set-ignore-mouse']({ sender: {} }, true)).not.toThrow();
  });
});

describe('meeting-dock:set-visible', () => {
  it('shows hidden docks without stealing focus', () => {
    setPlatform('darwin');
    const { handlers, docks, electron } = setup();
    docks.createMeetingDocks();
    handlers['meeting-dock:set-visible']({}, true);
    expect(electron.windows.map((w) => w.visible)).toEqual([true, true]);
    expect(electron.windows.map((w) => w.showInactiveCount)).toEqual([1, 1]);
  });

  it('does not re-show docks that are already visible', () => {
    setPlatform('darwin');
    const { handlers, docks, electron } = setup();
    docks.createMeetingDocks();
    electron.windows[0].visible = true;
    handlers['meeting-dock:set-visible']({}, true);
    expect(electron.windows.map((w) => w.showInactiveCount)).toEqual([0, 1]);
  });

  it('hides visible docks and leaves hidden ones alone', () => {
    setPlatform('darwin');
    const { handlers, docks, electron } = setup();
    docks.createMeetingDocks();
    electron.windows[0].visible = true;
    handlers['meeting-dock:set-visible']({}, false);
    expect(electron.windows.map((w) => w.visible)).toEqual([false, false]);
    expect(electron.windows.map((w) => w.hideCount)).toEqual([1, 0]);
  });

  it('skips destroyed docks', () => {
    setPlatform('darwin');
    const { handlers, docks, electron } = setup();
    docks.createMeetingDocks();
    electron.windows[0].destroyed = true;
    handlers['meeting-dock:set-visible']({}, true);
    expect(electron.windows.map((w) => w.showInactiveCount)).toEqual([0, 1]);
  });
});

describe('registerIpc', () => {
  it('registers exactly the three dock channels', () => {
    const { handlers } = setup();
    expect(Object.keys(handlers).sort()).toEqual([
      'meeting-dock:open-link',
      'meeting-dock:set-ignore-mouse',
      'meeting-dock:set-visible',
    ]);
  });
});
