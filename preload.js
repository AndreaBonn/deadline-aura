'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deadlineAura', {
  getTranslations: () => ipcRenderer.invoke('i18n:get-translations'),
  onUpdate: (callback) => ipcRenderer.on('update', (_event, data) => callback(data)),
  onStripColor: (callback) => ipcRenderer.on('strip-color', (_event, hex) => callback(hex)),
  toggleSidebar: () => ipcRenderer.send('toggle-sidebar'),
  openConfig: () => ipcRenderer.send('open-config'),
  syncNow: () => ipcRenderer.send('sync-now'),
  openLink: (url) => ipcRenderer.send('open-link', url),
  favoriteTask: (taskId) => ipcRenderer.send('favorite-task', taskId),
  unfavoriteTask: (taskId) => ipcRenderer.send('unfavorite-task', taskId),
  pinTask: (taskId, displayId) => ipcRenderer.send('pin-task', { taskId, displayId }),
  unpinTask: (taskId, displayId) => ipcRenderer.send('unpin-task', { taskId, displayId }),
  openOverlay: (displayId) => ipcRenderer.send('open-overlay', { displayId }),
  createLocalTask: (task) => ipcRenderer.invoke('local-task:create', task),
  updateLocalTask: (task) => ipcRenderer.invoke('local-task:update', task),
  deleteLocalTask: (taskId) => ipcRenderer.invoke('local-task:delete', taskId),
  completeLocalTask: (taskId) => ipcRenderer.invoke('local-task:complete', taskId),
  listCalendars: () => ipcRenderer.invoke('calendar:list'),
  logTimeToCalendar: (params) => ipcRenderer.invoke('calendar:log-time', params),
  getDefaultLogCalendar: () => ipcRenderer.invoke('calendar:get-default'),
  setDefaultLogCalendar: (calendarId) => ipcRenderer.invoke('calendar:set-default', calendarId),
});
