'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  getTranslations: () => ipcRenderer.invoke('i18n:get-translations'),
  getConfig: () => ipcRenderer.invoke('settings:get-config'),
  saveConfig: (config) => ipcRenderer.invoke('settings:save-config', config),
  getDefaults: () => ipcRenderer.invoke('settings:get-defaults'),
  close: () => ipcRenderer.send('settings:close'),
  captureStatus: () => ipcRenderer.invoke('ai-usage:capture-status'),
  captureInstall: () => ipcRenderer.invoke('ai-usage:capture-install'),
  captureUninstall: () => ipcRenderer.invoke('ai-usage:capture-uninstall'),
});
