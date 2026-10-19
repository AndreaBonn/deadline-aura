'use strict';

const path = require('path');
const { execFile } = require('child_process');
const { setX11Strut, getVirtualScreenWidth } = require('../core/display-controller');
const { getStripBounds, isRightmost } = require('../core/window-geometry');

const STRIP_WIDTH = 10;

function stripOptions(display, backgroundColor) {
  return {
    ...getStripBounds(display, STRIP_WIDTH),
    show: false,
    frame: false,
    transparent: false,
    backgroundColor,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
}

function setStripDesktop(window, onReady) {
  const xid = String(window.getNativeWindowHandle().readUInt32LE(0));
  execFile(
    'xprop',
    [
      '-id',
      xid,
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
        ['-id', xid, '-f', '_NET_WM_DESKTOP', '32c', '-set', '_NET_WM_DESKTOP', '0xffffffff'],
        onReady,
      );
    },
  );
}

function showLoadedStrip(window, { display, screen, rightmost }) {
  if (process.platform !== 'linux' || !process.env.DISPLAY || !rightmost) {
    window.show();
    return;
  }
  const onReady = () => {
    window.show();
    setX11Strut(window, display, STRIP_WIDTH, screen);
  };
  try {
    setStripDesktop(window, onReady);
  } catch {
    onReady();
  }
}

class StripWindows {
  #windows = new Map();
  #paletteHex = '#334155';
  #dependencies;

  constructor(dependencies) {
    this.#dependencies = dependencies;
  }

  createStrips() {
    this.destroyStrips();
    const { screen } = this.#dependencies;
    const displays = screen.getAllDisplays();
    const virtualWidth = getVirtualScreenWidth(screen);
    for (const display of displays) {
      this.#createStrip(display, isRightmost(display, virtualWidth));
    }
  }

  #createStrip(display, rightmost) {
    const { BrowserWindow, screen } = this.#dependencies;
    const window = new BrowserWindow(stripOptions(display, this.#paletteHex));
    // Only the strip carrying the strut is sticky; Mutter relocates secondary DOCK windows.
    if (rightmost) {
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    }
    window.loadFile(path.join(__dirname, '..', 'renderer', 'strip.html'));
    window.webContents.once('did-finish-load', () => {
      window.webContents.send('strip-color', this.#paletteHex);
      showLoadedStrip(window, { display, screen, rightmost });
    });
    this.#windows.set(String(display.id), window);
  }

  destroyStrips() {
    for (const window of this.#windows.values()) {
      if (window && !window.isDestroyed()) {
        window.close();
      }
    }
    this.#windows = new Map();
  }

  updateStripColor(hex) {
    this.#paletteHex = hex;
    for (const window of this.#windows.values()) {
      if (window && !window.isDestroyed() && window.webContents) {
        window.webContents.send('strip-color', hex);
      }
    }
  }

  hideStrip(displayId) {
    const window = this.#windows.get(displayId);
    if (window && !window.isDestroyed()) {
      window.hide();
    }
  }

  showStrip(displayId) {
    const window = this.#windows.get(displayId);
    if (window && !window.isDestroyed()) {
      window.show();
    }
  }
}

function createStripWindows(dependencies) {
  return new StripWindows(dependencies);
}

module.exports = { createStripWindows };
