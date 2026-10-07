'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const childProcess = require('child_process');
const { Canvas } = require('canvas');

vi.spyOn(os, 'homedir').mockReturnValue(
  path.join(os.tmpdir(), 'deadlineaura-wc-test-' + process.pid),
);

vi.mock('../../store/pinned-queries', () => ({
  getAllPinned: vi.fn().mockReturnValue([]),
}));

vi.mock('../../core/display-manager', () => ({
  detectDisplays: vi
    .fn()
    .mockReturnValue([{ id: 'eDP-1', width: 1920, height: 1080, x: 0, y: 0, primary: true }]),
}));

const wallpaperRenderer = require('../../core/wallpaper-renderer');
const pinnedQueries = require('../../store/pinned-queries');
const {
  setOverlayOpen,
  isOverlayOpen,
  setWallpaper,
  update,
  buildPinnedByDisplay,
  shouldRerender,
  resetState,
  WALLPAPER_PATH,
} = require('../../core/wallpaper-changer');

// vi.mock() does not intercept this module: wallpaper-changer.js requires it
// via a resolved path identical to the one above, but under this project's
// vite-node/CJS setup the replacement never reaches either side (confirmed by
// instrumenting both the test's own require and the module-under-test's —
// both returned the real, unmocked exports). vi.spyOn mutates the same
// Node-cached module.exports object in place, which both sides share, so it
// is the only mechanism that actually fakes the real (slow) canvas render.
let renderSpy;
beforeEach(() => {
  renderSpy = vi.spyOn(wallpaperRenderer, 'render').mockResolvedValue({
    // encodePng() uses the async callback form: canvas.toBuffer(cb, 'image/png').
    toBuffer: (cb) => cb(null, Buffer.from('fake-png')),
  });
});

afterAll(() => {
  const dataDir = path.join(
    os.tmpdir(),
    'deadlineaura-wc-test-' + process.pid,
    '.local',
    'share',
    'deadlineaura',
  );
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

describe('wallpaper-changer — setOverlayOpen / isOverlayOpen', () => {
  afterEach(() => {
    setOverlayOpen(false);
  });

  it('isOverlayOpen returns false by default', () => {
    setOverlayOpen(false);
    expect(isOverlayOpen()).toBe(false);
  });

  it('isOverlayOpen returns true after setOverlayOpen(true)', () => {
    setOverlayOpen(true);
    expect(isOverlayOpen()).toBe(true);
  });

  it('isOverlayOpen returns false after toggling back', () => {
    setOverlayOpen(true);
    setOverlayOpen(false);
    expect(isOverlayOpen()).toBe(false);
  });
});

describe('wallpaper-changer — setWallpaper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "gsettings" when all gsettings calls succeed', () => {
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 0 });

    const result = setWallpaper('/tmp/fake-wallpaper.png');
    expect(result).toBe('gsettings');
  });

  it('returns "feh" when gsettings fails but feh succeeds', () => {
    vi.spyOn(childProcess, 'spawnSync')
      .mockReturnValueOnce({ status: 0 }) // gsettings picture-uri
      .mockReturnValueOnce({ status: 0 }) // gsettings picture-uri-dark
      .mockReturnValueOnce({ status: 1 }) // gsettings picture-options — fails
      .mockReturnValueOnce({ status: 0 }); // feh succeeds

    const result = setWallpaper('/tmp/fake.png');
    expect(result).toBe('feh');
  });

  it('returns null when both gsettings and feh fail', () => {
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 1 });
    const result = setWallpaper('/tmp/fake.png');
    expect(result).toBeNull();
  });

  it('returns null when spawnSync throws', () => {
    vi.spyOn(childProcess, 'spawnSync').mockImplementation(() => {
      throw new Error('command not found');
    });
    const result = setWallpaper('/tmp/fake.png');
    expect(result).toBeNull();
  });
});

