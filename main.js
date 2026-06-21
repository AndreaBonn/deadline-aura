'use strict';

require('dotenv').config();

const { app, BrowserWindow, screen, ipcMain, nativeImage } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const {
  setX11Strut,
  getDisplaysWithWindows,
  getVirtualScreenWidth,
} = require('./core/display-controller');
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
const meetingFlyby = require('./core/meeting-flyby');
const { loadConfig, saveConfig } = require('./config/loader');
const { buildMeetUrlWithAccount: buildMeetUrl } = require('./core/meet-url-builder');
const { DEFAULTS } = require('./config/defaults');
const { configSchema } = require('./config/schema');
const i18n = require('./i18n');
const { cleanupPastHolidays, cleanupExpiredMonths } = require('./core/work-shift');
let config = loadConfig();
i18n.setLanguage(config.language || 'it');

// Auto-cleanup past holidays and expired variable months at startup
if (config.work_shift) {
  let changed = false;
  if (config.work_shift.regular?.holidays?.length) {
    const cleaned = cleanupPastHolidays(config.work_shift.regular.holidays);
    if (cleaned.length !== config.work_shift.regular.holidays.length) {
      config.work_shift.regular.holidays = cleaned;
      changed = true;
    }
  }
  if (config.work_shift.variable?.months && Object.keys(config.work_shift.variable.months).length) {
    const cleaned = cleanupExpiredMonths(config.work_shift.variable.months);
    if (Object.keys(cleaned).length !== Object.keys(config.work_shift.variable.months).length) {
      config.work_shift.variable.months = cleaned;
      changed = true;
    }
  }
  if (changed) {
    saveConfig(config);
  }
}

let settingsWindow = null;
let overlayWindow = null;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const UPDATE_INTERVAL_MS = 60000;
const MEETING_DOCK_CHECK_MS = 30000;
const CLEANUP_INTERVAL_MS = ONE_DAY_MS;
const STRIP_WIDTH = 10;
const DESKTOP_CHECK_MS = 1000;
const TOKEN_MASK = '••••••••';
const APP_ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

function maskConfigForRenderer(cfg) {
  const masked = JSON.parse(JSON.stringify(cfg));
  const instances = masked.sources?.jira?.instances;
  if (Array.isArray(instances)) {
    for (const inst of instances) {
      if (inst.api_token) {
        inst.api_token = TOKEN_MASK;
      }
    }
  }
  return masked;
}

function restoreTokens(newConfig, originalConfig) {
  const newInstances = newConfig.sources?.jira?.instances;
  const origInstances = originalConfig.sources?.jira?.instances;
  if (!Array.isArray(newInstances) || !Array.isArray(origInstances)) {
    return;
  }
  for (let i = 0; i < newInstances.length; i++) {
    if (newInstances[i].api_token === TOKEN_MASK && origInstances[i]?.api_token) {
      newInstances[i].api_token = origInstances[i].api_token;
    }
  }
}

let sidebarWindow = null;
let sidebarReady = false;
let sidebarManualOpen = false;
let sidebarManualClose = false;
let stripWindows = new Map(); // displayId → BrowserWindow
let meetingDockWindows = new Map(); // displayId → BrowserWindow
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
    icon: APP_ICON_PATH,
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
    sidebarManualClose = true;
    hideSidebar();
  } else {
    sidebarManualOpen = true;
    sidebarManualClose = false;
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    showSidebarOnDisplay(display);
  }
}

// --- Strips (one per display, always visible, same renderer as sidebar) ---

