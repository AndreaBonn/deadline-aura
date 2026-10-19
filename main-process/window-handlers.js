'use strict';

/**
 * IPC channels that only drive windows: toggle the sidebar, open/close settings.
 *
 * @param {{sidebar: {toggle: Function}, settings: {open: Function, close: Function}}} windows
 * @returns {{on: Object<string, Function>}}
 */
function createWindowHandlers({ sidebar, settings }) {
  return {
    on: {
      'sidebar:toggle': () => sidebar.toggle(),
      'settings:open': () => settings.open(),
      'settings:close': () => settings.close(),
    },
  };
}

module.exports = { createWindowHandlers };
