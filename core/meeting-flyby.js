'use strict';

const path = require('path');
const i18n = require('../i18n');

const FLYBY_WINDOW_HEIGHT = 200;
const CAT_BAND_RATIO = 0.32;
const COOLDOWN_MS = 5 * 60 * 1000;
const TRIGGER_WINDOW_MS = 15 * 1000;
const STAGGER_DELAY_MS = 2500;
const CHOREOGRAPHY_MS = 9000;
const cooldownMap = new Map();
const activeFlybys = new Map();
let initialized = false;

function cleanupCooldowns() {
  const now = Date.now();
  for (const [id, timestamp] of cooldownMap) {
    if (now - timestamp > COOLDOWN_MS) {
      cooldownMap.delete(id);
    }
  }
}

function findTriggeredMeetings(events, triggerSeconds) {
  const now = Date.now();
  const targetMs = triggerSeconds * 1000;
  return events.filter((event) => {
    if (!event.start_at || cooldownMap.has(event.id)) {
      return false;
    }
    const diffMs = event.start_at - now;
    return diffMs > 0 && Math.abs(diffMs - targetMs) <= TRIGGER_WINDOW_MS;
  });
}

/**
 * Build the localized "in N minutes/seconds" phrase, with singular/plural.
 *
 * @param {number} secondsLeft - Seconds until the meeting starts.
 * @param {(key: string, params?: object) => string} t - Translation function.
 * @returns {string} Localized remaining-time phrase.
 */
function formatRemaining(secondsLeft, t) {
  const s = Math.max(0, Math.round(secondsLeft));
  if (s >= 60) {
    const m = Math.round(s / 60);
    return t(m === 1 ? 'flyby.in_minute' : 'flyby.in_minutes', { n: m });
  }
  return t(s === 1 ? 'flyby.in_second' : 'flyby.in_seconds', { n: s });
}

/**
 * Compose the banner text shown by the flyby: "{title} {remaining phrase}".
 *
 * @param {string} title - Meeting title.
 * @param {number} secondsLeft - Seconds until the meeting starts.
 * @param {(key: string, params?: object) => string} t - Translation function.
 * @returns {string} Full banner text.
 */
function formatLeadText(title, secondsLeft, t) {
  return `${title} ${formatRemaining(secondsLeft, t)}`;
}

function closeFlyby(win) {
  const state = activeFlybys.get(win);
  if (state?.safetyTimer) {
    clearTimeout(state.safetyTimer);
  }
  activeFlybys.delete(win);
  if (win && !win.isDestroyed()) {
    win.close();
  }
}

function init() {
  if (initialized) {
    return;
  }
  initialized = true;

  const { BrowserWindow, ipcMain } = require('electron');

  // Renderer drives the whole animation; it tells us when it's done (or the
  // user clicked the cat, which makes it run off-screen).
  ipcMain.on('flyby:done', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      closeFlyby(win);
    }
  });

  // The window is click-through by default; the renderer flips this only while
  // the pointer is over the cat, so the cat stays clickable without blocking
  // the rest of the desktop.
  ipcMain.on('flyby:set-ignore', (event, ignore) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      return;
    }
    win.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });
}

function launchFlyby({ meeting, display, durationSeconds }) {
  const { BrowserWindow } = require('electron');
  const { bounds } = display;
  const yPosition = Math.round(bounds.y + bounds.height * CAT_BAND_RATIO);
  const secondsLeft = (meeting.start_at - Date.now()) / 1000;
  const text = formatLeadText(meeting.title || 'Meeting', secondsLeft, i18n.t);

  const win = new BrowserWindow({
    width: bounds.width,
    height: FLYBY_WINDOW_HEIGHT,
    x: bounds.x,
    y: yPosition,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-flyby.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'flyby.html'));

  const state = { safetyTimer: null };
  activeFlybys.set(win, state);

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('flyby-init', { text, holdSeconds: durationSeconds });
    win.showInactive();

    // Safety net: if the renderer never signals completion, close anyway.
    const lifetimeMs = CHOREOGRAPHY_MS + durationSeconds * 1000 + 2000;
    state.safetyTimer = setTimeout(() => closeFlyby(win), lifetimeMs);
  });

  win.on('closed', () => {
    if (state.safetyTimer) {
      clearTimeout(state.safetyTimer);
    }
    activeFlybys.delete(win);
  });
}

function checkAndLaunch({ config, db, screen }) {
  if (!config.meeting_flyby?.enabled) {
    return;
  }

  const triggerSeconds = config.meeting_flyby?.trigger_seconds || 60;
  const durationSeconds = config.meeting_flyby?.duration_seconds || 8;
  const horizonMs = (triggerSeconds + 20) * 1000;
  const events = db.getUpcomingCalendarEvents(horizonMs);

  cleanupCooldowns();
  const triggered = findTriggeredMeetings(events, triggerSeconds);
  const displays = screen.getAllDisplays();

  triggered.forEach((meeting, index) => {
    cooldownMap.set(meeting.id, Date.now());
    const delay = index * STAGGER_DELAY_MS;
    if (delay === 0) {
      displays.forEach((display) => launchFlyby({ meeting, display, durationSeconds }));
    } else {
      setTimeout(() => {
        displays.forEach((display) => launchFlyby({ meeting, display, durationSeconds }));
      }, delay);
    }
  });
}

function destroyAll() {
  for (const [win, state] of activeFlybys) {
    if (state.safetyTimer) {
      clearTimeout(state.safetyTimer);
    }
    if (win && !win.isDestroyed()) {
      win.close();
    }
  }
  activeFlybys.clear();
}

module.exports = {
  init,
  checkAndLaunch,
  destroyAll,
  _testing: {
    findTriggeredMeetings,
    cleanupCooldowns,
    formatRemaining,
    formatLeadText,
    cooldownMap,
    COOLDOWN_MS,
    TRIGGER_WINDOW_MS,
  },
};
