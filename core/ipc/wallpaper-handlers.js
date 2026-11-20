'use strict';

const fs = require('fs');

const IMAGE_FILTERS = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }];

async function importSelection(deps, filePath) {
  try {
    fs.mkdirSync(deps.dataDir, { recursive: true });
    return await deps.importCustomBackground(filePath, {
      dataDir: deps.dataDir,
      loadImage: deps.loadImage,
    });
  } catch (err) {
    console.warn('[wallpaper] import failed:', err.message);
    return { ok: false, error: 'COPY_FAILED' };
  }
}

async function saveBackground(deps, file) {
  try {
    const config = deps.getConfig();
    await deps.applyConfig({
      ...config,
      wallpaper: { ...config.wallpaper, custom_background: file },
    });
    return true;
  } catch (err) {
    console.warn('[wallpaper] save failed:', err.message);
    return false;
  }
}

function createPickHandler(deps) {
  return async () => {
    const selection = await deps.showOpenDialog({
      filters: IMAGE_FILTERS,
      properties: ['openFile'],
    });
    if (selection.canceled) {
      return { ok: false, error: 'CANCELLED' };
    }
    const result = await importSelection(deps, selection.filePaths[0]);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return (await saveBackground(deps, result.file)) ? result : { ok: false, error: 'SAVE_FAILED' };
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
