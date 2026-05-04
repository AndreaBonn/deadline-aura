'use strict';

require('dotenv').config();

const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { execFile, spawn } = require('child_process');
const path = require('path');
const deadlineEngine = require('./core/deadline-engine');
const colorMapper = require('./core/color-mapper');
const wallpaperChanger = require('./core/wallpaper-changer');
const db = require('./store/db');
const pinnedQueries = require('./store/pinned-queries');
const { loadConfig, saveConfig } = require('./config/loader');
const { DEFAULTS } = require('./config/defaults');
const { configSchema } = require('./config/schema');
let config = loadConfig();

let settingsWindow = null;

let overlayWindow = null;

const UPDATE_INTERVAL_MS = 60000;
const CLEANUP_INTERVAL_MS = 24 * 3600000;
const STRIP_WIDTH = 6;
const AUTOHIDE_DELAY_MS = 500;
const MOUSE_POLL_MS = 100;
const DESKTOP_CHECK_MS = 1000;

let docks = []; // { sidebar, strip, hideTimeout, pollInterval, palette, desktopPinned, displayId }
let currentPalette = null;
let desktopCheckInterval = null;

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 720,
    height: 560,
    frame: false,
    resizable: false,
    backgroundColor: '#0a0c14',
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function getDisplaysWithWindows(callback) {
  // wmctrl -l -G -x: id desktop x y w h wm_class hostname title
  execFile('wmctrl', ['-l', '-G', '-x'], (err, stdout) => {
    if (err) {
      callback(null);
      return;
    }

    const occupiedDisplayIds = new Set();

    for (const line of stdout.trim().split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 9) {
        continue;
      }

      const desktop = parseInt(parts[1], 10);
      if (desktop === -1) {
        continue;
      }

      // Skip our own windows (sidebar, strip, overlay, settings)
      const wmClass = parts[6].toLowerCase();
      if (wmClass.includes('deadlineaura') || wmClass === 'electron.electron') {
        continue;
      }

      const x = parseInt(parts[2], 10);
      const y = parseInt(parts[3], 10);
      const display = screen.getDisplayNearestPoint({ x, y });
      occupiedDisplayIds.add(String(display.id));
    }

    callback(occupiedDisplayIds);
  });
}

function checkDesktopState() {
  getDisplaysWithWindows((occupiedDisplayIds) => {
    if (!occupiedDisplayIds) {
      for (const dock of docks) {
        if (!dock.desktopPinned) {
          dock.desktopPinned = true;
          openDock(dock);
        }
      }
      return;
    }

    for (const dock of docks) {
      if (occupiedDisplayIds.has(dock.displayId)) {
        if (dock.desktopPinned) {
          dock.desktopPinned = false;
          closeDock(dock);
        }
      } else {
        if (!dock.desktopPinned) {
          dock.desktopPinned = true;
          openDock(dock);
        }
      }
    }
  });
}

function buildStripHTML(accentColor) {
  return `<html><body style="margin:0;background:${accentColor};cursor:default;"></body></html>`;
}

