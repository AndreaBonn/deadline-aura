'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
  getTranslations: () => ipcRenderer.invoke('i18n:get-translations'),
  onInit: (callback) => ipcRenderer.on('overlay-init', (_event, data) => callback(data)),
  savePositions: (positions) => ipcRenderer.send('save-positions', positions),
  unpinTasks: (taskIds) => ipcRenderer.send('overlay-unpin-tasks', taskIds),
  cancel: () => ipcRenderer.send('overlay-cancel'),
});