function createStrips() {
  destroyStrips();
  const displays = screen.getAllDisplays();
  const virtualWidth = getVirtualScreenWidth(screen);

  for (const display of displays) {
    const { x: bx, width: bw } = display.bounds;
    const { y: wy } = display.workArea;
    const { height } = display.workAreaSize;
    const displayId = String(display.id);
    const isRightmost = bx + bw >= virtualWidth;

    const stripWin = new BrowserWindow({
      width: STRIP_WIDTH,
      height: height,
      x: bx + bw - STRIP_WIDTH,
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

    // Only the rightmost-display strip needs to be sticky across workspaces
    // (it carries the strut). On secondary displays, sticky + DOCK causes
    // GNOME/Mutter to pin the window to the primary monitor.
    if (isRightmost) {
      stripWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    }
    stripWin.loadFile(path.join(__dirname, 'renderer', 'strip.html'));

    stripWin.webContents.once('did-finish-load', () => {
      stripWin.webContents.send('strip-color', currentPaletteHex);
      // DOCK + sticky desktop only on the rightmost display (where the strut is applied).
      // Applying them to secondary displays causes Mutter to relocate the window to primary.
      if (process.platform === 'linux' && process.env.DISPLAY && isRightmost) {
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
          setX11Strut(stripWin, display, STRIP_WIDTH, screen);
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

// --- Meeting Dock (one per display, bottom edge) ---

const MEETING_DOCK_HEIGHT = 52;

function createMeetingDocks() {
  destroyMeetingDocks();
  if (!config.meeting_dock?.enabled) {
    return;
  }

  const displays = screen.getAllDisplays();
  for (const display of displays) {
    const { x: wx, y: wy } = display.workArea;
    const { width, height } = display.workAreaSize;
    const displayId = String(display.id);

    const dockWin = new BrowserWindow({
      width: width,
      height: MEETING_DOCK_HEIGHT,
      x: wx,
      y: wy + height - MEETING_DOCK_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload-meeting-dock.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    dockWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    dockWin.loadFile(path.join(__dirname, 'renderer', 'meeting-dock.html'));

    dockWin.webContents.once('did-finish-load', () => {
      if (process.platform === 'linux' && process.env.DISPLAY) {
        try {
          const xidStr = String(dockWin.getNativeWindowHandle().readUInt32LE(0));
          // Sticky on all desktops — no DOCK type to preserve transparency
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
              // No strut reservation — dock overlaps, hidden when empty
            },
          );
        } catch {
          // xprop not available — proceed without sticky desktop
        }
      }
    });

    // Click-through on transparent areas, forward mouse events to renderer.
    // On Linux (X11), forward option does not reliably deliver mouse events
    // to the renderer, so mouseenter never fires and clicks pass through.
    // Disable click-through on Linux to keep the dock interactive.
    if (process.platform !== 'linux') {
      dockWin.setIgnoreMouseEvents(true, { forward: true });
    }

    meetingDockWindows.set(displayId, dockWin);
  }
}

function destroyMeetingDocks() {
  for (const win of meetingDockWindows.values()) {
    if (win && !win.isDestroyed()) {
      win.close();
    }
  }
  meetingDockWindows = new Map();
}

function updateMeetingDocks() {
  if (!config.meeting_dock?.enabled) {
    return;
  }

  const lookaheadMin = config.meeting_dock?.lookahead_minutes || 10;
  const meetings = db.getUpcomingMeetings(lookaheadMin, -5);

  for (const win of meetingDockWindows.values()) {
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send('meetings-update', meetings);
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

    if (freeDisplay && !sidebarWindow.isVisible() && !sidebarManualClose) {
      showSidebarOnDisplay(freeDisplay);
    } else if (!freeDisplay && sidebarWindow.isVisible() && !sidebarManualOpen) {
      hideSidebar();
    } else if (!freeDisplay) {
      sidebarManualClose = false;
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
  createMeetingDocks();

  checkDesktopState();
  desktopCheckInterval = setInterval(checkDesktopState, DESKTOP_CHECK_MS);

  screen.on('display-added', () => {
    createStrips();
    createMeetingDocks();
  });
  screen.on('display-removed', () => {
    createStrips();
    createMeetingDocks();
  });
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
    updateMeetingDocks();

    const allPinned = pinnedQueries.getAllPinned();
    const pinnedIds = new Set(allPinned.map((p) => p.task_id));
    const favoriteIds = favoriteQueries.getAllFavoriteIds();

    const aiResponse = db.getLatestAiCacheResponse();
    const clinicalNote = aiResponse?.note || aiResponse?.clinical_note || null;
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
  if (nativeImage.createFromPath(APP_ICON_PATH).isEmpty()) {
    console.warn(
      `[icon] App icon missing or unreadable at ${APP_ICON_PATH} - dock will show the generic icon. ` +
        'Place a PNG (1024x1024 recommended) there.',
    );
  }

  initSidebar();

  meetingFlyby.init();

  runUpdateCycle();
  setInterval(runUpdateCycle, UPDATE_INTERVAL_MS);
  setInterval(updateMeetingDocks, MEETING_DOCK_CHECK_MS);
  setInterval(() => meetingFlyby.checkAndLaunch({ config, db, screen }), MEETING_DOCK_CHECK_MS);
  setInterval(() => db.cleanupOldRecords(), CLEANUP_INTERVAL_MS);

  const syncDaemonModule = require('./core/sync-daemon');
  const dataSyncIntervalMs = (config.sync.data_interval_minutes || 10) * 60000;
  setInterval(async () => {
    try {
      await syncDaemonModule.sync(config);
      runUpdateCycle({ force: true });
    } catch (err) {
      console.error('[data-sync] error:', err.message);
    }
  }, dataSyncIntervalMs);

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

  function isSafeExternalUrl(url) {
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        return false;
      }
      if (parsed.username || parsed.password) {
        return false;
      }
      const host = parsed.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
        return false;
      }
      if (host.startsWith('10.') || host.startsWith('192.168.')) {
        return false;
      }
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  ipcMain.on('sidebar:toggle', () => {
    toggleSidebar();
  });

  ipcMain.on('meeting-dock:open-link', (_event, url) => {
    if (typeof url === 'string' && isSafeExternalUrl(url)) {
      const googleAccount = config.sources?.google_calendar?.google_account;
      const finalUrl = buildMeetUrl(url, googleAccount);
      const { spawn, execFileSync } = require('child_process');
      const browsers = ['firefox', 'google-chrome', 'chromium-browser', 'chromium'];
      let opened = false;
      for (const bin of browsers) {
        try {
          execFileSync('which', [bin], { stdio: 'ignore' });
          spawn(bin, [finalUrl], { detached: true, stdio: 'ignore' }).unref();
          opened = true;
          break;
        } catch {
          /* not found, try next */
        }
      }
      if (!opened) {
        spawn('xdg-open', [finalUrl], { detached: true, stdio: 'ignore' }).unref();
      }
    }
  });

  ipcMain.on('meeting-dock:set-ignore-mouse', (_event, ignore) => {
    // On Linux, click-through with forwarding is disabled (see createMeetingDocks),
    // so toggling ignore mouse events is unnecessary.
    if (process.platform === 'linux') {
      return;
    }
    const senderWin = BrowserWindow.fromWebContents(_event.sender);
    if (senderWin && !senderWin.isDestroyed()) {
      if (ignore) {
        senderWin.setIgnoreMouseEvents(true, { forward: true });
      } else {
        senderWin.setIgnoreMouseEvents(false);
      }
    }
  });

  ipcMain.on('meeting-dock:set-visible', (_event, visible) => {
    for (const win of meetingDockWindows.values()) {
      if (win && !win.isDestroyed()) {
        if (visible && !win.isVisible()) {
          win.showInactive();
        } else if (!visible && win.isVisible()) {
          win.hide();
        }
      }
    }
  });

  ipcMain.on('sync:run', async () => {
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

  ipcMain.on('shell:open-link', (_event, url) => {
    if (typeof url === 'string' && isSafeExternalUrl(url)) {
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

  ipcMain.on('settings:open', () => {
    openSettingsWindow();
  });

  ipcMain.handle('i18n:get-translations', () => i18n.getTranslations());

  ipcMain.handle('score:get-breakdown', () => {
    try {
      const result = deadlineEngine.run({
        lookaheadHours: config.sync.lookahead_hours,
        k: config.engine.k_constant,
        priorityWeights: config.engine.priority_weights,
      });
      const aiResponse = db.getLatestAiCacheResponse();
      return {
        breakdown: result.breakdown,
        ai_daily_breakdown: aiResponse?.daily_breakdown || null,
      };
    } catch (err) {
      console.error('[score:get-breakdown] error:', err.message);
      return null;
    }
  });

  ipcMain.handle('config:get-work-shift', () => config.work_shift || null);
  ipcMain.handle('settings:get-config', () => maskConfigForRenderer(config));
  ipcMain.handle('settings:get-defaults', () => DEFAULTS);
  ipcMain.handle('settings:save-config', (_event, newConfig) => {
    restoreTokens(newConfig, config);
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

  ipcMain.on('task:favorite', (_event, taskId) => {
    favoriteQueries.favoriteTask(taskId);
    runUpdateCycle({ force: true });
  });

  ipcMain.on('task:unfavorite', (_event, taskId) => {
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

  ipcMain.on('overlay-unpin-tasks', (_event, taskIds) => {
    for (const taskId of taskIds) {
      pinnedQueries.unpinTaskFromAll(taskId);
    }
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

  ipcMain.handle('calendar:update-event', async (_event, { calendarId, eventId, endTime }) => {
    if (!calendarId || typeof calendarId !== 'string') {
      return { ok: false, error: 'INVALID_CALENDAR_ID' };
    }
    if (!eventId || typeof eventId !== 'string') {
      return { ok: false, error: 'INVALID_EVENT_ID' };
    }
    if (!endTime) {
      return { ok: false, error: 'INVALID_END_TIME' };
    }
    try {
      const result = await gcal.updateEvent(config, {
        calendarId,
        eventId,
        endTime,
      });
      return { ok: true, eventId: result.id, htmlLink: result.htmlLink };
    } catch (err) {
      console.error('calendar:update-event error:', err.message);
      return { ok: false, error: err.message };
    }
  });

  const syncDaemon = require('./core/sync-daemon');
  syncDaemon
    .sync(config)
    .then((syncResult) => {
      console.log(`[startup-sync] complete: gcal=${syncResult.gcal}, jira=${syncResult.jira}`);
      if (syncResult.errors && syncResult.errors.length > 0) {
        console.error('[startup-sync] errors:', JSON.stringify(syncResult.errors));
      }
      runUpdateCycle({ force: true });
    })
    .catch((err) => {
      console.error('[startup-sync] failed:', err.message);
    });
});

app.on('window-all-closed', () => {
  clearInterval(desktopCheckInterval);
  meetingFlyby.destroyAll();
  destroyStrips();
  db.close();
  app.quit();
});
