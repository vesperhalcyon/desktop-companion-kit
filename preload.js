'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopCompanion', {
  getState: () => ipcRenderer.invoke('pet:get-state'),
  react: () => ipcRenderer.invoke('pet:react'),
  ask: (message) => ipcRenderer.invoke('pet:ask', message),
  observeNow: () => ipcRenderer.invoke('pet:observe-now'),
  updateSettings: (patch) => ipcRenderer.invoke('pet:update-settings', patch),
  setPanelOpen: (open) => ipcRenderer.send('pet:panel-open', Boolean(open)),
  setIgnoreMouse: (ignore) => ipcRenderer.send('pet:ignore-mouse', Boolean(ignore)),
  dragBy: (delta) => ipcRenderer.send('pet:drag-by', delta),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  openPrivacySettings: () => ipcRenderer.invoke('pet:open-privacy-settings'),
  quit: () => ipcRenderer.send('pet:quit'),
  onComment: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('pet:comment', listener);
    return () => ipcRenderer.removeListener('pet:comment', listener);
  },
  onSettings: (handler) => {
    const listener = (_event, settings) => handler(settings);
    ipcRenderer.on('pet:settings', listener);
    return () => ipcRenderer.removeListener('pet:settings', listener);
  },
  onMoveState: (handler) => {
    const listener = (_event, moving) => handler(moving);
    ipcRenderer.on('pet:moving', listener);
    return () => ipcRenderer.removeListener('pet:moving', listener);
  }
});
