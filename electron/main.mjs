// Electron main process - replaces the old Express server entirely.
// Runs the exact same parsing/matching/payload logic (electron/lib/*,
// ported from lach-hockey-app the same way server/lib/* was) directly in
// the main process instead of over HTTP, since there's no longer a
// separate server to talk to - the renderer calls these via IPC
// (see preload.mjs) and file paths come straight from Electron's own
// native file-open dialog, not a browser <input type=file>.
//
// Credentials (WP_USERNAME/WP_APP_PASSWORD) live in a plain JSON file
// under Electron's per-user app-data folder (see credentialsPath below) -
// NOT bundled into the app, NOT shared between installs. Each person who
// runs this app enters their own WP Application Password on first run
// (see src/components/Setup.jsx) and it's saved locally on their machine
// only, same as the old server/.env but per-installation instead of
// per-repo-checkout.

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
// electron-updater is CommonJS - under ESM it only has a default export,
// not the named `autoUpdater` export its own docs show.
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { itemsFromBuffer } from './lib/pdfItems.mjs'
import { parseProtocolItems, parseProtocolMeta } from './lib/parseProtocol.mjs'
import { findMatchingGames } from './lib/matchGame.mjs'
import { buildPreview } from './lib/buildPreview.mjs'
import { buildNewGamePreview } from './lib/buildNewGamePreview.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WP_API = 'https://lach.lv/wp-json/lach/v1'
const isDev = !app.isPackaged

function credentialsPath() {
  return path.join(app.getPath('userData'), 'credentials.json')
}

function readCredentials() {
  try {
    return JSON.parse(fs.readFileSync(credentialsPath(), 'utf8'))
  } catch {
    return { username: '', appPassword: '' }
  }
}

function writeCredentials(creds) {
  fs.writeFileSync(credentialsPath(), JSON.stringify(creds), 'utf8')
}

function wpAuthHeader() {
  const { username, appPassword } = readCredentials()
  if (!username || !appPassword) throw new Error('WordPress credentials not set - open Iestatījumi to add them')
  return `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`
}

async function fetchFullData() {
  const res = await fetch(`${WP_API}/full-data-v2/`)
  if (!res.ok) throw new Error(`full-data-v2 fetch failed: HTTP ${res.status}`)
  return res.json()
}

function toCandidate(g, teams) {
  return { game_id: g.game_id, kickoff: g.kickoff, homeTeam: teams[g.home_team], awayTeam: teams[g.away_team] }
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    autoHideMenuBar: true,
    // electron-builder embeds build/icon.ico into the packaged .exe
    // automatically (Windows-only, by convention - no config needed for
    // that part) - this is what makes the DEV-mode window/taskbar icon
    // match instead of showing Electron's own default icon, since that
    // embedding only applies to a packaged build.
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // ESM preload scripts need the sandbox off (Electron's sandboxed
      // preload loader only fully supports CJS) - preload.mjs still runs
      // in its own isolated context via contextBridge, this only affects
      // which module format the preload script itself can use.
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5174')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// Registers this app to handle "lachprotocol://" links - what lets the
// wp-admin "Ielādēt Protokolu" admin-bar link (see
// wp-snippets/protocol-tool-link.php) actually launch/focus this app
// instead of just being a dead link, now that the app has no localhost
// URL to point at anymore (it's a real desktop app, not a dev server).
// Only meaningful in the packaged build - in dev, Electron itself is the
// "exe" (electron.exe running this project's folder), so registering it
// as the protocol's default handler would point lachprotocol:// links at
// bare Electron rather than this app specifically.
if (!isDev) {
  app.setAsDefaultProtocolClient('lachprotocol')
}

// Windows/Linux launch a SECOND process when a lachprotocol:// link is
// clicked while the app's already running - requestSingleInstanceLock()
// makes that second launch just hand its argv to the first instance
// (via 'second-instance') and quit immediately, so the user always lands
// on the one already-open window instead of two separate app instances.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    createWindow()
    // Real update path: electron-updater reads the same `build.publish`
    // GitHub config already used to auto-publish releases (see
    // package.json) via an `app-update.yml` electron-builder embeds into
    // the packaged app - no separate feed URL to maintain by hand. Only
    // meaningful in a packaged build - it refuses to run against an
    // unpacked dev checkout (no installer to compare against), so dev
    // mode never calls it; real verification happens the same way every
    // other change here has - install a real build and watch it update.
    if (!isDev) autoUpdater.checkForUpdates().catch(() => {})
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

// --- Auto-update ---------------------------------------------------------
//
// Downloads silently in the background the moment a newer release is
// found (autoDownload) and waits for the admin to explicitly restart
// (autoInstallOnAppQuit: false, quitAndInstall only called from
// updates:install) rather than surprising them mid-task by relaunching
// on its own. Status is pushed to the renderer as it changes rather than
// polled, since the interesting states (downloading, downloaded) happen
// on their own schedule, not in response to a click.

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = false

let updateStatus = { state: 'idle' }

function setUpdateStatus(status) {
  updateStatus = status
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updates:status', { ...updateStatus, currentVersion: app.getVersion() })
  }
}

