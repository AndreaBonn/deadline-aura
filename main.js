'use strict';

require('dotenv').config();

const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const { setX11Strut, getDisplaysWithWindows } = require('./core/display-controller');
const deadlineEngine = require('./core/deadline-engine');
const colorMapper = require('./core/color-mapper');
const wallpaperChanger = require('./core/wallpaper-changer');
const db = require('./store/db');
const pinnedQueries = require('./store/pinned-queries');
const localQueries = require('./store/local-queries');
const favoriteQueries = require('./store/favorite-queries');
const burnoutDetector = require('./core/burnout-detector');
const gcal = require('./integrations/google-calendar');
const notifier = require('./core/notifier');
const { loadConfig, saveConfig } = require('./config/loader');
const { DEFAULTS } = require('./config/defaults');
const { configSchema } = require('./config/schema');
const i18n = require('./i18n');
let config = loadConfig();
i18n.setLanguage(config.language || 'it');

let settingsWindow = null;
let overlayWindow = null;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const UPDATE_INTERVAL_MS = 60000;
const CLEANUP_INTERVAL_MS = ONE_DAY_MS;
const STRIP_WIDTH = 20;
const DESKTOP_CHECK_MS = 1000;

let sidebarWindow = null;
let sidebarReady = false;
let sidebarManualOpen = false;
let stripWindows = new Map(); // displayId → BrowserWindow
let desktopCheckInterval = null;
let currentPaletteHex = '#334155';
let isUpdateCycleRunning = false;

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
      // Set DOCK type + sticky desktop BEFORE show() — required by GNOME Mutter
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
                  setX11Strut(stripWin, display, STRIP_WIDTH, screen);
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

