// Thin wrapper around the API electron/preload.mjs exposes as
// window.lachTool - kept as its own module (rather than calling
// window.lachTool.* directly from components) so the rest of the app
// doesn't care that it's IPC under the hood, same reason the old
// fetch-based version existed.

export function pickPdf() {
  return window.lachTool.pickPdf()
}

export function parseProtocol(filePath, gameId) {
  return window.lachTool.parseProtocol(filePath, gameId)
}

export function saveGame(gameId, payload) {
  return window.lachTool.saveGame(gameId, payload)
}

export function getCredentials() {
  return window.lachTool.getCredentials()
}

export function setCredentials(creds) {
  return window.lachTool.setCredentials(creds)
}

export function openExternal(url) {
  return window.lachTool.openExternal(url)
}

export function getLookups() {
  return window.lachTool.getLookups()
}

export function createNewGamePreview(args) {
  return window.lachTool.createNewGamePreview(args)
}

export function createNewGameSave(args) {
  return window.lachTool.createNewGameSave(args)
}

export function checkForUpdates() {
  return window.lachTool.checkForUpdates()
}
