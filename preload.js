'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deadlineAura', {
  onUpdate: (callback) => ipcRenderer.on('update', (_event, data) => callback(data)),
  onStripColor: (callback) => ipcRenderer.on('strip-color', (_event, hex) => callback(hex)),
  toggleSidebar: () => ipcRenderer.send('toggle-sidebar'),
  openConfig: () => ipcRenderer.send('open-config'),
  syncNow: () => ipcRenderer.send('sync-now'),
  markDone: (taskId) => ipcRenderer.send('mark-done', taskId),
  openLink: (url) => ipcRenderer.send('open-link', url),
  pinTask: (taskId, displayId) => ipcRenderer.send('pin-task', { taskId, displayId }),
  unpinTask: (taskId, displayId) => ipcRenderer.send('unpin-task', { taskId, displayId }),
  openOverlay: (displayId) => ipcRenderer.send('open-overlay', { displayId }),
});
