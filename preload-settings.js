'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  getConfig: () => ipcRenderer.invoke('settings:get-config'),
  saveConfig: (config) => ipcRenderer.invoke('settings:save-config', config),
  getDefaults: () => ipcRenderer.invoke('settings:get-defaults'),
  close: () => ipcRenderer.send('settings:close'),
});