describe('wallpaper-changer — update()', () => {
  const fakePalette = { hsl: { h: 20, s: 50, l: 8 } };

  afterEach(() => {
    setOverlayOpen(false);
    resetState();
    vi.restoreAllMocks();
  });

  it('returns changed:false with reason "overlay open" when overlay is open', async () => {
    setOverlayOpen(true);
    const result = await update(fakePalette, { force: true });
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('overlay open');
  });

  it('returns changed:false when score delta is below threshold on second call', async () => {
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 0 });

    await update(fakePalette, { force: true });
    const result = await update(fakePalette, { force: false });
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('delta below threshold');
  });

  it('returns changed:true when force is true regardless of delta', async () => {
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 0 });

    await update(fakePalette, { force: true });
    const result = await update(fakePalette, { force: true });
    expect(result.changed).toBe(true);
  });

  it('returns changed:true on first call (no lastScore yet)', async () => {
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 0 });

    const altPalette = { hsl: { h: 160, s: 35, l: 12 } };
    const result = await update(altPalette, { force: true });
    expect(result.changed).toBe(true);
  });

  it('returns method in result when wallpaper is set', async () => {
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 0 });

    const result = await update(fakePalette, { force: true });
    expect(result).toHaveProperty('method');
    expect(result).toHaveProperty('path');
  });
});

describe('wallpaper-changer - update error handling', () => {
  const palette = { hsl: { h: 20, s: 50, l: 8 } };
  const nowMs = new Date('2026-05-11T12:00:00Z').getTime();
  const electronScreen = {
    getAllDisplays: () => [
      {
        id: 1,
        size: { width: 64, height: 64 },
        bounds: { x: 0, y: 0 },
        scaleFactor: 1,
      },
    ],
  };

  beforeEach(() => {
    renderSpy.mockRestore();
    resetState();
    setOverlayOpen(false);
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    vi.spyOn(pinnedQueries, 'getAllPinned').mockReturnValue([]);
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 0 });
  });

  afterEach(() => {
    resetState();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rejects with the encoding error when canvas.toBuffer reports failure', async () => {
    const error = new Error('PNG encoding failed');
    vi.spyOn(Canvas.prototype, 'toBuffer').mockImplementation((callback) => callback(error));

    const result = update(palette, { force: true, electronScreen, nowMs });

    await expect(result).rejects.toBe(error);
  });

  it('keeps the new wallpaper applied when stale wallpaper cleanup cannot read the directory', async () => {
    const readDirectory = vi.spyOn(fs, 'readdirSync').mockImplementation(() => {
      throw new Error('directory unreadable');
    });
    const writeFile = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);

    const result = await update(palette, { force: true, electronScreen, nowMs });

    expect(result).toEqual({
      changed: true,
      method: 'gsettings',
      path: path.join(path.dirname(WALLPAPER_PATH), `wallpaper-${nowMs}.png`),
    });
    expect(readDirectory).toHaveBeenCalledWith(path.dirname(result.path));
    expect(writeFile).toHaveBeenCalledWith(result.path, expect.any(Buffer));
  });
});