function checkDesktopState() {
  if (!sidebarWindow || sidebarWindow.isDestroyed() || !sidebarReady) {
    return;
  }

  // Auto-show only when multiple displays are connected (one free = sidebar target)
  const displays = screen.getAllDisplays();
  if (displays.length < 2) {
    return;
  }

  getDisplaysWithWindows(screen, (occupiedDisplayIds) => {
    if (!occupiedDisplayIds) {
      return;
    }

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
  // Compute initial color before creating strips so they start with the correct palette
  const initialResult = deadlineEngine.run({
    lookaheadHours: config.sync.lookahead_hours,
    k: config.engine.k_constant,
    priorityWeights: config.engine.priority_weights,
  });
  const initialPalette = colorMapper.mapScoreToColor(initialResult.global_score);
  currentPaletteHex = initialPalette.accent_hex;

  createSidebar();
  createStrips();

  checkDesktopState();
  desktopCheckInterval = setInterval(checkDesktopState, DESKTOP_CHECK_MS);

  screen.on('display-added', () => createStrips());
  screen.on('display-removed', () => createStrips());
}

async function runUpdateCycle({ force = false } = {}) {
  if (isUpdateCycleRunning) {
    return;
  }
  isUpdateCycleRunning = true;
  try {
    const engineResult = deadlineEngine.run({
      lookaheadHours: config.sync.lookahead_hours,
      k: config.engine.k_constant,
      priorityWeights: config.engine.priority_weights,
    });

    const palette = colorMapper.mapScoreToColor(engineResult.global_score);

    if (config.wallpaper.enabled) {
      const calendarEvents = db.getUpcomingCalendarEvents(ONE_DAY_MS);
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
    const favoriteIds = favoriteQueries.getAllFavoriteIds();

    const aiResponse = db.getLatestAiCacheResponse();
    const clinicalNote = aiResponse?.clinical_note || null;
    const stressForecast = aiResponse?.daily_breakdown || [];

    if (sidebarWindow && !sidebarWindow.isDestroyed() && sidebarReady) {
      sidebarWindow.webContents.send('update', {
        engineResult,
        palette,
        pinnedTaskIds: Array.from(pinnedIds),
        favoriteTaskIds: favoriteIds,
        clinicalNote,
        stressForecast,
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
  } finally {
    isUpdateCycleRunning = false;
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

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.whenReady().then(() => {
  initSidebar();

  runUpdateCycle();
  setInterval(runUpdateCycle, UPDATE_INTERVAL_MS);
  setInterval(() => db.cleanupOldRecords(), CLEANUP_INTERVAL_MS);

  const burnoutIntervalMs = (config.burnout?.check_interval_hours || 2) * 3600000;
  setInterval(() => {
    if (!config.burnout?.enabled) {
      return;
    }
    const aiCacheHistory = db.getAiCacheHistory(7);
    const warning = burnoutDetector.detectBurnoutRisk(aiCacheHistory, {
      stress_threshold: config.burnout?.stress_threshold,
      consecutive_days: config.burnout?.consecutive_days,
    });
    if (warning.isAtRisk) {
      notifier.sendBurnoutWarning(warning, config);
    }
  }, burnoutIntervalMs);

  ipcMain.on('toggle-sidebar', () => {
    toggleSidebar();
  });

  ipcMain.on('sync-now', async () => {
    try {
      const syncDaemon = require('./core/sync-daemon');
      const syncResult = await syncDaemon.sync(config);
      if (syncResult.errors && syncResult.errors.length > 0) {
        console.error('[sync-now] errors:', JSON.stringify(syncResult.errors));
      }
      runUpdateCycle();
    } catch (err) {
      console.error('Manual sync error:', err.message);
    }
  });

  ipcMain.on('open-link', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      const { spawn, execFileSync } = require('child_process');
      const browsers = ['firefox', 'google-chrome', 'chromium-browser', 'chromium'];
      let opened = false;
      for (const bin of browsers) {
        try {
          execFileSync('which', [bin], { stdio: 'ignore' });
          spawn(bin, [url], { detached: true, stdio: 'ignore' }).unref();
          opened = true;
          break;
        } catch {
          /* not found, try next */
        }
      }
      if (!opened) {
        spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
      }
    }
  });

  ipcMain.on('open-config', () => {
    openSettingsWindow();
  });

  ipcMain.handle('i18n:get-translations', () => i18n.getTranslations());

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

  ipcMain.on('favorite-task', (_event, taskId) => {
    favoriteQueries.favoriteTask(taskId);
    runUpdateCycle({ force: true });
  });

  ipcMain.on('unfavorite-task', (_event, taskId) => {
    favoriteQueries.unfavoriteTask(taskId);
    runUpdateCycle({ force: true });
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

  ipcMain.handle('local-task:create', (_event, { title, dueAt, priority }) => {
    if (!title || typeof title !== 'string' || !title.trim()) {
      return { ok: false, error: 'INVALID_TITLE' };
    }
    const p = priority !== undefined ? Number(priority) : 3;
    if (!Number.isInteger(p) || p < 1 || p > 4) {
      return { ok: false, error: 'INVALID_PRIORITY' };
    }
    const id = localQueries.createLocalTask({ title: title.trim(), dueAt, priority: p });
    runUpdateCycle({ force: true });
    return { ok: true, id };
  });

  ipcMain.handle('local-task:update', (_event, { id, title, dueAt, priority }) => {
    if (!id || typeof id !== 'string') {
      return { ok: false, error: 'INVALID_ID' };
    }
    if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
      return { ok: false, error: 'INVALID_TITLE' };
    }
    if (priority !== undefined) {
      const p = Number(priority);
      if (!Number.isInteger(p) || p < 1 || p > 4) {
        return { ok: false, error: 'INVALID_PRIORITY' };
      }
    }
    localQueries.updateLocalTask({
      id,
      title: title !== undefined ? title.trim() : undefined,
      dueAt,
      priority,
    });
    runUpdateCycle({ force: true });
    return { ok: true };
  });

  ipcMain.handle('local-task:delete', (_event, taskId) => {
    if (!taskId || typeof taskId !== 'string') {
      return { ok: false, error: 'INVALID_ID' };
    }
    localQueries.deleteLocalTask(taskId);
    runUpdateCycle({ force: true });
    return { ok: true };
  });

  ipcMain.handle('local-task:complete', (_event, taskId) => {
    if (!taskId || typeof taskId !== 'string') {
      return { ok: false, error: 'INVALID_ID' };
    }
    localQueries.completeLocalTask(taskId);
    runUpdateCycle({ force: true });
    return { ok: true };
  });

  ipcMain.handle('calendar:list', async () => {
    try {
      const calendars = await gcal.listCalendars(config);
      return { ok: true, calendars };
    } catch (err) {
      console.error('calendar:list error:', err.message);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('calendar:get-default', () => {
    return { ok: true, calendarId: config.sources.google_calendar.default_log_calendar || '' };
  });

  ipcMain.handle('calendar:set-default', (_event, calendarId) => {
    if (!calendarId || typeof calendarId !== 'string') {
      return { ok: false, error: 'INVALID_CALENDAR_ID' };
    }
    config.sources.google_calendar.default_log_calendar = calendarId;
    saveConfig(config);
    return { ok: true };
  });

  ipcMain.handle(
    'calendar:log-time',
    async (_event, { summary, startTime, durationMinutes, calendarId }) => {
      if (!summary || typeof summary !== 'string') {
        return { ok: false, error: 'INVALID_SUMMARY' };
      }
      if (!startTime || typeof durationMinutes !== 'number' || durationMinutes < 1) {
        return { ok: false, error: 'INVALID_TIME' };
      }
      const targetCalendar = calendarId || config.sources.google_calendar.default_log_calendar;
      if (!targetCalendar) {
        return { ok: false, error: 'NO_CALENDAR_SELECTED' };
      }
      try {
        const result = await gcal.createEvent(config, {
          calendarId: targetCalendar,
          summary,
          startTime,
          durationMinutes,
        });
        return { ok: true, eventId: result.id, htmlLink: result.htmlLink };
      } catch (err) {
        console.error('calendar:log-time error:', err.message);
        return { ok: false, error: err.message };
      }
    },
  );
});

app.on('window-all-closed', () => {
  clearInterval(desktopCheckInterval);
  destroyStrips();
  db.close();
  app.quit();
});
