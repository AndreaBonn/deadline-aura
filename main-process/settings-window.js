'use strict';

const path = require('path');

/** Settings window: a single frameless window, focused instead of duplicated. */
class SettingsWindow {
  #window = null;
  #dependencies;

  constructor(dependencies) {
    this.#dependencies = dependencies;
  }

  open() {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.focus();
      return;
    }
    const { BrowserWindow, iconPath } = this.#dependencies;
    const window = new BrowserWindow({
      width: 720,
      height: 560,
      frame: false,
      resizable: false,
      backgroundColor: '#0a0c14',
      icon: iconPath,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload-settings.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.#window = window;
    window.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
    window.on('closed', () => {
      this.#window = null;
    });
  }

  close() {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.close();
    }
  }
}

/**
 * @param {{BrowserWindow: Function, iconPath: string}} dependencies
 * @returns {SettingsWindow}
 */
function createSettingsWindow(dependencies) {
  return new SettingsWindow(dependencies);
}

module.exports = { createSettingsWindow };
