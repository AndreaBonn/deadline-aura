'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meetingDockApi', {
  getTranslations: () => ipcRenderer.invoke('i18n:get-translations'),
  onMeetings: (callback) => ipcRenderer.on('meetings-update', (_event, data) => callback(data)),
  openMeetLink: (url) => ipcRenderer.send('meeting-dock:open-link', url),
  setVisible: (visible) => ipcRenderer.send('meeting-dock:set-visible', visible),
});
