'use strict';

const path = require('path');
const { getOverlayBounds, findDisplayById } = require('../core/window-geometry');

function overlayOptions(display) {
  return {
    ...getOverlayBounds(display),
    fullscreen: true,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-overlay.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
}

/**
 * Full-screen overlay where pinned tasks are positioned, plus the IPC channels
 * that drive it (pin, unpin, open, save positions, cancel).
 */
class OverlayWindow {
  #window = null;
  #dependencies;

  constructor(dependencies) {
    this.#dependencies = dependencies;
  }

  open(displayId) {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.focus();
      return;
    }
    const { BrowserWindow, screen, wallpaperChanger } = this.#dependencies;
    wallpaperChanger.setOverlayOpen(true);

    const targetDisplay =
      findDisplayById(screen.getAllDisplays(), displayId) || screen.getPrimaryDisplay();

    const window = new BrowserWindow(overlayOptions(targetDisplay));
    this.#window = window;
    window.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
    window.webContents.once('did-finish-load', () => this.#sendInit(displayId, targetDisplay));
    window.on('closed', () => {
      this.#window = null;
      wallpaperChanger.setOverlayOpen(false);
    });
  }

  #sendInit(displayId, targetDisplay) {
    const { pinnedQueries, withPostitCodes } = this.#dependencies;
    const pinned = withPostitCodes(pinnedQueries.getByDisplay(displayId));
    this.#window.webContents.send('overlay-init', {
      pinnedTasks: pinned,
      displayId,
      width: targetDisplay.size.width,
      height: targetDisplay.size.height,
    });
  }

  close() {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.close();
    }
  }

  registerIpc(ipcMain) {
    this.#registerPinIpc(ipcMain);
    this.#registerOverlayIpc(ipcMain);
  }

  #registerPinIpc(ipcMain) {
    const { pinnedQueries, refresh } = this.#dependencies;

    ipcMain.on('pin-task', (_event, { taskId, displayId }) => {
      pinnedQueries.pinTask({ taskId, displayId: displayId || 'default' });
      refresh({ force: true });
    });

    ipcMain.on('unpin-task', (_event, { taskId, displayId }) => {
      if (displayId) {
        pinnedQueries.unpinTask({ taskId, displayId });
      } else {
        pinnedQueries.unpinTaskFromAll(taskId);
      }
      refresh({ force: true });
    });
  }

  #registerOverlayIpc(ipcMain) {
    const { pinnedQueries, wallpaperChanger, refresh } = this.#dependencies;

    ipcMain.on('open-overlay', (_event, { displayId }) => {
      this.open(displayId || 'default');
    });

    ipcMain.on('overlay-unpin-tasks', (_event, taskIds) => {
      for (const taskId of taskIds) {
        pinnedQueries.unpinTaskFromAll(taskId);
      }
    });

    ipcMain.on('save-positions', (_event, positions) => {
      pinnedQueries.updatePositions(positions);
      wallpaperChanger.setOverlayOpen(false);
      this.close();
      refresh({ force: true });
    });

    ipcMain.on('overlay-cancel', () => {
      this.close();
    });
  }
}

/**
 * @param {object} dependencies - BrowserWindow, screen, wallpaperChanger,
 *   pinnedQueries, withPostitCodes and the `refresh` callback.
 * @returns {OverlayWindow}
 */
function createOverlayWindow(dependencies) {
  return new OverlayWindow(dependencies);
}

module.exports = { createOverlayWindow };
