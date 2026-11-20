'use strict';

const fs = require('fs');

const IMAGE_FILTERS = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }];

function createPickHandler(deps) {
  return async () => {
    const selection = await deps.showOpenDialog({
      filters: IMAGE_FILTERS,
      properties: ['openFile'],
    });
    if (selection.canceled) {
      return { ok: false, error: 'CANCELLED' };
    }
    fs.mkdirSync(deps.dataDir, { recursive: true });
    const result = await deps.importCustomBackground(selection.filePaths[0], {
      dataDir: deps.dataDir,
      loadImage: deps.loadImage,
    });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    const config = deps.getConfig();
    await deps.applyConfig({
      ...config,
      wallpaper: { ...config.wallpaper, custom_background: result.file },
    });
    return result;
  };
}

function createWallpaperHandlers(deps) {
  return {
    'wallpaper:pick-background': createPickHandler(deps),
    'wallpaper:background-status': () =>
      deps.describeCustomBackground(deps.getConfig().wallpaper.custom_background, {
        dataDir: deps.dataDir,
      }),
  };
}

module.exports = { createWallpaperHandlers };