function createDockForDisplay(display) {
  const { width, height } = display.workAreaSize;
  const { x: wx, y: wy } = display.workArea;
  const sidebarWidth = config.sidebar.width;
  const accentColor = currentPalette ? currentPalette.accent : '#1a1c2e';

  // Colored strip — always visible at right edge
  const strip = new BrowserWindow({
    width: STRIP_WIDTH,
    height: height,
    x: wx + width - STRIP_WIDTH,
    y: wy,
    frame: false,
    transparent: false,
    backgroundColor: accentColor,
    alwaysOnTop: false,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  strip.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  strip.setIgnoreMouseEvents(false);
  strip.loadURL('data:text/html,' + encodeURIComponent(buildStripHTML(accentColor)));

  // Full sidebar — shown on hover, hidden otherwise
  const sidebar = new BrowserWindow({
    width: sidebarWidth,
    height: height,
    x: wx + width - sidebarWidth,
    y: wy,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0c14',
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  sidebar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  sidebar.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  const dock = {
    sidebar,
    strip,
    hideTimeout: null,
    pollInterval: null,
    palette: null,
    desktopPinned: false,
    displayId: String(display.id),
    sidebarReady: false,
  };

  sidebar.webContents.once('did-finish-load', () => {
    dock.sidebarReady = true;
    runUpdateCycle({ force: true });
  });

  // Poll mouse position — detect hover over strip or sidebar
  dock.pollInterval = setInterval(() => {
    const cursor = screen.getCursorScreenPoint();

    // Desktop pinned — sidebar stays open, skip autohide logic
    if (dock.desktopPinned) {
      return;
    }

    if (!sidebar.isVisible()) {
      // Check if mouse is over the strip
      if (!strip.isDestroyed() && strip.isVisible()) {
        const sb = strip.getBounds();
        if (
          cursor.x >= sb.x &&
          cursor.x <= sb.x + sb.width &&
          cursor.y >= sb.y &&
          cursor.y <= sb.y + sb.height
        ) {
          openDock(dock);
        }
      }
    } else {
      // Sidebar is visible — check if mouse left sidebar area
      const bounds = sidebar.getBounds();
      const isInside =
        cursor.x >= bounds.x &&
        cursor.x <= bounds.x + bounds.width &&
        cursor.y >= bounds.y &&
        cursor.y <= bounds.y + bounds.height;

      if (isInside) {
        if (dock.hideTimeout) {
          clearTimeout(dock.hideTimeout);
          dock.hideTimeout = null;
        }
      } else if (!dock.hideTimeout) {
        dock.hideTimeout = setTimeout(() => {
          closeDock(dock);
          dock.hideTimeout = null;
        }, AUTOHIDE_DELAY_MS);
      }
    }
  }, MOUSE_POLL_MS);

  sidebar.on('closed', () => {
    clearInterval(dock.pollInterval);
    if (!strip.isDestroyed()) {
      strip.close();
    }
    docks = docks.filter((d) => d !== dock);
  });

  strip.on('closed', () => {
    clearInterval(dock.pollInterval);
    if (!sidebar.isDestroyed()) {
      sidebar.close();
    }
  });

  return dock;
}

function openDock(dock) {
  if (dock.hideTimeout) {
    clearTimeout(dock.hideTimeout);
    dock.hideTimeout = null;
  }
  if (!dock.strip.isDestroyed()) {
    dock.strip.hide();
  }
  if (!dock.sidebar.isDestroyed() && !dock.sidebar.isVisible()) {
    dock.sidebar.show();
  }
}

function closeDock(dock) {
  if (!dock.sidebar.isDestroyed()) {
    dock.sidebar.hide();
  }
  if (!dock.strip.isDestroyed()) {
    dock.strip.show();
  }
}

function updateStripColor(palette) {
  const color = palette ? palette.accent_hex : '#1a1c2e';
  for (const dock of docks) {
    if (!dock.strip.isDestroyed()) {
      dock.strip.setBackgroundColor(color);
      dock.strip.loadURL('data:text/html,' + encodeURIComponent(buildStripHTML(color)));
    }
  }
}

function createAllDocks() {
  const displays = screen.getAllDisplays();
  docks = displays.map((d) => createDockForDisplay(d));
}

async function runUpdateCycle({ force = false } = {}) {
  try {
    const engineResult = deadlineEngine.run({
      lookaheadHours: config.sync.lookahead_hours,
      k: config.engine.k_constant,
      priorityWeights: config.engine.priority_weights,
    });

    const palette = colorMapper.mapScoreToColor(engineResult.global_score);
    currentPalette = palette;

    if (config.wallpaper.enabled) {
      await wallpaperChanger.update(palette, {
        engineResult,
        force,
        electronScreen: screen,
      });
    }

    updateStripColor(palette);

    const allPinned = pinnedQueries.getAllPinned();
    const pinnedIds = new Set(allPinned.map((p) => p.task_id));

    for (const dock of docks) {
      if (dock.sidebar && !dock.sidebar.isDestroyed() && dock.sidebarReady) {
        dock.sidebar.webContents.send('update', {
          engineResult,
          palette,
          pinnedTaskIds: Array.from(pinnedIds),
        });
      }
    }

    return { engineResult, palette };
  } catch (err) {
    try {
      console.error('Update cycle error:', err.message);
    } catch {
      // EPIPE — pipe closed, ignore logging failure
    }
    return null;
  }
}

function openOverlay(displayId) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus();
    return;
  }

  wallpaperChanger.setOverlayOpen(true);

  const displays = screen.getAllDisplays();
  const targetDisplay =
    displays.find((d) => String(d.id) === displayId) || screen.getPrimaryDisplay();

  overlayWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.size.width,
    height: targetDisplay.size.height,
    fullscreen: true,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload-overlay.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));

  overlayWindow.webContents.once('did-finish-load', () => {
    const pinned = pinnedQueries.getByDisplay(displayId);
    overlayWindow.webContents.send('overlay-init', {
      pinnedTasks: pinned,
      displayId,
      width: targetDisplay.size.width,
      height: targetDisplay.size.height,
    });
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    wallpaperChanger.setOverlayOpen(false);
  });
}

