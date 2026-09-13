// Thin wrapper around the API electron/preload.mjs exposes as
// window.lachTool - kept as its own module (rather than calling
// window.lachTool.* directly from components) so the rest of the app
// doesn't care that it's IPC under the hood, same reason the old
// fetch-based version existed.

export function pickPdf() {
  return window.lachTool.pickPdf()
}

export function parseProtocol(filePath, gameId, seasonId) {
  return window.lachTool.parseProtocol(filePath, gameId, seasonId)
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

export function validateCredentials(creds) {
  return window.lachTool.validateCredentials(creds)
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

export function createManualGamePreview(args) {
  return window.lachTool.createManualGamePreview(args)
}

export function createMissingPlayers(args) {
  return window.lachTool.createMissingPlayers(args)
}

export function finishScheduledGame(args) {
  return window.lachTool.finishScheduledGame(args)
}

export function createNewGameSave(args) {
  return window.lachTool.createNewGameSave(args)
}

export function checkForUpdates() {
  return window.lachTool.checkForUpdates()
}

export function getUpdateStatus() {
  return window.lachTool.getUpdateStatus()
}

export function installUpdate() {
  return window.lachTool.installUpdate()
}

export function onUpdateStatus(callback) {
  return window.lachTool.onUpdateStatus(callback)
}

export function updateSchedule(args) {
  return window.lachTool.updateSchedule(args)
}

export function deleteGame(gameId) {
  return window.lachTool.deleteGame(gameId)
}

export function diagPost(id) {
  return window.lachTool.diagPost(id)
}

export function diagSearchMeta(q) {
  return window.lachTool.diagSearchMeta(q)
}

export function diagTableRow(table, id) {
  return window.lachTool.diagTableRow(table, id)
}

export function pickImage() {
  return window.lachTool.pickImage()
}

export function uploadTeamLogo(args) {
  return window.lachTool.uploadTeamLogo(args)
}

export function pickAttachment() {
  return window.lachTool.pickAttachment()
}

export function uploadAttachment(args) {
  return window.lachTool.uploadAttachment(args)
}

export function bulkImportGames(args) {
  return window.lachTool.bulkImportGames(args)
}

export function createMiniTournamentGames(args) {
  return window.lachTool.createMiniTournamentGames(args)
}

export function resolveMiniTournamentGame(args) {
  return window.lachTool.resolveMiniTournamentGame(args)
}

export function updateTeamName(args) {
  return window.lachTool.updateTeamName(args)
}

export function updatePlayerName(args) {
  return window.lachTool.updatePlayerName(args)
}

export function getHelperPins() {
  return window.lachTool.getHelperPins()
}

export function setHelperPin(name, pin) {
  return window.lachTool.setHelperPin(name, pin)
}

export function deleteHelperPin(name) {
  return window.lachTool.deleteHelperPin(name)
}

export function getActivityLog() {
  return window.lachTool.getActivityLog()
}
