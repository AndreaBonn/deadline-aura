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
const STRIP_WIDTH = 20;
const DESKTOP_CHECK_MS = 1000;

function getVirtualScreenWidth() {
  return screen.getAllDisplays().reduce((max, d) => Math.max(max, d.bounds.x + d.bounds.width), 0);
}

function setX11Strut(win, display, strutWidth) {
  if (process.platform !== 'linux' || !process.env.DISPLAY) {
    return;
  }
  if (!win || win.isDestroyed()) {
    return;
  }
  try {
    const xid = win.getNativeWindowHandle().readUInt32LE(0);
    const virtualWidth = getVirtualScreenWidth();
    const displayRightEdge = display.bounds.x + display.bounds.width;
    // Solo se questo display è sul bordo destro dello schermo virtuale
    if (displayRightEdge < virtualWidth) {
      return;
    }
    // _NET_WM_STRUT_PARTIAL: left,right,top,bottom,l_sy,l_ey,r_sy,r_ey,t_sx,t_ex,b_sx,b_ex
    // 65535 come right_end_y: garantisce copertura full-height indipendentemente da scaling HiDPI
    const strut = `0, ${strutWidth}, 0, 0, 0, 0, 0, 65535, 0, 0, 0, 0`;
    const xidStr = String(xid);
    execFile(
      'xprop',
      ['-id', xidStr, '-f', '_NET_WM_STRUT_PARTIAL', '32c', '-set', '_NET_WM_STRUT_PARTIAL', strut],
      (err) => {
        if (err) {
          console.error('[strut] xprop strut error:', err.message);
        }
      },
    );
    // Rendi la finestra sticky su tutti i workspace so che lo strut si applichi ovunque
    execFile(
      'xprop',
      ['-id', xidStr, '-f', '_NET_WM_DESKTOP', '32c', '-set', '_NET_WM_DESKTOP', '0xffffffff'],
      (err) => {
        if (err) {
          console.error('[strut] xprop desktop error:', err.message);
        }
      },
    );
  } catch (err) {
    console.error('[strut] error:', err.message);
  }
}

let sidebarWindow = null;
let sidebarReady = false;
let sidebarManualOpen = false;
let stripWindows = new Map(); // displayId → BrowserWindow
let desktopCheckInterval = null;
let currentPaletteHex = '#334155';

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

// --- Sidebar (full panel, hidden by default) ---

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
  });
}

let activeStripDisplayId = null;

function showSidebarOnDisplay(display) {
  if (!sidebarWindow || sidebarWindow.isDestroyed()) {
    return;
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

  const displayId = String(display.id);
  const strip = stripWindows.get(displayId);
  if (strip && !strip.isDestroyed()) {
    strip.hide();
  }
  activeStripDisplayId = displayId;

  sidebarWindow.show();
}

function hideSidebar() {
  if (sidebarWindow && !sidebarWindow.isDestroyed()) {
    sidebarWindow.hide();
  }
  if (activeStripDisplayId) {
    const strip = stripWindows.get(activeStripDisplayId);
    if (strip && !strip.isDestroyed()) {
      strip.show();
    }
    activeStripDisplayId = null;
  }
}

function toggleSidebar() {
  if (!sidebarWindow || sidebarWindow.isDestroyed()) {
    return;
  }
  if (sidebarWindow.isVisible()) {
    sidebarManualOpen = false;
    hideSidebar();
  } else {
    sidebarManualOpen = true;
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    showSidebarOnDisplay(display);
  }
}

// --- Strips (one per display, always visible, same renderer as sidebar) ---

function createStrips() {
  destroyStrips();
  const displays = screen.getAllDisplays();

  for (const display of displays) {
    const { x: wx, y: wy } = display.workArea;
    const { width, height } = display.workAreaSize;
    const displayId = String(display.id);

    const stripWin = new BrowserWindow({
      width: STRIP_WIDTH,
      height: height,
      x: wx + width - STRIP_WIDTH,
      y: wy,
      show: false,
      frame: false,
      transparent: false,
      backgroundColor: currentPaletteHex,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    stripWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    stripWin.loadFile(path.join(__dirname, 'renderer', 'strip.html'));

    stripWin.webContents.once('did-finish-load', () => {
      stripWin.webContents.send('strip-color', currentPaletteHex);
      // Setta DOCK type + sticky desktop PRIMA di show() per GNOME Mutter
      if (process.platform === 'linux' && process.env.DISPLAY) {
        try {
          const xidStr = String(stripWin.getNativeWindowHandle().readUInt32LE(0));
          execFile(
            'xprop',
            [
              '-id',
              xidStr,
              '-f',
              '_NET_WM_WINDOW_TYPE',
              '32a',
              '-set',
              '_NET_WM_WINDOW_TYPE',
              '_NET_WM_WINDOW_TYPE_DOCK',
            ],
            () => {
              execFile(
                'xprop',
                [
                  '-id',
                  xidStr,
                  '-f',
                  '_NET_WM_DESKTOP',
                  '32c',
                  '-set',
                  '_NET_WM_DESKTOP',
                  '0xffffffff',
                ],
                () => {
                  stripWin.show();
                  setX11Strut(stripWin, display, STRIP_WIDTH);
                },
              );
            },
          );
        } catch {
          stripWin.show();
          setX11Strut(stripWin, display, STRIP_WIDTH);
        }
      } else {
        stripWin.show();
      }
    });

    stripWindows.set(displayId, stripWin);
  }
}

function destroyStrips() {
  for (const win of stripWindows.values()) {
    if (win && !win.isDestroyed()) {
      win.close();
    }
  }
  stripWindows = new Map();
}

function updateStripColor(hex) {
  currentPaletteHex = hex;
  for (const win of stripWindows.values()) {
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send('strip-color', hex);
    }
  }
}

// --- Desktop state check ---

function getDisplaysWithWindows(callback) {
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
  if (!sidebarWindow || sidebarWindow.isDestroyed() || !sidebarReady) {
    return;
  }

  getDisplaysWithWindows((occupiedDisplayIds) => {
    if (!occupiedDisplayIds) {
      return;
    }

    const displays = screen.getAllDisplays();
    const freeDisplay = displays.find((d) => !occupiedDisplayIds.has(String(d.id)));

    if (freeDisplay && !sidebarWindow.isVisible()) {
      showSidebarOnDisplay(freeDisplay);
    } else if (!freeDisplay && sidebarWindow.isVisible() && !sidebarManualOpen) {
      hideSidebar();
    }
  });
}

// --- Init ---

function initSidebar() {
  createSidebar();
  createStrips();

  checkDesktopState();
  desktopCheckInterval = setInterval(checkDesktopState, DESKTOP_CHECK_MS);

  screen.on('display-added', () => createStrips());
  screen.on('display-removed', () => createStrips());
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

    updateStripColor(palette.accent_hex);

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

  ipcMain.on('toggle-sidebar', () => {
    toggleSidebar();
  });

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
  destroyStrips();
  db.close();
  app.quit();
});
