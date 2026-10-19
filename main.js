'use strict';

// Load secrets before anything reads process.env. Primary source is the
// per-user env file the installed .deb expects; the .env in the working
// directory is a fallback for running from a source checkout in development.
// dotenv does not overwrite already-set variables, so the user file wins.
{
  const nodePath = require('node:path');
  const nodeOs = require('node:os');
  require('dotenv').config({
    path: nodePath.join(nodeOs.homedir(), '.config', 'deadlineaura', '.env'),
  });
  require('dotenv').config();
}

const { app, BrowserWindow, screen, ipcMain, nativeImage } = require('electron');
const { execFileSync, spawn } = require('child_process');
const { openExternalUrl } = require('./core/open-external');
const externalBrowserDependencies = {
  which: (bin) => execFileSync('which', [bin], { stdio: 'ignore' }),
  spawnDetached: spawn,
};
const path = require('path');
const os = require('os');
const { getDisplaysWithWindows } = require('./core/display-controller');
const { createStripWindows } = require('./main-process/strip-windows');
const { createMeetingDockWindows } = require('./main-process/meeting-dock-windows');
const deadlineEngine = require('./core/deadline-engine');
const colorMapper = require('./core/color-mapper');
const wallpaperChanger = require('./core/wallpaper-changer');
const db = require('./store/db');
const pinnedQueries = require('./store/pinned-queries');
const localQueries = require('./store/local-queries');
const favoriteQueries = require('./store/favorite-queries');
const burnoutDetector = require('./core/burnout-detector');
const gcal = require('./integrations/google-calendar');
const jira = require('./integrations/jira');
const notifier = require('./core/notifier');
const meetingFlyby = require('./core/meeting-flyby');
const { registerIpc } = require('./core/ipc/register-ipc');
const { createLocalTaskHandlers } = require('./core/ipc/local-task-handlers');
const { createCalendarHandlers } = require('./core/ipc/calendar-handlers');
const { createSettingsHandlers } = require('./core/ipc/settings-handlers');
const { createFlybyHandlers } = require('./core/ipc/flyby-handlers');
const { loadConfig, saveConfig } = require('./config/loader');
const { withPostitCodes } = require('./core/postit-renderer');
const { summarizeSync } = require('./core/sync-status');
const { runSyncCycle } = require('./core/sync-runner');
const { engineOptionsFromConfig, aiNotesFromCache } = require('./core/update-payload');
const { describeSourceStatus, collectSourceFacts } = require('./core/source-status');
const {
  onboardingMarkerPath,
  isFirstRun,
  markOnboardingDone,
  isWaylandSession,
} = require('./core/onboarding');
const { DEFAULTS } = require('./config/defaults');
const { configSchema } = require('./config/schema');
const { maskConfigForRenderer, restoreTokens } = require('./config/secret-masking');
const i18n = require('./i18n');
const { cleanupWorkShiftConfig } = require('./core/work-shift');
const { collectUsage } = require('./core/ai-usage');
const {
  sourceDir: captureSourceDir,
  binDir: captureBinDir,
  syncCaptureBin,
  runCaptureCommand,
} = require('./core/ai-usage-capture-bin');
let config = loadConfig();
i18n.setLanguage(config.language || 'it');

// Auto-cleanup past holidays and expired variable months at startup
const cleanedWorkShift = cleanupWorkShiftConfig(config.work_shift);
if (cleanedWorkShift.changed) {
  config.work_shift = cleanedWorkShift.workShift;
  saveConfig(config);
}

let settingsWindow = null;
let overlayWindow = null;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const UPDATE_INTERVAL_MS = 60000;
const DEFAULT_DATA_SYNC_MINUTES = 10;
const MEETING_DOCK_CHECK_MS = 30000;
const CLEANUP_INTERVAL_MS = ONE_DAY_MS;
const DESKTOP_CHECK_MS = 1000;
const APP_ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

let sidebarWindow = null;
let sidebarReady = false;
let sidebarManualOpen = false;
let sidebarManualClose = false;
const strips = createStripWindows({ BrowserWindow, screen });
const meetingDocks = createMeetingDockWindows({
  BrowserWindow,
  screen,
  getConfig: () => config,
  db,
  openExternalUrl,
  externalBrowserDependencies,
});
let desktopCheckInterval = null;
let isUpdateCycleRunning = false;
// Outcome of the last data sync, shown in the sidebar footer.
let lastSyncStatus = null;
let dataSyncTimer = null;
// True during the very first session, until the user dismisses the "this is the strip" hint.
let firstRunHintPending = false;
let dataSyncIntervalMinutes = null;

