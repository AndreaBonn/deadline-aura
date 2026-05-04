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
const EDGE_TRIGGER_PX = 6;
const AUTOHIDE_DELAY_MS = 500;
const MOUSE_POLL_MS = 100;
const DESKTOP_CHECK_MS = 1000;

let sidebarWindow = null;
let sidebarReady = false;
let sidebarHideTimeout = null;
let mousePollInterval = null;
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
  // No-op when sidebar not ready
  if (!sidebarWindow || sidebarWindow.isDestroyed() || !sidebarReady) {
    return;
  }

  getDisplaysWithWindows((occupiedDisplayIds) => {
    if (!occupiedDisplayIds) {
      // wmctrl failed — show sidebar on primary as fallback
      if (!sidebarWindow.isVisible()) {
        showSidebarOnDisplay(screen.getPrimaryDisplay());
      }
      return;
    }

    // Find first unoccupied display to pin sidebar
    const displays = screen.getAllDisplays();
    const freeDisplay = displays.find((d) => !occupiedDisplayIds.has(String(d.id)));

    if (freeDisplay && !sidebarWindow.isVisible()) {
      showSidebarOnDisplay(freeDisplay);
    } else if (!freeDisplay && sidebarWindow.isVisible() && !sidebarHideTimeout) {
      // All displays occupied — hide sidebar
      hideSidebar();
    }
  });
}

function createSidebar() {
  if (sidebarWindow && !sidebarWindow.isDestroyed()) {
    return;
  }
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.workAreaSize;
  const { x: wx, y: wy } = primary.workArea;
  const sidebarWidth = config.sidebar.width;

  sidebarWindow = new BrowserWindow({
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

  sidebarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  sidebarWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  sidebarWindow.webContents.once('did-finish-load', () => {
    sidebarReady = true;
    runUpdateCycle({ force: true });
  });

  sidebarWindow.on('closed', () => {
    sidebarWindow = null;
    sidebarReady = false;
    clearInterval(mousePollInterval);
    mousePollInterval = null;
  });
}

function showSidebarOnDisplay(display) {
  if (!sidebarWindow || sidebarWindow.isDestroyed()) {
    return;
  }
  if (sidebarHideTimeout) {
    clearTimeout(sidebarHideTimeout);
    sidebarHideTimeout = null;
  }

  const { width, height } = display.workAreaSize;
  const { x: wx, y: wy } = display.workArea;
  const sidebarWidth = config.sidebar.width;
  sidebarWindow.setBounds({
    x: wx + width - sidebarWidth,
    y: wy,
    width: sidebarWidth,
    height: height,
  });
  if (!sidebarWindow.isVisible()) {
    sidebarWindow.show();
  }
}

function hideSidebar() {
  if (sidebarWindow && !sidebarWindow.isDestroyed()) {
    sidebarWindow.hide();
  }
}

function startMousePoll() {
  if (mousePollInterval) {
    return;
  }

  mousePollInterval = setInterval(() => {
    if (!sidebarWindow || sidebarWindow.isDestroyed()) {
      return;
    }

    const cursor = screen.getCursorScreenPoint();
    const sidebarVisible = sidebarWindow.isVisible();

    if (!sidebarVisible) {
      // Check if cursor is at the right edge of any display
      const displays = screen.getAllDisplays();
      for (const display of displays) {
        const { x: wx, y: wy } = display.workArea;
        const { width, height } = display.workAreaSize;
        const rightEdge = wx + width;

        if (
          cursor.x >= rightEdge - EDGE_TRIGGER_PX &&
          cursor.x <= rightEdge &&
          cursor.y >= wy &&
          cursor.y <= wy + height
        ) {
          showSidebarOnDisplay(display);
          break;
        }
      }
    } else {
      // Sidebar visible — check if mouse left sidebar bounds
      const bounds = sidebarWindow.getBounds();
      const isInside =
        cursor.x >= bounds.x &&
        cursor.x <= bounds.x + bounds.width &&
        cursor.y >= bounds.y &&
        cursor.y <= bounds.y + bounds.height;

      if (isInside) {
        if (sidebarHideTimeout) {
          clearTimeout(sidebarHideTimeout);
          sidebarHideTimeout = null;
        }
      } else if (!sidebarHideTimeout) {
        sidebarHideTimeout = setTimeout(() => {
          hideSidebar();
          sidebarHideTimeout = null;
        }, AUTOHIDE_DELAY_MS);
      }
    }
  }, MOUSE_POLL_MS);
}

function initSidebar() {
  createSidebar();
  startMousePoll();
}

async function runUpdateCycle({ force = false } = {}) {
  try {
    const engineResult = deadlineEngine.run({
      lookaheadHours: config.sync.lookahead_hours,
      k: config.engine.k_constant,
      priorityWeights: config.engine.priority_weights,
    });

    const palette = colorMapper.mapScoreToColor(engineResult.global_score);

    if (config.wallpaper.enabled) {
      const calendarEvents = db.getUpcomingCalendarEvents(24 * 3600000);
      await wallpaperChanger.update(palette, {
        engineResult,
        force,
        electronScreen: screen,
        calendarEvents,
      });
    }

    const allPinned = pinnedQueries.getAllPinned();
    const pinnedIds = new Set(allPinned.map((p) => p.task_id));

    if (sidebarWindow && !sidebarWindow.isDestroyed() && sidebarReady) {
      sidebarWindow.webContents.send('update', {
        engineResult,
        palette,
        pinnedTaskIds: Array.from(pinnedIds),
      });
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
  initSidebar();

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
    if (sidebarWindow && !sidebarWindow.isDestroyed()) {
      sidebarWindow.webContents.send('config-changed', config);
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
