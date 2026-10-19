const childProcess = require('child_process');

// The spy must exist before the module is required: strip-windows destructures execFile.
const execSpy = vi.spyOn(childProcess, 'execFile');
const { createStripWindows } = require('../../main-process/strip-windows');
const { createFakeElectron } = require('./fakes');

const originalPlatform = process.platform;
const originalDisplay = process.env.DISPLAY;
let xprop;

function setPlatform(platform, display) {
  Object.defineProperty(process, 'platform', { value: platform });
  if (display === undefined) {
    delete process.env.DISPLAY;
  } else {
    process.env.DISPLAY = display;
  }
}

function setup() {
  const electron = createFakeElectron();
  const strips = createStripWindows({
    BrowserWindow: electron.BrowserWindow,
    screen: electron.screen,
  });
  return { electron, strips };
}

/** Runs the oldest pending xprop callback, as the OS would when the command exits. */
function finishNextXprop() {
  xprop.pending.shift()(null);
}

beforeEach(() => {
  xprop = { calls: [], pending: [] };
  execSpy.mockReset();
  execSpy.mockImplementation((command, args, callback) => {
    xprop.calls.push([command, ...args]);
    xprop.pending.push(callback);
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  if (originalDisplay === undefined) {
    delete process.env.DISPLAY;
  } else {
    process.env.DISPLAY = originalDisplay;
  }
});

describe('StripWindows createStrips', () => {
  it('creates one strip per display, each loading the strip page', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    strips.createStrips();
    expect(electron.windows).toHaveLength(2);
    for (const window of electron.windows) {
      expect(window.loadedFile).toMatch(/renderer[\\/]strip\.html$/);
    }
  });

  it('creates a single strip on a single-display setup', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    electron.state.displays = [electron.primary];
    strips.createStrips();
    expect(electron.windows).toHaveLength(1);
    expect(electron.windows[0].workspaceCalls).toEqual([[true, { visibleOnFullScreen: false }]]);
  });

  it('makes only the rightmost strip visible on all workspaces', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    strips.createStrips();
    const [left, right] = electron.windows;
    expect(left.workspaceCalls).toEqual([]);
    expect(right.workspaceCalls).toEqual([[true, { visibleOnFullScreen: false }]]);
  });

  it('picks the rightmost strip by geometry, not by display order', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    electron.state.displays = [electron.secondary, electron.primary];
    strips.createStrips();
    const [first, second] = electron.windows;
    expect(first.workspaceCalls).toHaveLength(1);
    expect(second.workspaceCalls).toEqual([]);
  });

  it('closes the previous strips when called again', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    strips.createStrips();
    strips.createStrips();
    expect(electron.windows).toHaveLength(4);
    expect(electron.windows.slice(0, 2).map((w) => w.destroyed)).toEqual([true, true]);
    expect(electron.windows.slice(2).map((w) => w.destroyed)).toEqual([false, false]);
  });

  it('keeps strips hidden until the page has loaded, then shows them', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    strips.createStrips();
    expect(electron.windows.map((w) => w.visible)).toEqual([false, false]);
    electron.windows[0].finishLoad();
    expect(electron.windows.map((w) => w.visible)).toEqual([true, false]);
    electron.windows[1].finishLoad();
    expect(electron.windows.map((w) => w.visible)).toEqual([true, true]);
    expect(execSpy).not.toHaveBeenCalled();
  });
});

