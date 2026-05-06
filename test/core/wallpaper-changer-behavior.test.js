'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const childProcess = require('child_process');

vi.spyOn(os, 'homedir').mockReturnValue(
  path.join(os.tmpdir(), 'deadlineaura-wc-test-' + process.pid),
);

vi.mock('../../store/pinned-queries', () => ({
  getAllPinned: vi.fn().mockReturnValue([]),
}));

vi.mock('../../core/wallpaper-renderer', () => ({
  render: vi.fn().mockResolvedValue({
    toBuffer: vi.fn().mockReturnValue(Buffer.from('fake-png')),
  }),
}));

vi.mock('../../core/display-manager', () => ({
  detectDisplays: vi.fn().mockReturnValue([
    { id: 'eDP-1', width: 1920, height: 1080, x: 0, y: 0, primary: true },
  ]),
}));

const {
  setOverlayOpen,
  isOverlayOpen,
  setWallpaper,
  update,
  buildPinnedByDisplay,
} = require('../../core/wallpaper-changer');

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
      .mockReturnValueOnce({ status: 0 })  // gsettings picture-uri
      .mockReturnValueOnce({ status: 0 })  // gsettings picture-uri-dark
      .mockReturnValueOnce({ status: 1 })  // gsettings picture-options — fails
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

describe('wallpaper-changer — buildPinnedByDisplay (re-exported)', () => {
  it('returns empty object when displays is empty', () => {
    expect(buildPinnedByDisplay([{ task_id: 't1', x_pct: 10, y_pct: 10 }], [])).toEqual({});
  });

  it('returns empty object when pinned is empty', () => {
    const displays = [{ id: 'eDP-1', width: 1920, height: 1080, x: 0, y: 0 }];
    expect(buildPinnedByDisplay([], displays)).toEqual({});
  });
});
