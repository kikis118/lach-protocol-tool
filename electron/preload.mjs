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
  createManualGamePreview: (args) => ipcRenderer.invoke('game:createManualPreview', args),
  createMissingPlayers: (args) => ipcRenderer.invoke('players:createMissing', args),
  createNewGameSave: (args) => ipcRenderer.invoke('game:createNewSave', args),
  finishScheduledGame: (args) => ipcRenderer.invoke('game:finishScheduled', args),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  getUpdateStatus: () => ipcRenderer.invoke('updates:status'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  updateSchedule: (args) => ipcRenderer.invoke('schedule:update', args),
  diagPost: (id) => ipcRenderer.invoke('diag:post', { id }),
  diagSearchMeta: (q) => ipcRenderer.invoke('diag:searchMeta', { q }),
  diagTableRow: (table, id) => ipcRenderer.invoke('diag:tableRow', { table, id }),
  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
  uploadTeamLogo: (args) => ipcRenderer.invoke('team:uploadLogo', args),
  pickAttachment: () => ipcRenderer.invoke('dialog:pickAttachment'),
  uploadAttachment: (args) => ipcRenderer.invoke('media:uploadAttachment', args),
  bulkImportGames: (args) => ipcRenderer.invoke('games:bulkImport', args),
  createMiniTournamentGames: (args) => ipcRenderer.invoke('miniTournament:create', args),
  resolveMiniTournamentGame: (args) => ipcRenderer.invoke('miniTournament:resolve', args),
  updateTeamName: (args) => ipcRenderer.invoke('team:updateName', args),
  updatePlayerName: (args) => ipcRenderer.invoke('player:updateName', args),
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
