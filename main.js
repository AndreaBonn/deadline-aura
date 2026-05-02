'use strict';

const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const deadlineEngine = require('./core/deadline-engine');
const colorMapper = require('./core/color-mapper');
const wallpaperChanger = require('./core/wallpaper-changer');
const db = require('./store/db');
const { DEFAULTS } = require('./config/defaults');

const UPDATE_INTERVAL_MS = 60000;
const CLEANUP_INTERVAL_MS = 24 * 3600000;

let mainWindow = null;

function createSidebarWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const { x: wx, y: wy } = primaryDisplay.workArea;

  const sidebarWidth = DEFAULTS.sidebar.width;

  mainWindow = new BrowserWindow({
    width: sidebarWidth,
    height: height,
    x: wx + width - sidebarWidth,
    y: wy,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    focusable: false,
    type: 'normal',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function runUpdateCycle() {
  try {
    const engineResult = deadlineEngine.run({
      lookaheadHours: DEFAULTS.sync.lookahead_hours,
      k: DEFAULTS.engine.k_constant,
      priorityWeights: DEFAULTS.engine.priority_weights,
    });

    const palette = colorMapper.mapScoreToColor(engineResult.global_score);

    if (DEFAULTS.wallpaper.enabled) {
      wallpaperChanger.update(palette, { engineResult });
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update', { engineResult, palette });
    }

    return { engineResult, palette };
  } catch (err) {
    console.error('Update cycle error:', err.message);
    return null;
  }
}

app.whenReady().then(() => {
  createSidebarWindow();

  runUpdateCycle();
  setInterval(runUpdateCycle, UPDATE_INTERVAL_MS);
  setInterval(() => db.cleanupOldRecords(), CLEANUP_INTERVAL_MS);

  ipcMain.on('sync-now', async () => {
    try {
      const syncDaemon = require('./core/sync-daemon');
      await syncDaemon.sync(DEFAULTS);
      runUpdateCycle();
    } catch (err) {
      console.error('Manual sync error:', err.message);
    }
  });

  ipcMain.on('open-config', () => {
    console.log('Config window not yet implemented');
  });
});

app.on('window-all-closed', () => {
  db.close();
  app.quit();
});