/**
 * (Re)starts the periodic data sync with the interval currently in the config.
 * Called at startup and after a settings save, so a new interval applies without a restart.
 */
function runSyncAndRefresh(options) {
  return runSyncCycle({
    summarize: summarizeSync,
    onStatus: (summary) => {
      lastSyncStatus = summary;
    },
    refresh: runUpdateCycle,
    log: console,
    ...options,
  });
}

function runManualSync() {
  return runSyncAndRefresh({
    tag: 'sync-now',
    failureLabel: 'Manual sync error:',
    sync: () => require('./core/sync-daemon').sync(config),
  });
}

function scheduleDataSync() {
  const minutes = config.sync.data_interval_minutes || DEFAULT_DATA_SYNC_MINUTES;
  if (dataSyncTimer && minutes === dataSyncIntervalMinutes) {
    return;
  }
  clearInterval(dataSyncTimer);
  dataSyncIntervalMinutes = minutes;
  const syncDaemonModule = require('./core/sync-daemon');
  dataSyncTimer = setInterval(
    () =>
      runSyncAndRefresh({
        tag: 'data-sync',
        failureLabel: '[data-sync] error:',
        sync: () => syncDaemonModule.sync(config),
        force: true,
      }),
    minutes * 60000,
  );
}

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
    if (firstRunHintPending) {
      // First launch only: show the sidebar once, so the user learns what the strip opens.
      sidebarManualOpen = true;
      sidebarManualClose = false;
      showSidebarOnDisplay(screen.getPrimaryDisplay());
      // Written only once the sidebar is on screen, so a crash before this point retries.
      try {
        markOnboardingDone(onboardingMarkerPath(os.homedir()));
      } catch (err) {
        console.warn('onboarding: could not write marker:', err.message);
      }
    }
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
  strips.hideStrip(displayId);
  activeStripDisplayId = displayId;

  sidebarWindow.show();
}