describe('wallpaper-changer — shouldRerender (pure)', () => {
  const nowMs = 1_000_000;

  it('returns true when force is true, even with no other reason to redraw', () => {
    expect(
      shouldRerender({
        force: true,
        hueChanged: false,
        prevSignature: 'same',
        nextSignature: 'same',
        lastRenderAt: nowMs,
        nowMs,
      }),
    ).toBe(true);
  });

  it('returns true when the hue changed', () => {
    expect(
      shouldRerender({
        force: false,
        hueChanged: true,
        prevSignature: 'same',
        nextSignature: 'same',
        lastRenderAt: nowMs,
        nowMs,
      }),
    ).toBe(true);
  });

  it('returns true when the usage signature changed', () => {
    expect(
      shouldRerender({
        force: false,
        hueChanged: false,
        prevSignature: 'a',
        nextSignature: 'b',
        lastRenderAt: nowMs,
        nowMs,
      }),
    ).toBe(true);
  });

  it('returns false when the signature is unchanged and within the 15-minute ceiling', () => {
    expect(
      shouldRerender({
        force: false,
        hueChanged: false,
        prevSignature: 'same',
        nextSignature: 'same',
        lastRenderAt: nowMs,
        nowMs: nowMs + 14 * 60 * 1000,
      }),
    ).toBe(false);
  });

  it('returns true when the signature is unchanged but non-empty and past the 15-minute ceiling', () => {
    expect(
      shouldRerender({
        force: false,
        hueChanged: false,
        prevSignature: 'claude:default:0:0|OK|0|3:n',
        nextSignature: 'claude:default:0:0|OK|0|3:n',
        lastRenderAt: nowMs,
        nowMs: nowMs + 15 * 60 * 1000,
      }),
    ).toBe(true);
  });

  it('returns false when the signature is empty, even past the 15-minute ceiling', () => {
    expect(
      shouldRerender({
        force: false,
        hueChanged: false,
        prevSignature: '',
        nextSignature: '',
        lastRenderAt: nowMs,
        nowMs: nowMs + 15 * 60 * 1000,
      }),
    ).toBe(false);
  });
});

describe('wallpaper-changer — update() driven by the usage signature', () => {
  const fakePalette = { hsl: { h: 20, s: 50, l: 8 } };
  const baseNowMs = 2_000_000;

  const rowA = {
    kind: 'claude',
    label: 'default',
    stale: false,
    fiveHour: { pct: 10, resetsAt: Math.floor(baseNowMs / 1000) + 3600, expired: false },
    sevenDay: null,
  };
  const rowB = {
    kind: 'claude',
    label: 'default',
    stale: false,
    fiveHour: { pct: 80, resetsAt: Math.floor(baseNowMs / 1000) + 3600, expired: false },
    sevenDay: null,
  };

  beforeEach(() => {
    resetState();
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 0 });
  });

  afterEach(() => {
    setOverlayOpen(false);
    resetState();
    vi.restoreAllMocks();
  });

  it('renders when the hue is unchanged but the usage signature changed', async () => {
    await update(fakePalette, { force: true, usageRows: [rowA], nowMs: baseNowMs });
    const result = await update(fakePalette, {
      force: false,
      usageRows: [rowB],
      nowMs: baseNowMs + 60 * 1000,
    });

    expect(result.changed).toBe(true);
  });

  it('skips when the hue is unchanged and the usage signature is unchanged', async () => {
    // Same nowMs on both calls: isolates "same signature" from the
    // countdown-bucket drift that a real time gap would also introduce
    // (covered on its own by the shouldRerender pure tests above).
    await update(fakePalette, { force: true, usageRows: [rowA], nowMs: baseNowMs });
    const result = await update(fakePalette, {
      force: false,
      usageRows: [rowA],
      nowMs: baseNowMs,
    });

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('delta below threshold');
  });

  it('forwards usageRows and nowMs to the renderer', async () => {
    await update(fakePalette, { force: true, usageRows: [rowA], nowMs: baseNowMs });

    expect(renderSpy).toHaveBeenCalledWith(
      expect.objectContaining({ usageRows: [rowA], nowMs: baseNowMs }),
    );
  });
});

describe('wallpaper-changer — buildPinnedByDisplay (re-exported)', () => {
  it('returns empty object when displays is empty', () => {
    expect(buildPinnedByDisplay([{ task_id: 't1', x_pct: 10, y_pct: 10 }], [])).toEqual({});
  });

  it('returns empty object when pinned is empty', () => {
    const displays = [{ id: 'eDP-1', width: 1920, height: 1080, x: 0, y: 0 }];
    expect(buildPinnedByDisplay([], displays)).toEqual({});
  });
});
