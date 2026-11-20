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
