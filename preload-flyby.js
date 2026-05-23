'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flybyApi', {
  onInit: (callback) => ipcRenderer.on('flyby-init', (_event, data) => callback(data)),
  clicked: () => ipcRenderer.send('flyby:clicked'),
  dismiss: () => ipcRenderer.send('flyby:dismiss'),
});