function hideSidebar() {
  if (sidebarWindow && !sidebarWindow.isDestroyed()) {
    sidebarWindow.hide();
  }
  if (activeStripDisplayId) {
    strips.showStrip(activeStripDisplayId);
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
  const initialResult = deadlineEngine.run(engineOptionsFromConfig(config));
  const initialPalette = colorMapper.mapScoreToColor(initialResult.global_score);
  strips.updateStripColor(initialPalette.accent_hex);

  createSidebar();
  strips.createStrips();
  meetingDocks.createMeetingDocks();

  checkDesktopState();
  desktopCheckInterval = setInterval(checkDesktopState, DESKTOP_CHECK_MS);

  screen.on('display-added', () => {
    strips.createStrips();
    meetingDocks.createMeetingDocks();
  });
  screen.on('display-removed', () => {
    strips.createStrips();
    meetingDocks.createMeetingDocks();
  });
}

/** Refresh the stable copy of the capture scripts; a failure never blocks the app. */
function syncCaptureBinSafely() {
  try {
    syncCaptureBin({
      source: captureSourceDir({
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        appDir: __dirname,
      }),
      dest: captureBinDir(os.homedir()),
    });
  } catch (err) {
    console.warn('[ai-usage-capture] sync failed:', err.message);
  }
}

async function runUpdateCycle({ force = false } = {}) {
  if (isUpdateCycleRunning) {
    return;
  }
  isUpdateCycleRunning = true;
  try {
    const engineResult = deadlineEngine.run(engineOptionsFromConfig(config));

    const palette = colorMapper.mapScoreToColor(engineResult.global_score);

    if (config.wallpaper.enabled) {
      const calendarEvents = db.getUpcomingCalendarEvents(ONE_DAY_MS);
      let usageRows = [];
      if (config.wallpaper.show_ai_usage) {
        try {
          usageRows = collectUsage({ nowMs: Date.now(), lang: i18n.getLanguage() });
        } catch (err) {
          console.warn('runUpdateCycle: failed to collect AI usage:', err.message);
        }
      }
      await wallpaperChanger.update(palette, {
        engineResult,
        force,
        electronScreen: screen,
        calendarEvents,
        usageRows,
      });
    }

    strips.updateStripColor(palette.accent_hex);
    meetingDocks.updateMeetingDocks();

    const allPinned = pinnedQueries.getAllPinned();
    const pinnedIds = new Set(allPinned.map((p) => p.task_id));
    const favoriteIds = favoriteQueries.getAllFavoriteIds();

    const aiResponse = db.getLatestAiCacheResponse();
    const { clinicalNote, stressForecast } = aiNotesFromCache(aiResponse);

    if (sidebarWindow && !sidebarWindow.isDestroyed() && sidebarReady) {
      sidebarWindow.webContents.send('update', {
        engineResult,
        palette,
        pinnedTaskIds: Array.from(pinnedIds),
        favoriteTaskIds: favoriteIds,
        clinicalNote,
        stressForecast,
        syncStatus: lastSyncStatus,
        googleCalendarReady: gcal.isGoogleCalendarReady(config),
        showFirstRunHint: firstRunHintPending,
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
    const pinned = withPostitCodes(pinnedQueries.getByDisplay(displayId));
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

  syncCaptureBinSafely();

  if (isFirstRun(onboardingMarkerPath(os.homedir()))) {
    firstRunHintPending = true;
  }
  if (isWaylandSession(process.env)) {
    notifier.sendSystemNotice(
      i18n.t('notifications.wayland_title'),
      i18n.t('notifications.wayland_body'),
    );
  }

  initSidebar();

  meetingFlyby.init();

  runUpdateCycle();
  setInterval(runUpdateCycle, UPDATE_INTERVAL_MS);
  setInterval(() => meetingDocks.updateMeetingDocks(), MEETING_DOCK_CHECK_MS);
  setInterval(() => meetingFlyby.checkAndLaunch({ config, db, screen }), MEETING_DOCK_CHECK_MS);
  setInterval(() => db.cleanupOldRecords(), CLEANUP_INTERVAL_MS);

  scheduleDataSync();

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

  ipcMain.on('sidebar:toggle', () => {
    toggleSidebar();
  });

  ipcMain.on('onboarding:dismiss-hint', () => {
    firstRunHintPending = false;
  });

  meetingDocks.registerIpc(ipcMain);

  ipcMain.on('sync:run', () => {
    runManualSync();
  });

  ipcMain.handle('google:authorize', async () => {
    const result = await gcal.authorizeGoogle(config);
    if (result.ok && !result.alreadyAuthorized) {
      // Fill the sidebar right away instead of waiting for the next scheduled sync.
      runManualSync();
    }
    return result;
  });

  ipcMain.on('shell:open-link', (_event, url) => {
    openExternalUrl(url, externalBrowserDependencies);
  });

  ipcMain.on('settings:open', () => {
    openSettingsWindow();
  });

  ipcMain.handle('i18n:get-translations', () => i18n.getTranslations());

  ipcMain.handle('score:get-breakdown', () => {
    try {
      const result = deadlineEngine.run(engineOptionsFromConfig(config));
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

  ipcMain.handle('ai-usage:capture-status', () =>
    runCaptureCommand('status', { home: os.homedir() }),
  );

  ipcMain.handle('ai-usage:capture-install', () => {
    syncCaptureBinSafely();
    return runCaptureCommand('install', { home: os.homedir() });
  });

  ipcMain.handle('ai-usage:capture-uninstall', () => {
    syncCaptureBinSafely();
    return runCaptureCommand('uninstall', { home: os.homedir() });
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

  registerIpc(ipcMain, {
    handle: {
      ...createLocalTaskHandlers({ localQueries, refresh: runUpdateCycle }),
      ...createCalendarHandlers({ gcal, getConfig: () => config, saveConfig }),
      ...createSettingsHandlers({
        getConfig: () => config,
        defaults: DEFAULTS,
        maskConfigForRenderer,
        restoreTokens,
        configSchema,
        describeSourceStatus,
        collectSourceFacts,
        gcal,
        jira,
        getLastSyncStatus: () => lastSyncStatus,
        applyConfig: (data) => {
          saveConfig(data);
          config = loadConfig();
          scheduleDataSync();
          if (sidebarWindow && !sidebarWindow.isDestroyed()) {
            sidebarWindow.webContents.send('config-changed', config);
          }
        },
      }),
      ...createFlybyHandlers({
        getConfig: () => config,
        applyConfig: (data) => {
          saveConfig(data);
          config = loadConfig();
          if (sidebarWindow && !sidebarWindow.isDestroyed()) {
            sidebarWindow.webContents.send('config-changed', config);
          }
        },
      }),
    },
  });

  const syncDaemon = require('./core/sync-daemon');
  runSyncAndRefresh({
    tag: 'startup-sync',
    failureLabel: '[startup-sync] failed:',
    sync: () =>
      syncDaemon.sync(config).then((syncResult) => {
        console.log(`[startup-sync] complete: gcal=${syncResult.gcal}, jira=${syncResult.jira}`);
        return syncResult;
      }),
    force: true,
  });
});

app.on('window-all-closed', () => {
  clearInterval(desktopCheckInterval);
  clearInterval(dataSyncTimer);
  meetingFlyby.destroyAll();
  strips.destroyStrips();
  db.close();
  app.quit();
});
