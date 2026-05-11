'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deadlineAura', {
  getTranslations: () => ipcRenderer.invoke('i18n:get-translations'),
  onUpdate: (callback) => ipcRenderer.on('update', (_event, data) => callback(data)),
  onStripColor: (callback) => ipcRenderer.on('strip-color', (_event, hex) => callback(hex)),
  toggleSidebar: () => ipcRenderer.send('sidebar:toggle'),
  openConfig: () => ipcRenderer.send('settings:open'),
  syncNow: () => ipcRenderer.send('sync:run'),
  openLink: (url) => ipcRenderer.send('shell:open-link', url),
  favoriteTask: (taskId) => ipcRenderer.send('task:favorite', taskId),
  unfavoriteTask: (taskId) => ipcRenderer.send('task:unfavorite', taskId),
  pinTask: (taskId, displayId) => ipcRenderer.send('pin-task', { taskId, displayId }),
  unpinTask: (taskId, displayId) => ipcRenderer.send('unpin-task', { taskId, displayId }),
  openOverlay: (displayId) => ipcRenderer.send('open-overlay', { displayId }),
  createLocalTask: (task) => ipcRenderer.invoke('local-task:create', task),
  updateLocalTask: (task) => ipcRenderer.invoke('local-task:update', task),
  deleteLocalTask: (taskId) => ipcRenderer.invoke('local-task:delete', taskId),
  completeLocalTask: (taskId) => ipcRenderer.invoke('local-task:complete', taskId),
  listCalendars: () => ipcRenderer.invoke('calendar:list'),
  logTimeToCalendar: (params) => ipcRenderer.invoke('calendar:log-time', params),
  updateCalendarEvent: (params) => ipcRenderer.invoke('calendar:update-event', params),
  getDefaultLogCalendar: () => ipcRenderer.invoke('calendar:get-default'),
  setDefaultLogCalendar: (calendarId) => ipcRenderer.invoke('calendar:set-default', calendarId),
  getWorkShiftConfig: () => ipcRenderer.invoke('config:get-work-shift'),
  onConfigChanged: (callback) => ipcRenderer.on('config-changed', (_event, cfg) => callback(cfg)),
});