describe('StripWindows on Linux with X11', () => {
  it('docks the rightmost strip with xprop in order, then shows it and reserves the strut', () => {
    setPlatform('linux', ':0');
    const { strips, electron } = setup();
    strips.createStrips();
    const right = electron.windows[1];
    right.finishLoad();
    const xid = String(right.xid);

    expect(xprop.calls).toEqual([
      [
        'xprop',
        '-id',
        xid,
        '-f',
        '_NET_WM_WINDOW_TYPE',
        '32a',
        '-set',
        '_NET_WM_WINDOW_TYPE',
        '_NET_WM_WINDOW_TYPE_DOCK',
      ],
    ]);
    expect(right.visible).toBe(false);

    finishNextXprop();
    expect(xprop.calls[1]).toEqual([
      'xprop',
      '-id',
      xid,
      '-f',
      '_NET_WM_DESKTOP',
      '32c',
      '-set',
      '_NET_WM_DESKTOP',
      '0xffffffff',
    ]);
    expect(right.visible).toBe(false);

    finishNextXprop();
    expect(right.visible).toBe(true);
    expect(xprop.calls[2]).toEqual([
      'xprop',
      '-id',
      xid,
      '-f',
      '_NET_WM_STRUT_PARTIAL',
      '32c',
      '-set',
      '_NET_WM_STRUT_PARTIAL',
      '0, 10, 0, 0, 0, 0, 0, 65535, 0, 0, 0, 0',
    ]);
    expect(xprop.calls[3].slice(0, 4)).toEqual(['xprop', '-id', xid, '-f']);
    expect(xprop.calls).toHaveLength(4);
  });

  it('shows a non-rightmost strip immediately without touching X properties', () => {
    setPlatform('linux', ':0');
    const { strips, electron } = setup();
    strips.createStrips();
    electron.windows[0].finishLoad();
    expect(electron.windows[0].visible).toBe(true);
    expect(xprop.calls).toEqual([]);
  });

  it('shows the strip immediately when DISPLAY is not set', () => {
    setPlatform('linux');
    const { strips, electron } = setup();
    strips.createStrips();
    electron.windows[1].finishLoad();
    expect(electron.windows[1].visible).toBe(true);
    expect(xprop.calls).toEqual([]);
  });

  it('still shows the strip when the native handle is unavailable', () => {
    setPlatform('linux', ':0');
    const { strips, electron } = setup();
    strips.createStrips();
    electron.windows[1].nativeHandleFails = true;
    electron.windows[1].finishLoad();
    expect(electron.windows[1].visible).toBe(true);
    expect(xprop.calls).toEqual([]);
  });
});

describe('StripWindows updateStripColor', () => {
  it('sends the default color on load and the new one to already loaded windows', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    strips.createStrips();
    electron.windows.forEach((w) => w.finishLoad());
    strips.updateStripColor('#ff0000');
    for (const window of electron.windows) {
      expect(window.sent).toEqual([
        ['strip-color', '#334155'],
        ['strip-color', '#ff0000'],
      ]);
    }
  });

  it('applies the latest color to windows that finish loading afterwards', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    strips.createStrips();
    strips.updateStripColor('#00ff00');
    strips.updateStripColor('#0000ff');
    electron.windows[0].sent.length = 0;
    electron.windows[0].finishLoad();
    expect(electron.windows[0].sent).toEqual([['strip-color', '#0000ff']]);
  });

  it('uses the color set before createStrips for new windows', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    strips.updateStripColor('#abcdef');
    strips.createStrips();
    electron.windows[0].finishLoad();
    expect(electron.windows[0].sent).toEqual([['strip-color', '#abcdef']]);
  });

  it('skips destroyed windows and windows without webContents', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    strips.createStrips();
    electron.windows[0].destroyed = true;
    electron.windows[1].webContents = null;
    expect(() => strips.updateStripColor('#123456')).not.toThrow();
    expect(electron.windows[0].sent).toEqual([]);
  });
});

describe('StripWindows hide and show', () => {
  it('hides and shows only the strip of the given display', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    strips.createStrips();
    electron.windows.forEach((w) => w.finishLoad());
    strips.hideStrip('2');
    expect(electron.windows.map((w) => w.visible)).toEqual([true, false]);
    strips.showStrip('2');
    expect(electron.windows.map((w) => w.visible)).toEqual([true, true]);
    strips.hideStrip('1');
    expect(electron.windows.map((w) => w.visible)).toEqual([false, true]);
  });

  it('ignores unknown displays and destroyed windows', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    strips.createStrips();
    electron.windows.forEach((w) => w.finishLoad());
    strips.hideStrip('99');
    strips.showStrip('99');
    electron.windows[1].destroyed = true;
    strips.hideStrip('2');
    expect(electron.windows[1].hideCount).toBe(0);
    electron.windows[1].visible = false;
    strips.showStrip('2');
    expect(electron.windows[1].visible).toBe(false);
    expect(electron.windows[0].visible).toBe(true);
  });
});

describe('StripWindows destroyStrips', () => {
  it('closes every strip and forgets them', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    strips.createStrips();
    electron.windows.forEach((w) => w.finishLoad());
    strips.destroyStrips();
    expect(electron.windows.map((w) => w.destroyed)).toEqual([true, true]);
    strips.updateStripColor('#111111');
    strips.showStrip('1');
    expect(electron.windows[0].sent).toEqual([['strip-color', '#334155']]);
    expect(electron.windows[0].visible).toBe(true);
    expect(electron.windows.map((w) => w.closeCount)).toEqual([1, 1]);
  });

  it('does not close an already destroyed window again', () => {
    setPlatform('darwin');
    const { strips, electron } = setup();
    strips.createStrips();
    electron.windows[0].destroyed = true;
    strips.destroyStrips();
    expect(electron.windows[0].closeCount).toBe(0);
    expect(electron.windows[1].closeCount).toBe(1);
  });
});
