'use strict';

require('dotenv').config();

const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const deadlineEngine = require('./core/deadline-engine');
const colorMapper = require('./core/color-mapper');
const wallpaperChanger = require('./core/wallpaper-changer');
const db = require('./store/db');
const { DEFAULTS } = require('./config/defaults');

const UPDATE_INTERVAL_MS = 60000;
const CLEANUP_INTERVAL_MS = 24 * 3600000;
const STRIP_WIDTH = 6;
const AUTOHIDE_DELAY_MS = 500;
const MOUSE_POLL_MS = 100;
const DESKTOP_CHECK_MS = 1000;

let docks = []; // { sidebar, strip, hideTimeout, pollInterval, palette, desktopPinned }
let currentPalette = null;
let isDesktopActive = false;
let desktopCheckInterval = null;

function getOwnWindowIds() {
  const ids = new Set();
  for (const dock of docks) {
    if (!dock.sidebar.isDestroyed()) {
      const buf = dock.sidebar.getNativeWindowHandle();
      ids.add(buf.readUInt32LE(0));
    }
    if (!dock.strip.isDestroyed()) {
      const buf = dock.strip.getNativeWindowHandle();
      ids.add(buf.readUInt32LE(0));
    }
  }
  return ids;
}

function checkDesktopState() {
  execFile('xprop', ['-root', '_NET_ACTIVE_WINDOW'], (err, stdout) => {
    if (err) {
      return;
    }
    const match = stdout.match(/#\s*(0x[\da-f]+)/i);
    if (!match || match[1] === '0x0') {
      setDesktopActive(true);
      return;
    }

    const activeHex = match[1];
    const activeId = parseInt(activeHex, 16);
    const ownIds = getOwnWindowIds();
    if (ownIds.has(activeId)) {
      return;
    }

    execFile('xprop', ['-id', activeHex, '_NET_WM_WINDOW_TYPE'], (err2, stdout2) => {
      if (err2) {
        return;
      }
      if (stdout2.includes('_NET_WM_WINDOW_TYPE_DESKTOP')) {
        setDesktopActive(true);
      } else {
        setDesktopActive(false);
      }
    });
  });
}

function setDesktopActive(active) {
  if (isDesktopActive === active) {
    return;
  }
  isDesktopActive = active;

  for (const dock of docks) {
    if (active) {
      dock.desktopPinned = true;
      openDock(dock);
    } else {
      dock.desktopPinned = false;
      closeDock(dock);
    }
  }
}

function buildStripHTML(accentColor) {
  return `<html><body style="margin:0;background:${accentColor};cursor:default;"></body></html>`;
}

function createDockForDisplay(display) {
  const { width, height } = display.workAreaSize;
  const { x: wx, y: wy } = display.workArea;
  const sidebarWidth = DEFAULTS.sidebar.width;
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
  };

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
        // Mouse still inside — cancel any pending hide
        if (dock.hideTimeout) {
          clearTimeout(dock.hideTimeout);
          dock.hideTimeout = null;
        }
      } else if (!dock.hideTimeout) {
        // Mouse left — schedule hide
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

function runUpdateCycle() {
  try {
    const engineResult = deadlineEngine.run({
      lookaheadHours: DEFAULTS.sync.lookahead_hours,
      k: DEFAULTS.engine.k_constant,
      priorityWeights: DEFAULTS.engine.priority_weights,
    });

    const palette = colorMapper.mapScoreToColor(engineResult.global_score);
    currentPalette = palette;

    if (DEFAULTS.wallpaper.enabled) {
      wallpaperChanger.update(palette, { engineResult });
    }

    updateStripColor(palette);

    for (const dock of docks) {
      if (dock.sidebar && !dock.sidebar.isDestroyed()) {
        dock.sidebar.webContents.send('update', { engineResult, palette });
      }
    }

    return { engineResult, palette };
  } catch (err) {
    console.error('Update cycle error:', err.message);
    return null;
  }
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
  clearInterval(desktopCheckInterval);
  db.close();
  app.quit();
});
