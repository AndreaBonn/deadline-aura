'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flybyApi', {
  onInit: (callback) => ipcRenderer.on('flyby-init', (_event, data) => callback(data)),
  setIgnore: (ignore) => ipcRenderer.send('flyby:set-ignore', ignore),
  done: () => ipcRenderer.send('flyby:done'),
});