app.whenReady().then(() => {
  createAllDocks();

  runUpdateCycle();
  setInterval(runUpdateCycle, UPDATE_INTERVAL_MS);
  setInterval(() => db.cleanupOldRecords(), CLEANUP_INTERVAL_MS);

  checkDesktopState();
  desktopCheckInterval = setInterval(checkDesktopState, DESKTOP_CHECK_MS);

  ipcMain.on('sync-now', async () => {
    try {
      const syncDaemon = require('./core/sync-daemon');
      await syncDaemon.sync(config);
      runUpdateCycle();
    } catch (err) {
      console.error('Manual sync error:', err.message);
    }
  });

  ipcMain.on('open-link', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      const child = spawn('firefox', [url], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    }
  });

  ipcMain.on('open-config', () => {
    openSettingsWindow();
  });

  ipcMain.handle('settings:get-config', () => config);
  ipcMain.handle('settings:get-defaults', () => DEFAULTS);
  ipcMain.handle('settings:save-config', (_event, newConfig) => {
    const result = configSchema.safeParse(newConfig);
    if (!result.success) {
      return { ok: false, errors: result.error.flatten().fieldErrors };
    }
    saveConfig(result.data);
    config = loadConfig();
    for (const dock of docks) {
      if (!dock.sidebar.isDestroyed()) {
        dock.sidebar.webContents.send('config-changed', config);
      }
    }
    return { ok: true };
  });

  ipcMain.on('settings:close', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  });

  ipcMain.on('pin-task', (_event, { taskId, displayId }) => {
    pinnedQueries.pinTask({ taskId, displayId: displayId || 'default' });
    runUpdateCycle({ force: true });
  });

  ipcMain.on('unpin-task', (_event, { taskId, displayId }) => {
    if (displayId) {
      pinnedQueries.unpinTask({ taskId, displayId });
    } else {
      pinnedQueries.unpinTaskFromAll(taskId);
    }
    runUpdateCycle({ force: true });
  });

  ipcMain.on('open-overlay', (_event, { displayId }) => {
    openOverlay(displayId || 'default');
  });

  ipcMain.on('save-positions', (_event, positions) => {
    pinnedQueries.updatePositions(positions);
    wallpaperChanger.setOverlayOpen(false);
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }
    runUpdateCycle({ force: true });
  });

  ipcMain.on('overlay-cancel', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }
  });
});

app.on('window-all-closed', () => {
  clearInterval(desktopCheckInterval);
  db.close();
  app.quit();
});
