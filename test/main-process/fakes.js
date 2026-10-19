'use strict';

// Test doubles for Electron's BrowserWindow and screen. Windows record what
// the app did to them (visibility, bounds, sent messages) so tests assert on
// observable behavior instead of constructor options.

function makeDisplay(id, x, width, height) {
  return {
    id,
    bounds: { x, y: 0, width, height },
    size: { width, height },
    workArea: { x, y: 0, width, height },
    workAreaSize: { width, height },
  };
}

function createFakeElectron() {
  const windows = [];

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options;
      this.visible = false;
      this.destroyed = false;
      this.focusCount = 0;
      this.bounds = null;
      this.loadedFile = null;
      this.sent = [];
      this.listeners = {};
      this.loadListeners = [];
      this.workspaceCalls = [];
      this.ignoreMouseCalls = [];
      this.showInactiveCount = 0;
      this.hideCount = 0;
      this.closeCount = 0;
      this.xid = 4000 + windows.length;
      this.nativeHandleFails = false;
      this.webContents = {
        send: (channel, payload) => this.sent.push([channel, payload]),
        once: (event, listener) => {
          if (event === 'did-finish-load') {
            this.loadListeners.push(listener);
          }
        },
      };
      windows.push(this);
    }

    isDestroyed() {
      return this.destroyed;
    }

    isVisible() {
      return this.visible;
    }

    show() {
      this.visible = true;
    }

    hide() {
      this.hideCount += 1;
      this.visible = false;
    }

    showInactive() {
      this.showInactiveCount += 1;
      this.visible = true;
    }

    setIgnoreMouseEvents(...args) {
      this.ignoreMouseCalls.push(args);
    }

    getNativeWindowHandle() {
      if (this.nativeHandleFails) {
        throw new Error('no native handle');
      }
      const handle = Buffer.alloc(8);
      handle.writeUInt32LE(this.xid, 0);
      return handle;
    }

    static fromWebContents(webContents) {
      return windows.find((window) => window.webContents === webContents) ?? null;
    }

    focus() {
      this.focusCount += 1;
    }

    setBounds(bounds) {
      this.bounds = bounds;
    }

    setVisibleOnAllWorkspaces(...args) {
      this.workspaceCalls.push(args);
    }

    loadFile(file) {
      this.loadedFile = file;
    }

    on(event, listener) {
      this.listeners[event] = listener;
    }

    close() {
      this.closeCount += 1;
      this.destroyed = true;
      this.listeners.closed?.();
    }

    /** Simulates the page finishing its load. */
    finishLoad() {
      const pending = this.loadListeners.splice(0);
      pending.forEach((listener) => listener());
    }
  }

  const primary = makeDisplay(1, 0, 1920, 1080);
  const secondary = makeDisplay(2, 1920, 1280, 1024);
  const state = { displays: [primary, secondary], primary, cursorDisplay: secondary };
  const screen = {
    getPrimaryDisplay: () => state.primary,
    getAllDisplays: () => state.displays,
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => state.cursorDisplay,
  };

  return { BrowserWindow: FakeBrowserWindow, windows, screen, state, primary, secondary };
}

module.exports = { createFakeElectron, makeDisplay };
