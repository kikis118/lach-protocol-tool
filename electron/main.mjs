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
// Public GitHub API - no token needed, which is exactly why the repo
// needs to stay public: embedding any token in a distributed app is
// extractable from the binary, a real credential-leak risk regardless
// of how narrow its scope is. A private repo's release info simply
// can't be checked here without that risk.
const GITHUB_REPO = 'kikis118/lach-protocol-tool'

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
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

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

// Every season's own "Regular Season" stage (never Play-off/Play-Off) -
// so a walk-in game can never accidentally get filed as a playoff game.
// Derived from the games already on file for that season, not guessed.
function deriveSeasonCombos(games, seasons, tournaments, stages) {
  const bySeason = {}
  games.forEach((g) => {
    const stageName = stages[g.stage_id]
    if (stageName !== 'Regular Season' || bySeason[g.season_id]) return
    bySeason[g.season_id] = {
      seasonId: g.season_id,
      seasonName: seasons[g.season_id] || `Season ${g.season_id}`,
      tournamentId: g.tournament_id,
      tournamentName: tournaments[g.tournament_id] || '',
      stageId: g.stage_id,
      leagueId: g.league_id,
    }
  })
  return Object.values(bySeason).sort((a, b) => b.seasonId - a.seasonId)
}

ipcMain.handle('lookups:get', async () => {
  const data = await fetchFullData()
  return {
    seasonCombos: deriveSeasonCombos(data.games || [], data.seasons || {}, data.tournaments || {}, data.stages || {}),
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
// Deliberately just a CHECK, not a full auto-updater (electron-updater +
// silent background download/install) - that needs a signed build and a
// consistently-published release feed to be safe/reliable, neither of
// which exists yet. This only tells the admin a newer version exists and
// links to the GitHub release to download by hand, same manual install
// flow as today, just with a nudge instead of needing to remember to check.

function parseVersion(v) {
  return (v || '').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
}

function isNewer(latest, current) {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

ipcMain.handle('updates:check', async () => {
  const currentVersion = app.getVersion()
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (res.status === 404) {
    // No release published yet - not an error, just nothing to compare
    // against (see README's "how to publish a release" notes).
    return { currentVersion, latestVersion: null, hasUpdate: false, releaseUrl: null }
  }
  if (!res.ok) throw new Error(`GitHub API: HTTP ${res.status}`)
  const release = await res.json()
  const latestVersion = release.tag_name
  return {
    currentVersion,
    latestVersion,
    hasUpdate: isNewer(latestVersion, currentVersion),
    releaseUrl: release.html_url,
  }
})
