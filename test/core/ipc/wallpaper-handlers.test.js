'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWallpaperHandlers } = require('../../../core/ipc/wallpaper-handlers');

it('ignores payload, imports the selected image and preserves the rest of the config', async () => {
  const dataDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wallpaper-ipc-')), 'data');
  const config = { wallpaper: { background_mode: 'dynamic', custom_background: null }, other: 42 };
  const result = { ok: true, file: 'custom-background.png', width: 8, height: 8 };
  const deps = {
    dataDir,
    getConfig: () => config,
    loadImage: vi.fn(),
    applyConfig: vi.fn(),
    showOpenDialog: vi
      .fn()
      .mockResolvedValueOnce({ canceled: true })
      .mockResolvedValueOnce({ canceled: false, filePaths: ['/chosen.png'] }),
    importCustomBackground: vi.fn().mockImplementation(() => {
      expect(fs.statSync(dataDir).isDirectory()).toBe(true);
      return result;
    }),
    describeCustomBackground: vi.fn().mockReturnValue({ state: 'none' }),
  };
  const handlers = createWallpaperHandlers(deps);
  const pick = handlers['wallpaper:pick-background'];
  const cancelled = await pick({ path: '/etc/passwd' });
  expect(cancelled).toEqual({ ok: false, error: 'CANCELLED' });
  expect(JSON.stringify(cancelled)).not.toContain('/');
  expect(deps.importCustomBackground).not.toHaveBeenCalled();
  expect(deps.applyConfig).not.toHaveBeenCalled();
  expect(await pick({ path: '/etc/passwd' })).toEqual(result);
  expect(deps.importCustomBackground).toHaveBeenCalledWith('/chosen.png', {
    dataDir,
    loadImage: deps.loadImage,
  });
  expect(deps.applyConfig).toHaveBeenCalledWith({
    ...config,
    wallpaper: { ...config.wallpaper, custom_background: result.file },
  });
  expect(config.wallpaper.custom_background).toBe(null);
  expect(deps.showOpenDialog).toHaveBeenCalledWith(
    expect.objectContaining({
      properties: ['openFile'],
      filters: [expect.objectContaining({ extensions: ['png', 'jpg', 'jpeg'] })],
    }),
  );
  expect(handlers['wallpaper:background-status']()).toEqual({ state: 'none' });
  expect(deps.describeCustomBackground).toHaveBeenCalledWith(null, { dataDir });
});

it('returns only the import error code and leaves config unchanged, while successful imports apply it', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallpaper-ipc-'));
  const deps = {
    dataDir,
    getConfig: () => ({ wallpaper: { custom_background: null } }),
    loadImage: vi.fn(),
    applyConfig: vi.fn(),
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/chosen.png'] }),
    importCustomBackground: vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'UNREADABLE' })
      .mockResolvedValueOnce({ ok: true, file: 'custom-background.png', width: 8, height: 8 }),
  };
  const pick = createWallpaperHandlers(deps)['wallpaper:pick-background'];
  const error = await pick();
  expect(error).toEqual({ ok: false, error: 'UNREADABLE' });
  expect(JSON.stringify(error)).not.toContain('/');
  expect(deps.applyConfig).not.toHaveBeenCalled();
  expect((await pick()).ok).toBe(true);
  expect(deps.applyConfig).toHaveBeenCalledOnce();
});

describe('pick handler failures', () => {
  const imported = { ok: true, file: 'custom-background.png', width: 8, height: 8 };
  const build = (overrides) => ({
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wallpaper-ipc-')),
    getConfig: () => ({ wallpaper: { custom_background: null } }),
    loadImage: vi.fn(),
    applyConfig: vi.fn(),
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/chosen.png'] }),
    importCustomBackground: vi.fn().mockResolvedValue(imported),
    ...overrides,
  });

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns SAVE_FAILED without any path when applyConfig rejects, and ok otherwise', async () => {
    const deps = build({
      applyConfig: vi
        .fn()
        .mockRejectedValueOnce(new Error('EACCES /home/user/.config/x'))
        .mockResolvedValueOnce(undefined),
    });
    const pick = createWallpaperHandlers(deps)['wallpaper:pick-background'];
    const failed = await pick();
    expect(failed).toEqual({ ok: false, error: 'SAVE_FAILED' });
    expect(JSON.stringify(failed)).not.toContain('/');
    expect(console.warn).toHaveBeenCalledWith('[wallpaper] save failed:', expect.any(String));
    expect(await pick()).toEqual(imported);
  });

  it('returns COPY_FAILED without any path when the import throws', async () => {
    const deps = build({
      importCustomBackground: vi.fn().mockRejectedValue(new Error('ENOSPC /home/user/x')),
    });
    const failed = await createWallpaperHandlers(deps)['wallpaper:pick-background']();
    expect(failed).toEqual({ ok: false, error: 'COPY_FAILED' });
    expect(JSON.stringify(failed)).not.toContain('/');
    expect(deps.applyConfig).not.toHaveBeenCalled();
  });

  it('returns COPY_FAILED when creating the data directory throws', async () => {
    const blocker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wallpaper-ipc-')), 'file');
    fs.writeFileSync(blocker, 'x');
    const deps = build({ dataDir: path.join(blocker, 'sub') });
    const failed = await createWallpaperHandlers(deps)['wallpaper:pick-background']();
    expect(failed).toEqual({ ok: false, error: 'COPY_FAILED' });
    expect(deps.importCustomBackground).not.toHaveBeenCalled();
  });
});
