'use strict';

const path = require('path');
const { execFile } = require('child_process');
const { getMeetingDockBounds } = require('../core/window-geometry');
const { isSafeExternalUrl } = require('../core/url-safety');
const { buildMeetUrlWithAccount } = require('../core/meet-url-builder');

const MEETING_DOCK_HEIGHT = 52;

function dockOptions(display) {
  return {
    ...getMeetingDockBounds(display, MEETING_DOCK_HEIGHT),
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-meeting-dock.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
}

function setDockDesktop(window) {
  if (process.platform !== 'linux' || !process.env.DISPLAY) {
    return;
  }
  try {
    const xid = String(window.getNativeWindowHandle().readUInt32LE(0));
    // Sticky on all desktops without DOCK type, preserving transparency and no strut.
    execFile(
      'xprop',
      ['-id', xid, '-f', '_NET_WM_DESKTOP', '32c', '-set', '_NET_WM_DESKTOP', '0xffffffff'],
      () => {},
    );
  } catch {
    // xprop unavailable: keep the dock usable without sticky desktop.
  }
}

function setIgnoreMouse(BrowserWindow, event, ignore) {
  // X11 forwarding does not reliably deliver mouse events to the renderer.
  if (process.platform === 'linux') {
    return;
  }
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && !window.isDestroyed()) {
    if (ignore) {
      window.setIgnoreMouseEvents(true, { forward: true });
    } else {
      window.setIgnoreMouseEvents(false);
    }
  }
}

function setDockVisible(window, visible) {
  if (!window || window.isDestroyed()) {
    return;
  }
  if (visible && !window.isVisible()) {
    window.showInactive();
  } else if (!visible && window.isVisible()) {
    window.hide();
  }
}

class MeetingDockWindows {
  #windows = new Map();
  #dependencies;

  constructor(dependencies) {
    this.#dependencies = dependencies;
  }

  createMeetingDocks() {
    this.destroyMeetingDocks();
    const { screen, getConfig } = this.#dependencies;
    if (!getConfig().meeting_dock?.enabled) {
      return;
    }
    for (const display of screen.getAllDisplays()) {
      this.#createDock(display);
    }
  }

  #createDock(display) {
    const { BrowserWindow } = this.#dependencies;
    const window = new BrowserWindow(dockOptions(display));
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    window.loadFile(path.join(__dirname, '..', 'renderer', 'meeting-dock.html'));
    window.webContents.once('did-finish-load', () => setDockDesktop(window));
    // Linux keeps the whole dock interactive because X11 forwarding is unreliable.
    if (process.platform !== 'linux') {
      window.setIgnoreMouseEvents(true, { forward: true });
    }
    this.#windows.set(String(display.id), window);
  }

  destroyMeetingDocks() {
    for (const window of this.#windows.values()) {
      if (window && !window.isDestroyed()) {
        window.close();
      }
    }
    this.#windows = new Map();
  }

  updateMeetingDocks() {
    const { getConfig, db } = this.#dependencies;
    const config = getConfig();
    if (!config.meeting_dock?.enabled) {
      return;
    }
    const lookaheadMin = config.meeting_dock?.lookahead_minutes || 10;
    const meetings = db.getUpcomingMeetings(lookaheadMin, -5);
    for (const window of this.#windows.values()) {
      if (window && !window.isDestroyed() && window.webContents) {
        window.webContents.send('meetings-update', meetings);
      }
    }
  }

  registerIpc(ipcMain) {
    const { BrowserWindow } = this.#dependencies;
    ipcMain.on('meeting-dock:open-link', (_event, url) => this.#openLink(url));
    ipcMain.on('meeting-dock:set-ignore-mouse', (event, ignore) => {
      setIgnoreMouse(BrowserWindow, event, ignore);
    });
    ipcMain.on('meeting-dock:set-visible', (_event, visible) => {
      for (const window of this.#windows.values()) {
        setDockVisible(window, visible);
      }
    });
  }

  #openLink(url) {
    const { getConfig, openExternalUrl, externalBrowserDependencies } = this.#dependencies;
    const config = getConfig();
    if (typeof url === 'string' && isSafeExternalUrl(url)) {
      const googleAccount = config.sources?.google_calendar?.google_account;
      const finalUrl = buildMeetUrlWithAccount(url, googleAccount);
      openExternalUrl(finalUrl, externalBrowserDependencies);
    }
  }
}

function createMeetingDockWindows(dependencies) {
  return new MeetingDockWindows(dependencies);
}

module.exports = { createMeetingDockWindows };
