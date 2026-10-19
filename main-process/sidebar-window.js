'use strict';

const path = require('path');
const { getSidebarBounds } = require('../core/window-geometry');

function sidebarOptions(display, sidebarWidth) {
  return {
    ...getSidebarBounds(display, sidebarWidth),
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0c14',
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
}

/**
 * Sidebar window with its visibility state (manual open/close, active strip
 * display) and the desktop-state auto show/hide.
 *
 * `getConfig` is read on every call because main.js reassigns its config.
 */
class SidebarWindow {
  #window = null;
  #ready = false;
  #manualOpen = false;
  #manualClose = false;
  #activeStripDisplayId = null;
  #dependencies;

  constructor(dependencies) {
    this.#dependencies = dependencies;
  }

  #isAlive() {
    return Boolean(this.#window) && !this.#window.isDestroyed();
  }

  create() {
    if (this.#isAlive()) {
      return;
    }
    const { BrowserWindow, screen, getConfig } = this.#dependencies;
    const window = new BrowserWindow(
      sidebarOptions(screen.getPrimaryDisplay(), getConfig().sidebar.width),
    );
    this.#window = window;
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    window.webContents.once('did-finish-load', () => this.#onDidFinishLoad());
    window.on('closed', () => {
      this.#window = null;
      this.#ready = false;
    });
  }

  #onDidFinishLoad() {
    const { screen, refresh, isFirstRunHintPending, onFirstRunShown } = this.#dependencies;
    this.#ready = true;
    refresh({ force: true });
    if (isFirstRunHintPending()) {
      // First launch only: show the sidebar once, so the user learns what the strip opens.
      this.#manualOpen = true;
      this.#manualClose = false;
      this.showOnDisplay(screen.getPrimaryDisplay());
      onFirstRunShown();
    }
  }

  showOnDisplay(display) {
    if (!this.#isAlive()) {
      return;
    }
    const { strips, getConfig } = this.#dependencies;
    this.#window.setBounds(getSidebarBounds(display, getConfig().sidebar.width));

    const displayId = String(display.id);
    strips.hideStrip(displayId);
    this.#activeStripDisplayId = displayId;

    this.#window.show();
  }

  hide() {
    if (this.#isAlive()) {
      this.#window.hide();
    }
    if (this.#activeStripDisplayId) {
      this.#dependencies.strips.showStrip(this.#activeStripDisplayId);
      this.#activeStripDisplayId = null;
    }
  }

  toggle() {
    if (!this.#isAlive()) {
      return;
    }
    if (this.#window.isVisible()) {
      this.#manualOpen = false;
      this.#manualClose = true;
      this.hide();
    } else {
      this.#manualOpen = true;
      this.#manualClose = false;
      const { screen } = this.#dependencies;
      const cursor = screen.getCursorScreenPoint();
      this.showOnDisplay(screen.getDisplayNearestPoint(cursor));
    }
  }

  checkDesktopState() {
    if (!this.#isAlive() || !this.#ready) {
      return;
    }
    // Auto-show only when multiple displays are connected (one free = sidebar target)
    const { screen, getDisplaysWithWindows } = this.#dependencies;
    const displays = screen.getAllDisplays();
    if (displays.length < 2) {
      return;
    }
    getDisplaysWithWindows(screen, (occupied) => this.#applyDesktopState(displays, occupied));
  }

  #applyDesktopState(displays, occupiedDisplayIds) {
    if (!occupiedDisplayIds) {
      return;
    }
    const freeDisplay = displays.find((d) => !occupiedDisplayIds.has(String(d.id)));

    if (freeDisplay && !this.#window.isVisible() && !this.#manualClose) {
      this.showOnDisplay(freeDisplay);
    } else if (!freeDisplay && this.#window.isVisible() && !this.#manualOpen) {
      this.hide();
    } else if (!freeDisplay) {
      this.#manualClose = false;
    }
  }

  /** Sends to the sidebar if it exists, regardless of load state. */
  send(channel, payload) {
    if (this.#isAlive()) {
      this.#window.webContents.send(channel, payload);
    }
  }

  /** Sends only once the page has loaded; the payload is built lazily after the guard. */
  sendWhenReady(channel, buildPayload) {
    if (this.#isAlive() && this.#ready) {
      this.#window.webContents.send(channel, buildPayload());
    }
  }
}

/**
 * @param {object} dependencies - BrowserWindow, screen, strips, getConfig,
 *   getDisplaysWithWindows, refresh, isFirstRunHintPending, onFirstRunShown.
 * @returns {SidebarWindow}
 */
function createSidebarWindow(dependencies) {
  return new SidebarWindow(dependencies);
}

module.exports = { createSidebarWindow };
