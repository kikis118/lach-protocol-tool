// Local-only admin server for the protocol upload tool. Never deployed -
// runs on the admin's own machine (npm run server) alongside the Vite
// dev server (npm run dev), which proxies /api to this. Holds the WP
// Application Password (server/.env, gitignored) so it never reaches
// the browser - the frontend only ever talks to THIS server, never
// directly to lach.lv.

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { itemsFromBuffer } from './lib/pdfItems.mjs'
import { parseProtocolItems, parseProtocolMeta } from './lib/parseProtocol.mjs'
import { findMatchingGames } from './lib/matchGame.mjs'
import { buildPreview } from './lib/buildPreview.mjs'

// dotenv/config's default (<cwd>/.env) only works if this is launched
// from the server/ directory - "npm run server" from the repo root
// (this project's documented way to run it) has cwd at the repo root
// instead, silently finding no .env at all and leaving WP_USERNAME/
// WP_APP_PASSWORD unset (confirmed: this is exactly what happened on
// first real test - wpAuthHeader() threw inside a try/catch that
// swallows it for the "already has data" check, so the check just
// silently reported false every time instead of erroring loudly).
// Resolved relative to this file instead, so it works regardless of
// which directory the process was started from.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

const PORT = 8787
const WP_API = 'https://lach.lv/wp-json/lach/v1'

const app = express()
app.use(cors())
app.use(express.json())
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

function wpAuthHeader() {
  const { WP_USERNAME, WP_APP_PASSWORD } = process.env
  if (!WP_USERNAME || !WP_APP_PASSWORD) {
    throw new Error('server/.env is missing WP_USERNAME/WP_APP_PASSWORD (see server/.env.example)')
  }
  return `Basic ${Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64')}`
}

async function fetchFullData() {
  const res = await fetch(`${WP_API}/full-data-v2/`)
  if (!res.ok) throw new Error(`full-data-v2 fetch failed: HTTP ${res.status}`)
  return res.json()
}

// Candidate info the picker UI needs - deliberately NOT the full game
// object, just enough to tell two games apart at a glance.
function toCandidate(g, teams) {
  return {
    game_id: g.game_id,
    kickoff: g.kickoff,
    homeTeam: teams[g.home_team],
    awayTeam: teams[g.away_team],
  }
}

app.post('/api/parse', upload.single('protocol'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name "protocol")' })

    const items = await itemsFromBuffer(req.file.buffer)
    const meta = parseProtocolMeta(items)
    const parsed = parseProtocolItems(items)

    const data = await fetchFullData()
    const games = data.games || []
    const teams = data.teams || {}
    const teamDetails = data.team_details || {}
    const players = data.players || {}

    const explicitGameId = req.body.gameId || req.query.gameId
    let game = null
    let candidates = []

    if (explicitGameId) {
      game = games.find((g) => String(g.game_id) === String(explicitGameId)) || null
      if (!game) return res.status(404).json({ error: `No such game_id ${explicitGameId}` })
    } else {
      const { matches, scope } = findMatchingGames(
        { date: meta.date, teamAName: parsed.teamA.name, teamBName: parsed.teamB.name },
        games,
        teams,
      )
      if (matches.length === 1) {
        game = matches[0]
      } else {
        candidates = matches
          .slice()
          .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff))
          .slice(0, 15)
          .map((g) => toCandidate(g, teams))
        return res.json({
          status: matches.length === 0 ? 'none' : 'ambiguous',
          scope,
          parsedMeta: meta,
          parsedTeams: { a: parsed.teamA.name, b: parsed.teamB.name },
          candidates,
          // A wider pool for the manual picker when even team-name
          // matching found nothing/too much - most-recent games first,
          // so the admin can still find the right one by eye.
          fallbackCandidates: candidates.length === 0
            ? games.slice().sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)).slice(0, 20).map((g) => toCandidate(g, teams))
            : [],
        })
      }
    }

    const report = buildPreview(parsed, game, teams, teamDetails, players, meta)

    // This check is what the frontend's "already has data, saving will
    // overwrite it" warning banner is based on - a silently-eaten failure
    // here (which is exactly what happened when the .env path bug above
    // was still present - see that comment) would make the tool falsely
    // claim a game is untouched. Logged loudly and reported to the
    // frontend as `alreadyHasDataCheckFailed` (distinct from a genuine
    // "false") rather than swallowed, so a broken check is visibly a
    // broken check, never mistaken for "confirmed clean".
    let alreadyHasData = false
    let alreadyHasDataCheckFailed = false
    try {
      const statusRes = await fetch(`${WP_API}/game-autofill/${game.game_id}`, {
        headers: { Authorization: wpAuthHeader() },
      })
      if (!statusRes.ok) throw new Error(`game-autofill status check: HTTP ${statusRes.status}`)
      const statusBody = await statusRes.json()
      alreadyHasData = (statusBody.stats_table_rows || []).some((row) =>
        ['c_id__2', 'c_id__6', 'c_id__12', 'c_id__15', 'c_id__16'].some((k) => row[k] && row[k] !== '0' && row[k] !== ''),
      )
    } catch (err) {
      console.error('alreadyHasData check failed:', err.message)
      alreadyHasDataCheckFailed = true
    }

    res.json({ status: 'matched', ...report, alreadyHasData, alreadyHasDataCheckFailed, qa: parsed.qa, meta })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/game/:id/save', async (req, res) => {
  try {
    const wpRes = await fetch(`${WP_API}/game-autofill/${req.params.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: wpAuthHeader() },
      body: JSON.stringify(req.body),
    })
    const body = await wpRes.json()
    if (!wpRes.ok) return res.status(wpRes.status).json(body)
    res.json(body)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`Protocol tool server on http://localhost:${PORT}`)
})