autoUpdater.on('checking-for-update', () => setUpdateStatus({ state: 'checking' }))
autoUpdater.on('update-available', (info) => setUpdateStatus({ state: 'downloading', version: info.version, percent: 0 }))
autoUpdater.on('update-not-available', () => setUpdateStatus({ state: 'not-available' }))
autoUpdater.on('download-progress', (progress) => setUpdateStatus({ state: 'downloading', percent: Math.round(progress.percent) }))
autoUpdater.on('update-downloaded', (info) => setUpdateStatus({ state: 'downloaded', version: info.version }))
autoUpdater.on('error', (err) => setUpdateStatus({ state: 'error', message: err?.message || String(err) }))

// --- IPC handlers -----------------------------------------------------

ipcMain.handle('credentials:get', () => readCredentials())
ipcMain.handle('credentials:set', (_event, creds) => {
  writeCredentials(creds)
  return true
})

ipcMain.handle('dialog:pickPdf', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile'],
  })
  if (canceled || filePaths.length === 0) return null
  return filePaths[0]
})

ipcMain.handle('shell:openExternal', (_event, url) => shell.openExternal(url))

ipcMain.handle('protocol:parse', async (_event, { filePath, gameId, seasonId }) => {
  const buffer = fs.readFileSync(filePath)
  const items = await itemsFromBuffer(buffer)
  const meta = parseProtocolMeta(items)
  const parsed = parseProtocolItems(items)

  const data = await fetchFullData()
  // Scoping to the admin's own pre-selected season/league (see
  // lookups:get) narrows matching to just that season's games - both
  // more accurate (no cross-season team-name collisions) and the whole
  // point of asking up front "where is this protocol going".
  const games = (data.games || []).filter((g) => !seasonId || String(g.season_id) === String(seasonId))
  const teams = data.teams || {}
  const teamDetails = data.team_details || {}
  const players = data.players || {}

  let game = null
  if (gameId) {
    game = games.find((g) => String(g.game_id) === String(gameId)) || null
    if (!game) throw new Error(`No such game_id ${gameId}`)
  } else {
    const { matches, scope } = findMatchingGames(
      { date: meta.date, teamAName: parsed.teamA.name, teamBName: parsed.teamB.name },
      games,
      teams,
      !seasonId,
    )
    if (matches.length === 1) {
      game = matches[0]
    } else {
      const candidates = matches
        .slice()
        .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff))
        .slice(0, 15)
        .map((g) => toCandidate(g, teams))
      return {
        status: matches.length === 0 ? 'none' : 'ambiguous',
        scope,
        parsedMeta: meta,
        parsedTeams: { a: parsed.teamA.name, b: parsed.teamB.name },
        candidates,
        fallbackCandidates:
          candidates.length === 0
            ? games.slice().sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)).slice(0, 20).map((g) => toCandidate(g, teams))
            : [],
      }
    }
  }

  const report = buildPreview(parsed, game, teams, teamDetails, players, meta)

  let alreadyHasData = false
  let alreadyHasDataCheckFailed = false
  try {
    const statusRes = await fetch(`${WP_API}/game-autofill/${game.game_id}`, { headers: { Authorization: wpAuthHeader() } })
    if (!statusRes.ok) throw new Error(`game-autofill status check: HTTP ${statusRes.status}`)
    const statusBody = await statusRes.json()
    alreadyHasData = (statusBody.stats_table_rows || []).some((row) =>
      ['c_id__2', 'c_id__6', 'c_id__12', 'c_id__15', 'c_id__16'].some((k) => row[k] && row[k] !== '0' && row[k] !== ''),
    )
  } catch (err) {
    console.error('alreadyHasData check failed:', err.message)
    alreadyHasDataCheckFailed = true
  }

  return { status: 'matched', ...report, alreadyHasData, alreadyHasDataCheckFailed, qa: parsed.qa, meta }
})

