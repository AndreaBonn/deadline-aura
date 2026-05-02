'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deadlineAura', {
  onUpdate: (callback) => ipcRenderer.on('update', (_event, data) => callback(data)),
  openConfig: () => ipcRenderer.send('open-config'),
  syncNow: () => ipcRenderer.send('sync-now'),
  markDone: (taskId) => ipcRenderer.send('mark-done', taskId),
});
