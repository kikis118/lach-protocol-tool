import { contextBridge, ipcRenderer } from 'electron'

// The only surface the renderer (plain React, contextIsolation on, no
// Node integration) can reach - deliberately narrow, one function per
// actual need, no generic "invoke(channel, ...)" passthrough.
contextBridge.exposeInMainWorld('lachTool', {
  getCredentials: () => ipcRenderer.invoke('credentials:get'),
  setCredentials: (creds) => ipcRenderer.invoke('credentials:set', creds),
  pickPdf: () => ipcRenderer.invoke('dialog:pickPdf'),
  parseProtocol: (filePath, gameId, seasonId) => ipcRenderer.invoke('protocol:parse', { filePath, gameId, seasonId }),
  saveGame: (gameId, payload) => ipcRenderer.invoke('game:save', { gameId, payload }),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  getLookups: () => ipcRenderer.invoke('lookups:get'),
  createNewGamePreview: (args) => ipcRenderer.invoke('game:createNewPreview', args),
  createNewGameSave: (args) => ipcRenderer.invoke('game:createNewSave', args),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
})