ipcMain.handle('game:save', async (_event, { gameId, payload }) => {
  const res = await fetch(`${WP_API}/game-autofill/${gameId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: wpAuthHeader() },
    body: JSON.stringify(payload),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || body.message || `HTTP ${res.status}`)
  return body
})

// --- "Create new game" (walk-in subtourney game not yet in WP) --------
//
// Deliberately restricted to picking an EXISTING season/tournament/
// stage/team/venue - see create-finished-game.php's own comment for why
// this never creates those itself. round_id/group_id always default to
// 1 (plain "regular season" shape) - a subtourney game isn't part of
// any bracket.

// Every top-level tournament's own "Regular Season" stage (never
// Play-off/Play-Off) - so a walk-in game can never accidentally get filed
// as a playoff game. Built from `all_tournaments`/`all_seasons`/
// `all_leagues` (every tournament that exists in WP, via its real
// sl_season/sl_league taxonomy terms - confirmed 2026-09-03 via
// /diag/post-terms that this is a term relationship, not postmeta),
// NOT from games already on file - a brand-new tournament with zero
// games would otherwise never appear here (hit twice: the 2026/2027
// launch, and a "test" season with no games). Keyed by tournament (not
// season) since a season can hold more than one tournament/league at
// once - a season-only key would silently hide every tournament but the
// first one seen for that season.
function deriveSeasonCombos(allTournaments, allSeasons, allLeagues) {
  const combos = []
  Object.entries(allTournaments || {}).forEach(([idStr, t]) => {
    if (t.parent_id) return // only top-level tournaments, not stages
    if (!t.season_id) return // no season assigned yet - nothing safe to file under
    const tournamentId = Number(idStr)
    const stageEntries = Object.entries(allTournaments).filter(([, c]) => c.parent_id === tournamentId)
    const regularStage = stageEntries.find(([, c]) => c.title === 'Regular Season')
    combos.push({
      seasonId: t.season_id,
      seasonName: (allSeasons || {})[t.season_id] || `Season ${t.season_id}`,
      tournamentId,
      tournamentName: t.title,
      stageId: regularStage ? Number(regularStage[0]) : tournamentId,
      leagueId: t.league_id,
    })
  })
  return combos.sort((a, b) => b.seasonId - a.seasonId || a.tournamentName.localeCompare(b.tournamentName))
}

ipcMain.handle('lookups:get', async () => {
  const data = await fetchFullData()
  return {
    seasonCombos: deriveSeasonCombos(data.all_tournaments || {}, data.all_seasons || {}, data.all_leagues || {}),
    teams: Object.entries(data.teams || {}).map(([id, name]) => ({ id, name })),
    venues: Object.entries(data.venues || {}).map(([id, name]) => ({ id, name })),
  }
})

ipcMain.handle('game:createNewPreview', async (_event, { filePath, homeTeamId, awayTeamId, aIsHome }) => {
  const buffer = fs.readFileSync(filePath)
  const items = await itemsFromBuffer(buffer)
  const meta = parseProtocolMeta(items)
  const parsed = parseProtocolItems(items)

  const data = await fetchFullData()
  const teamDetails = data.team_details || {}
  const players = data.players || {}
  const teams = data.teams || {}

  const result = buildNewGamePreview(parsed, { homeTeamId, awayTeamId, aIsHome }, teamDetails, players)
  return {
    ...result,
    homeTeam: { name: teams[homeTeamId], team_id: homeTeamId },
    awayTeam: { name: teams[awayTeamId], team_id: awayTeamId },
    meta,
    parsedTeams: { a: parsed.teamA.name, b: parsed.teamB.name },
  }
})

ipcMain.handle('game:createNewSave', async (_event, { seasonCombo, homeTeamId, awayTeamId, venueId, kickoff, gameFields, payload }) => {
  const res = await fetch(`${WP_API}/create-finished-game/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: wpAuthHeader() },
    body: JSON.stringify({
      season_id: seasonCombo.seasonId,
      tournament_id: seasonCombo.tournamentId,
      stage_id: seasonCombo.stageId,
      league_id: seasonCombo.leagueId,
      home_team: homeTeamId,
      away_team: awayTeamId,
      venue_id: venueId,
      kickoff,
      home_scores: gameFields.home_scores,
      away_scores: gameFields.away_scores,
      home_outcome: gameFields.home_outcome,
      away_outcome: gameFields.away_outcome,
      home_points: gameFields.home_points,
      away_points: gameFields.away_points,
      ...payload,
    }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || body.message || `HTTP ${res.status}`)
  return body
})

// --- Update check -------------------------------------------------------
//
ipcMain.handle('updates:check', async () => {
  if (isDev) {
    setUpdateStatus({ state: 'not-available' })
    return { ...updateStatus, currentVersion: app.getVersion() }
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    setUpdateStatus({ state: 'error', message: err?.message || String(err) })
  }
  return { ...updateStatus, currentVersion: app.getVersion() }
})

ipcMain.handle('updates:status', () => ({ ...updateStatus, currentVersion: app.getVersion() }))

ipcMain.handle('updates:install', () => {
  autoUpdater.quitAndInstall()
})
