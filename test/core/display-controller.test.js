'use strict';

const childProcess = require('child_process');
const { getVirtualScreenWidth, setX11Strut, getDisplaysWithWindows } = require('../../core/display-controller');

function makeScreen(displays = []) {
  return {
    getAllDisplays: () => displays,
    getDisplayNearestPoint: ({ x, y }) => {
      for (const d of displays) {
        if (x >= d.bounds.x && x < d.bounds.x + d.bounds.width) {
          return d;
        }
      }
      return displays[0] || { id: 0 };
    },
  };
}

function makeDisplay(overrides = {}) {
  return {
    id: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    ...overrides,
  };
}

describe('display-controller — getVirtualScreenWidth', () => {
  it('returns width of single display', () => {
    const screen = makeScreen([makeDisplay()]);
    expect(getVirtualScreenWidth(screen)).toBe(1920);
  });

  it('returns total width for side-by-side displays', () => {
    const screen = makeScreen([
      makeDisplay({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
      makeDisplay({ id: 2, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } }),
    ]);
    expect(getVirtualScreenWidth(screen)).toBe(1920 + 2560);
  });

  it('returns 0 for no displays', () => {
    const screen = makeScreen([]);
    expect(getVirtualScreenWidth(screen)).toBe(0);
  });
});

describe('display-controller — setX11Strut', () => {
  const originalPlatform = process.platform;
  const originalDisplay = process.env.DISPLAY;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    if (originalDisplay !== undefined) {
      process.env.DISPLAY = originalDisplay;
    }
  });

  it('does nothing on non-linux platform', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const spy = vi.spyOn(childProcess, 'execFile');
    const win = { isDestroyed: () => false, getNativeWindowHandle: () => Buffer.alloc(4) };
    const display = makeDisplay();
    const screen = makeScreen([display]);

    setX11Strut(win, display, 260, screen);

    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing when DISPLAY env is unset', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    delete process.env.DISPLAY;
    const spy = vi.spyOn(childProcess, 'execFile');
    const win = { isDestroyed: () => false, getNativeWindowHandle: () => Buffer.alloc(4) };
    const display = makeDisplay();
    const screen = makeScreen([display]);

    setX11Strut(win, display, 260, screen);

    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing when win is null', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.DISPLAY = ':0';
    const spy = vi.spyOn(childProcess, 'execFile');
    const display = makeDisplay();
    const screen = makeScreen([display]);

    setX11Strut(null, display, 260, screen);

    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing when win is destroyed', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.DISPLAY = ':0';
    const spy = vi.spyOn(childProcess, 'execFile');
    const win = { isDestroyed: () => true };
    const display = makeDisplay();
    const screen = makeScreen([display]);

    setX11Strut(win, display, 260, screen);

    expect(spy).not.toHaveBeenCalled();
  });

  it('skips strut when display is not on right edge of virtual screen', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.DISPLAY = ':0';
    const spy = vi.spyOn(childProcess, 'execFile');
    const leftDisplay = makeDisplay({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    const rightDisplay = makeDisplay({ id: 2, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } });
    const screen = makeScreen([leftDisplay, rightDisplay]);
    const win = { isDestroyed: () => false, getNativeWindowHandle: () => Buffer.alloc(4) };

    setX11Strut(win, leftDisplay, 260, screen);

    expect(spy).not.toHaveBeenCalled();
  });

  it('calls xprop twice for right-edge display (strut + desktop)', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.DISPLAY = ':0';
    const spy = vi.spyOn(childProcess, 'execFile').mockImplementation((_cmd, _args, cb) => cb(null));
    const display = makeDisplay({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } });
    const screen = makeScreen([display]);
    const xidBuf = Buffer.alloc(4);
    xidBuf.writeUInt32LE(12345, 0);
    const win = { isDestroyed: () => false, getNativeWindowHandle: () => xidBuf };

    setX11Strut(win, display, 260, screen);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toBe('xprop');
    expect(spy.mock.calls[0][1]).toContain('_NET_WM_STRUT_PARTIAL');
    expect(spy.mock.calls[1][1]).toContain('_NET_WM_DESKTOP');
  });

  it('handles getNativeWindowHandle throwing gracefully', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.DISPLAY = ':0';
    const spy = vi.spyOn(childProcess, 'execFile');
    const win = {
      isDestroyed: () => false,
      getNativeWindowHandle: () => { throw new Error('no handle'); },
    };
    const display = makeDisplay();
    const screen = makeScreen([display]);

    expect(() => setX11Strut(win, display, 260, screen)).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('display-controller — getDisplaysWithWindows', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls callback with null when wmctrl fails', () => {
    vi.spyOn(childProcess, 'execFile').mockImplementation((_cmd, _args, cb) => {
      cb(new Error('wmctrl not found'));
    });
    const screen = makeScreen([]);
    const callback = vi.fn();

    getDisplaysWithWindows(screen, callback);

    expect(callback).toHaveBeenCalledWith(null);
  });

  it('returns empty set when no windows are open', () => {
    vi.spyOn(childProcess, 'execFile').mockImplementation((_cmd, _args, cb) => {
      cb(null, '');
    });
    const screen = makeScreen([makeDisplay()]);
    const callback = vi.fn();

    getDisplaysWithWindows(screen, callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Set));
    expect(callback.mock.calls[0][0].size).toBe(0);
  });

  it('ignores lines with fewer than 9 parts', () => {
    vi.spyOn(childProcess, 'execFile').mockImplementation((_cmd, _args, cb) => {
      cb(null, '0x0001 0 100 200 300');
    });
    const screen = makeScreen([makeDisplay()]);
    const callback = vi.fn();

    getDisplaysWithWindows(screen, callback);

    expect(callback.mock.calls[0][0].size).toBe(0);
  });

  it('ignores sticky windows (desktop = -1)', () => {
    vi.spyOn(childProcess, 'execFile').mockImplementation((_cmd, _args, cb) => {
      cb(null, '0x0001 -1 100 200 300 400 gnome-panel.Gnome-panel hostname title');
    });
    const screen = makeScreen([makeDisplay()]);
    const callback = vi.fn();

    getDisplaysWithWindows(screen, callback);

    expect(callback.mock.calls[0][0].size).toBe(0);
  });

  it('ignores DeadlineAura windows', () => {
    vi.spyOn(childProcess, 'execFile').mockImplementation((_cmd, _args, cb) => {
      cb(null, '0x0001 0 100 200 300 400 deadlineaura.DeadlineAura hostname title');
    });
    const screen = makeScreen([makeDisplay()]);
    const callback = vi.fn();

    getDisplaysWithWindows(screen, callback);

    expect(callback.mock.calls[0][0].size).toBe(0);
  });

  it('ignores Electron windows', () => {
    vi.spyOn(childProcess, 'execFile').mockImplementation((_cmd, _args, cb) => {
      cb(null, '0x0001 0 100 200 300 400 electron.Electron hostname title');
    });
    const screen = makeScreen([makeDisplay()]);
    const callback = vi.fn();

    getDisplaysWithWindows(screen, callback);

    expect(callback.mock.calls[0][0].size).toBe(0);
  });

  it('detects occupied displays from normal windows', () => {
    const wmctrlOutput = '0x0001 0 500 300 800 600 firefox.Firefox hostname My Page';
    vi.spyOn(childProcess, 'execFile').mockImplementation((_cmd, _args, cb) => {
      cb(null, wmctrlOutput);
    });
    const display = makeDisplay({ id: 42 });
    const screen = makeScreen([display]);
    const callback = vi.fn();

    getDisplaysWithWindows(screen, callback);

    expect(callback.mock.calls[0][0].size).toBe(1);
    expect(callback.mock.calls[0][0].has('42')).toBe(true);
  });
});
