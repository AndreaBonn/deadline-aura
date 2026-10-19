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
const { createSidebarWindow } = require('./main-process/sidebar-window');
const { createSettingsWindow } = require('./main-process/settings-window');
const { createOverlayWindow } = require('./main-process/overlay-window');
const deadlineEngine = require('./core/deadline-engine');
const colorMapper = require('./core/color-mapper');
const wallpaperChanger = require('./core/wallpaper-changer');
const db = require('./store/db');
const pinnedQueries = require('./store/pinned-queries');
const localQueries = require('./store/local-queries');
const favoriteQueries = require('./store/favorite-queries');
const burnoutDetector = require('./core/burnout-detector');
const googleAuth = require('./integrations/google-auth');
const gcal = require('./integrations/google-calendar');
const calendarApi = {
  ...gcal,
  resolveGoogleOAuth: googleAuth.resolveGoogleOAuth,
  isGoogleCalendarReady: googleAuth.isGoogleCalendarReady,
  authorizeGoogle: googleAuth.authorizeGoogle,
};
const jira = require('./integrations/jira');
const notifier = require('./core/notifier');
const meetingFlyby = require('./core/meeting-flyby');
const { registerIpc } = require('./core/ipc/register-ipc');
const { createAppIpcGroups } = require('./main-process/app-ipc');
const { createConfigApplier } = require('./core/ipc/config-applier');
const { loadConfig, saveConfig } = require('./config/loader');
const { withPostitCodes } = require('./core/postit-renderer');
const { summarizeSync } = require('./core/sync-status');
const { runSyncCycle } = require('./core/sync-runner');
const { createDataSync } = require('./core/data-sync');
const { createUpdateCycle } = require('./core/update-cycle');
const { createFirstRunHint } = require('./core/first-run-hint');
const { createBurnoutCheck, burnoutIntervalMs } = require('./core/burnout-check');
const { engineOptionsFromConfig } = require('./core/update-payload');
const {
  onboardingMarkerPath,
  isFirstRun,
  markOnboardingDone,
  isWaylandSession,
} = require('./core/onboarding');
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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const UPDATE_INTERVAL_MS = 60000;
const MEETING_DOCK_CHECK_MS = 30000;
const CLEANUP_INTERVAL_MS = ONE_DAY_MS;
const DESKTOP_CHECK_MS = 1000;
const APP_ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

const getConfig = () => config;
const strips = createStripWindows({ BrowserWindow, screen });
const meetingDocks = createMeetingDockWindows({
  BrowserWindow,
  screen,
  getConfig,
  db,
  openExternalUrl,
  externalBrowserDependencies,
});
// Shown during the very first session, until the user dismisses the "this is the strip" hint.
const firstRunHint = createFirstRunHint({
  markerPath: onboardingMarkerPath(os.homedir()),
  isFirstRun,
  markDone: markOnboardingDone,
  log: console,
});
const sidebar = createSidebarWindow({
  BrowserWindow,
  screen,
  strips,
  getConfig,
  getDisplaysWithWindows,
  refresh: (options) => runUpdateCycle(options),
  isFirstRunHintPending: firstRunHint.isPending,
  onFirstRunShown: firstRunHint.markShown,
});
const settings = createSettingsWindow({ BrowserWindow, iconPath: APP_ICON_PATH });
const overlay = createOverlayWindow({
  BrowserWindow,
  screen,
  wallpaperChanger,
  pinnedQueries,
  withPostitCodes,
  refresh: (options) => runUpdateCycle(options),
});
const dataSync = createDataSync({
  getConfig,
  getSyncDaemon: () => require('./core/sync-daemon'),
  runSyncCycle,
  summarize: summarizeSync,
  refresh: (...args) => runUpdateCycle(...args),
  log: console,
});
const runUpdateCycle = createUpdateCycle({
  getConfig,
  runEngine: (current) => deadlineEngine.run(engineOptionsFromConfig(current)),
  mapScoreToColor: colorMapper.mapScoreToColor,
  wallpaperChanger,
  db,
  pinnedQueries,
  favoriteQueries,
  collectUsage,
  getLanguage: i18n.getLanguage,
  isGoogleCalendarReady: googleAuth.isGoogleCalendarReady,
  screen,
  strips,
  meetingDocks,
  sidebar,
  getSyncStatus: dataSync.getLastStatus,
  isFirstRunHintPending: firstRunHint.isPending,
  now: Date.now,
  log: console,
});
let desktopCheckInterval = null;

function initSidebar() {
  // Compute initial color before creating strips so they start with the correct palette
  const initialResult = deadlineEngine.run(engineOptionsFromConfig(config));
  const initialPalette = colorMapper.mapScoreToColor(initialResult.global_score);
  strips.updateStripColor(initialPalette.accent_hex);

  sidebar.create();
  strips.createStrips();
  meetingDocks.createMeetingDocks();

  sidebar.checkDesktopState();
  desktopCheckInterval = setInterval(() => sidebar.checkDesktopState(), DESKTOP_CHECK_MS);

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

function startPeriodicJobs() {
  setInterval(runUpdateCycle, UPDATE_INTERVAL_MS);
  setInterval(() => meetingDocks.updateMeetingDocks(), MEETING_DOCK_CHECK_MS);
  setInterval(() => meetingFlyby.checkAndLaunch({ config, db, screen }), MEETING_DOCK_CHECK_MS);
  setInterval(() => db.cleanupOldRecords(), CLEANUP_INTERVAL_MS);
  dataSync.scheduleDataSync();
  const checkBurnout = createBurnoutCheck({ getConfig, db, burnoutDetector, notifier });
  setInterval(checkBurnout, burnoutIntervalMs(config));
}

function appIpcDependencies(applier) {
  return {
    sidebar,
    settings,
    getConfig,
    deadlineEngine,
    db,
    i18n,
    firstRunHint,
    log: console,
    gcal: calendarApi,
    jira,
    runManualSync: dataSync.runManualSync,
    openLink: (url) => openExternalUrl(url, externalBrowserDependencies),
    runCaptureCommand,
    syncCaptureBin: syncCaptureBinSafely,
    homedir: os.homedir,
    favoriteQueries,
    localQueries,
    refresh: runUpdateCycle,
    saveConfig,
    getLastSyncStatus: dataSync.getLastStatus,
    applySettings: applier.applySettings,
    applyFlyby: applier.applyFlyby,
  };
}

function registerAppIpc() {
  const applier = createConfigApplier({
    saveConfig,
    loadConfig,
    setConfig: (next) => {
      config = next;
    },
    scheduleDataSync: dataSync.scheduleDataSync,
    notifySidebar: (next) => sidebar.send('config-changed', next),
  });
  meetingDocks.registerIpc(ipcMain);
  overlay.registerIpc(ipcMain);
  registerIpc(ipcMain, createAppIpcGroups(appIpcDependencies(applier)));
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

  firstRunHint.init();
  if (isWaylandSession(process.env)) {
    notifier.sendSystemNotice(
      i18n.t('notifications.wayland_title'),
      i18n.t('notifications.wayland_body'),
    );
  }

  initSidebar();

  meetingFlyby.init();

  runUpdateCycle();
  startPeriodicJobs();
  registerAppIpc();
  dataSync.startupSync();
});

app.on('window-all-closed', () => {
  clearInterval(desktopCheckInterval);
  dataSync.stop();
  meetingFlyby.destroyAll();
  strips.destroyStrips();
  db.close();
  app.quit();
});
