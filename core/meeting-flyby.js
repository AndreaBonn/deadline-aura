'use strict';

const path = require('path');

const FLYBY_WINDOW_WIDTH = 560;
const FLYBY_WINDOW_HEIGHT = 90;
const ANIMATION_TICK_MS = 33;
const COOLDOWN_MS = 5 * 60 * 1000;
const TRIGGER_WINDOW_MS = 15 * 1000;
const STAGGER_DELAY_MS = 2500;
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

function init() {
  if (initialized) {
    return;
  }
  initialized = true;

  const { BrowserWindow, ipcMain } = require('electron');

  ipcMain.on('flyby:clicked', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      return;
    }
    const state = activeFlybys.get(win);
    if (state?.interval) {
      clearInterval(state.interval);
      state.interval = null;
    }
  });

  ipcMain.on('flyby:dismiss', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      return;
    }
    const state = activeFlybys.get(win);
    if (state?.interval) {
      clearInterval(state.interval);
    }
    activeFlybys.delete(win);
    win.close();
  });
}

function launchFlyby({ meeting, display, durationSeconds }) {
  const { BrowserWindow } = require('electron');
  const { bounds } = display;
  const yPosition = Math.round(bounds.y + bounds.height * 0.35);

  const win = new BrowserWindow({
    width: FLYBY_WINDOW_WIDTH,
    height: FLYBY_WINDOW_HEIGHT,
    x: bounds.x - FLYBY_WINDOW_WIDTH,
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

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'flyby.html'));

  const totalDistance = bounds.width + FLYBY_WINDOW_WIDTH * 2;
  const totalTicks = Math.round((durationSeconds * 1000) / ANIMATION_TICK_MS);
  const pxPerTick = totalDistance / totalTicks;
  const startX = bounds.x - FLYBY_WINDOW_WIDTH;
  const endX = bounds.x + bounds.width;
  let tickCount = 0;

  const state = { interval: null };
  activeFlybys.set(win, state);

  win.webContents.once('did-finish-load', () => {
    const title = meeting.title || 'Meeting';
    win.webContents.send('flyby-init', { title });
    win.showInactive();

    state.interval = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(state.interval);
        activeFlybys.delete(win);
        return;
      }

      if (meeting.start_at && Date.now() >= meeting.start_at) {
        clearInterval(state.interval);
        activeFlybys.delete(win);
        win.close();
        return;
      }

      tickCount++;
      const currentX = Math.round(startX + pxPerTick * tickCount);

      if (currentX > endX) {
        tickCount = 0;
        try {
          win.setPosition(startX, yPosition);
        } catch {
          clearInterval(state.interval);
          activeFlybys.delete(win);
        }
        return;
      }

      try {
        win.setPosition(currentX, yPosition);
      } catch {
        clearInterval(state.interval);
        activeFlybys.delete(win);
      }
    }, ANIMATION_TICK_MS);
  });

  win.on('closed', () => {
    if (state.interval) {
      clearInterval(state.interval);
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
    if (state.interval) {
      clearInterval(state.interval);
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
    cooldownMap,
    COOLDOWN_MS,
    TRIGGER_WINDOW_MS,
  },
};
