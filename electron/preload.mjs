import { contextBridge, ipcRenderer } from 'electron'

// The only surface the renderer (plain React, contextIsolation on, no
// Node integration) can reach - deliberately narrow, one function per
// actual need, no generic "invoke(channel, ...)" passthrough.
contextBridge.exposeInMainWorld('lachTool', {
  getCredentials: () => ipcRenderer.invoke('credentials:get'),
  setCredentials: (creds) => ipcRenderer.invoke('credentials:set', creds),
  validateCredentials: (creds) => ipcRenderer.invoke('credentials:validate', creds),
  pickPdf: () => ipcRenderer.invoke('dialog:pickPdf'),
  parseProtocol: (filePath, gameId, seasonId) => ipcRenderer.invoke('protocol:parse', { filePath, gameId, seasonId }),
  saveGame: (gameId, payload) => ipcRenderer.invoke('game:save', { gameId, payload }),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  getLookups: () => ipcRenderer.invoke('lookups:get'),
  createNewGamePreview: (args) => ipcRenderer.invoke('game:createNewPreview', args),
  createNewGameSave: (args) => ipcRenderer.invoke('game:createNewSave', args),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  getUpdateStatus: () => ipcRenderer.invoke('updates:status'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  // contextBridge deep-freezes exposed VALUES, not functions - this
  // closure-based subscribe (rather than exposing ipcRenderer.on
  // directly) is what a frozen object can still safely offer, and
  // returns its own unsubscribe so a component can clean up on unmount.
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('updates:status', listener)
    return () => ipcRenderer.removeListener('updates:status', listener)
  },
})
