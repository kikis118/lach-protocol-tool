// Parses one LHL (Latvijas Hokeja Līga) official game protocol PDF into
// structured goal/penalty/goalie data. Used by electron/main.mjs's
// protocol:parse/game:createNewPreview handlers.
//
// FORKED, NOT SHARED: manually-maintained copy of lach-hockey-app's
// scripts/lib/parseProtocol.mjs (separate repo, github.com/kikis118/
// lach-hockey-app - kept separate on purpose, see that repo's
// PROJECT-NOTES.md). No package/submodule/build step keeps them in
// sync - a fix to the layout parsing below (column detection, goal/
// penalty rules, header labels, etc.) needs to be manually ported
// there too. The two copies deliberately differ in one place already -
// only THIS copy has findBestPlayers() below (a feature this app's own
// UI needs that the other repo's game-events.json pipeline has no use
// for) - don't try to force full identity, just check anything ELSE
// that changes here.
//
// Layout notes (confirmed against real files, not guessed):
// - Two tables ("A Komanda"/"B Komanda"), each: a roster list, with two
//   independent sub-tables (Vārti/goals, Sodi/penalties) printed in the
//   SAME rows for print-layout compactness only - the player named on a
//   given row is unrelated to that row's goal/penalty data. Every jersey
//   reference (scorer, assists, penalized player) must be resolved
//   against the roster, never against the row's own name.
// - Column x-positions are NOT constant across files - the table
//   auto-sizes (seen: "Nr" at x=123 in one file, x=227 in another,
//   apparently based on the longest player name in that game's roster).
//   Column meaning is therefore derived from each file's own header row
//   text, not hardcoded positions - this also means a future protocol
//   with reordered/renamed columns fails loudly (via the header-label
//   check below) instead of silently mis-mapping data.
// - Goal columns per row: V (seq #), Laiks (time), VG (scorer jersey),
//   P, P (up to 2 assist jerseys), S (situation: EQ/PP1/SH1/...).
// - Penalty columns per row: Nr (jersey, ABSENT for bench penalties like
//   too-many-men), Min, Pārkāpums (infraction code), SL/BL (clock
//   window).
// - A goal is real if it has a scorer jersey (VG) - Laiks (time) alone
//   is NOT required, because a shootout-deciding goal genuinely has no
//   in-game clock time and is marked with situation "PS" (penalty shot)
//   instead of EQ/PP/SH (confirmed: game 1067, outcome pen_win/pen_loss,
//   row "V=4, Laiks=blank, VG=10, S=PS" - the shootout winner, jersey 10
//   resolving to the actual scorer; excluding it was why several games'
//   QA check flagged "1 goal not itemized" when the goal WAS itemized,
//   just without a clock time by nature). What's still correctly
//   excluded: a row with V/S but NO scorer jersey at all (seen on a
//   shutout team's first penalty row: V=1, S=EQ, no Laiks/VG at all -
//   that's a genuine gap in the protocol, not a shootout goal).
// - Penalty detection keys off a real (alphabetic) infraction code, not
//   Min/Nr - a stray "0" text fragment from a neighboring cell is
//   JS-truthy as a string and was briefly a false-positive source.

const HEADER_LABELS = ['Vārds, Uzvārds', 'Nr', 'V', 'Laiks', 'VG', 'P', 'P', 'S', 'Nr', 'Min', 'Pārkāpums', 'SL', 'BL']
const COL_KEYS =        ['name',          'nr', 'v', 'laiks', 'vg', 'p1','p2','s', 'sodiNr','sodiMin','infraction','sl','bl']

const Y_TOL = 2.5 // merges text runs the PDF renderer split across near-identical y-values into one logical row

function groupIntoLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y)
  const lines = []
  let current = null
  for (const it of sorted) {
    if (!current || Math.abs(current.y - it.y) > Y_TOL) {
      current = { y: it.y, items: [] }
      lines.push(current)
    }
    current.items.push(it)
  }
  return lines
}

// Confirms the header row's text matches the known label sequence
// (order-sensitive for the two repeated labels, "Nr" and "P", which is
// safe as long as roster-Nr-before-penalty-Nr and assist1-before-assist2
// stay true) and derives this file's own x-position for each column.
function deriveColumns(headerLine) {
  const sorted = [...headerLine.items].sort((a, b) => a.x - b.x)
  const labels = sorted.map((it) => it.str.trim())
  const matches = labels.length === HEADER_LABELS.length && labels.every((l, i) => l === HEADER_LABELS[i])
  if (!matches) {
    throw new Error(`Unrecognized protocol header layout: [${labels.join(' | ')}]`)
  }
  const cols = {}
  sorted.forEach((it, i) => { cols[COL_KEYS[i]] = it.x })
  return cols
}

// lhl.lv's own player database apparently marks stale/duplicate roster
// records with an "(Arhīvs, nelietot)"-style note directly in the
// name field, in a bunch of inconsistent hand-typed forms ("!!!ARHIVS
// NELIETOT!!!", "(Arhīvs, nelietot)", "!NELIETOT ARHIVS!!!", ...) - and
// since that's whatever was in the name field when a game's protocol
// got printed, it leaks straight into the PDF as if it were part of the
// real name (confirmed: 2016-2017/2017-2018/2019-2020 seasons, dozens
// of players). This is print noise from lhl.lv's own admin tooling, not
// a real part of anyone's name - stripped at the shared roster-name
// extraction point so it never reaches the roster, scorer/assist names,
// or player-id slugs anywhere downstream.
function stripArchiveNote(name) {
  const m = /arh[iī]vs|nelietot/i.exec(name)
  if (!m) return name.trim()
  return name.slice(0, m.index).replace(/[\s!(),.-]+$/, '').trim()
}

function bucket(x, cols) {
  let best = null
  let bestDist = Infinity
  for (const [key, anchor] of Object.entries(cols)) {
    const d = Math.abs(x - anchor)
    if (d < bestDist) { bestDist = d; best = key }
  }
  return best
}

function rowsFromLines(lines, cols) {
  return lines.map((line) => {
    const cells = {}
    line.items.forEach((it) => {
      const col = bucket(it.x, cols)
      cells[col] = (cells[col] ? cells[col] + ' ' : '') + it.str.trim()
    })
    return { y: line.y, cells }
  })
}

function parseTeamBlock(rows, startIdx) {
  const teamName = rows[startIdx].cells.name.replace(/^[AB] Komanda:\s*/, '')
  const players = []
  let i = startIdx + 2 // skip "X Komanda: NAME" row + column-header row
  while (i < rows.length && !(rows[i].cells.name || '').startsWith('Kapteinis:')) {
    const c = rows[i].cells
    if (c.name) {
      const entry = { name: stripArchiveNote(c.name), jersey: c.nr || null }
      if (c.vg) {
        entry.goal = {
          seq: c.v ? Number(c.v) : null,
          time: c.laiks || null,
          scorerJersey: c.vg,
          assist1Jersey: c.p1 || null,
          assist2Jersey: c.p2 || null,
          situation: c.s || null,
          isShootout: c.s === 'PS',
        }
      }
      if (c.infraction && !/^\d+$/.test(c.infraction)) {
        entry.penalty = {
          jersey: c.sodiNr || null,
          minutes: c.sodiMin ? Number(c.sodiMin) : null,
          infraction: c.infraction,
          slStart: c.sl || null,
          blEnd: c.bl || null,
        }
      }
      players.push(entry)
    }
    i++
  }
  return { teamName, players }
}

function timeToSeconds(t) {
  const [m, s] = (t || '0:0').split(':').map(Number)
  return m * 60 + s
}

// Best-effort scan for a "best players"/MVP section - UNVERIFIED against
// any real protocol sample. No LHL protocol seen so far (across the
// historical import or any live game this project has processed) has
// shown one - every layout detail documented at the top of this file was
// confirmed against real files, this one wasn't. If some protocol
// variant (a different tournament's template, say) DOES print one, this
// gives it a chance to auto-fill; if the label never matches, the UI
// still always offers manual entry regardless, so nothing is blocked by
// this being wrong or incomplete.
const BEST_PLAYER_LABEL = /labākais spēlēt[āa]j|labākie spēlēt[āa]ji|vērtīg[āa]kie spēlēt[āa]ji|spēles vīr[iu]|3\s*zvaigznes|three stars|\bmvp\b/i

function findBestPlayers(lines) {
  const labelLineIdx = lines.findIndex((l) => l.items.some((it) => BEST_PLAYER_LABEL.test(it.str)))
  if (labelLineIdx === -1) return []
  const labelLine = lines[labelLineIdx]
  const afterLabel = labelLine.items
    .filter((it) => !BEST_PLAYER_LABEL.test(it.str))
    .map((it) => it.str.trim())
    .filter(Boolean)
  const candidates = afterLabel.length > 0
    ? afterLabel
    : (lines[labelLineIdx + 1]?.items || []).map((it) => it.str.trim()).filter(Boolean)
  return candidates.slice(0, 3)
}

// Extracts the info bar above the roster tables ("Datums, laiks:",
// "Vieta:") and the period-score footer ("Periodu rezultāti") - neither
// touched by parseProtocolItems(), which starts at the roster header row.
// Written for the historical lhl.lv import (see scripts/lhl-archive/),
// where there's no WordPress game record to pull date/venue/score from -
// the protocol itself has to be the source of truth for those too.
export function parseProtocolMeta(items) {
  const lines = groupIntoLines(items)

  const infoLine = lines.find((l) => l.items.some((it) => it.str.startsWith('Datums, laiks:')))
  const dateStr = infoLine?.items.find((it) => it.str.startsWith('Datums, laiks:'))?.str
  const venueStr = infoLine?.items.find((it) => it.str.startsWith('Vieta:'))?.str

  const dateMatch = dateStr?.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})/)
  const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null
  const time = dateMatch ? dateMatch[4] : null
  const venue = venueStr ? venueStr.replace(/^Vieta:\s*/, '').trim() : null

  // Four footer rows share a y-value with the unrelated goalie-change
  // subtable to their left (same page-compactness pattern as the main
  // roster tables). A fixed x-threshold to skip those first seemed to
  // work on the reference file but broke on another with a differently-
  // sized goalie subtable shifting everything right - same "columns
  // aren't at constant x, table auto-sizes" lesson as the main parser,
  // so this derives the footer's own columns from its own header row too
  // instead of assuming a threshold.
  const periodScores = {}
  const footerHeaderLine = lines.find((l) => {
    const strs = l.items.map((it) => it.str.trim())
    return strs.includes('Komanda') && strs.includes('Rez.')
  })
  if (footerHeaderLine) {
    const labelToKey = { '1': 'p1', '2': 'p2', '3': 'p3', 'PL.': 'extra', 'Rez.': 'final' }
    const footerCols = {}
    footerHeaderLine.items.forEach((it) => {
      const key = labelToKey[it.str.trim()]
      if (key) footerCols[key] = it.x
    })
    lines
      .filter((l) => {
        const strs = l.items.map((it) => it.str.trim())
        return strs.includes('Vārti') && (strs.includes('A') || strs.includes('B'))
      })
      .forEach((line) => {
        const side = line.items.find((it) => it.str.trim() === 'A' || it.str.trim() === 'B')?.str.trim()
        if (!side) return
        const values = {}
        line.items.forEach((it) => {
          if (!/^\d+$/.test(it.str.trim())) return
          const col = bucket(it.x, footerCols)
          if (col && Math.abs(it.x - footerCols[col]) < 10) values[col] = Number(it.str.trim())
        })
        if (['p1', 'p2', 'p3', 'final'].every((k) => k in values)) periodScores[side] = values
      })
  }

  const bestPlayersParsed = findBestPlayers(lines)

  return { date, time, venue, periodScores, bestPlayersParsed }
}

// items: [{ str, x, y }] from pdfjs getTextContent(), page 1 only
// (everything of interest lives on page 1; page 2 is just a timestamp).
export function parseProtocolItems(items) {
  const lines = groupIntoLines(items)
  const headerLine = lines.find((l) => l.items.some((it) => it.str.trim() === 'Vārds, Uzvārds'))
  if (!headerLine) {
    throw new Error('Could not find the "Vārds, Uzvārds" header row - protocol layout may have changed')
  }
  const cols = deriveColumns(headerLine)
  const rows = rowsFromLines(lines, cols)

  const aIdx = rows.findIndex((r) => (r.cells.name || '').startsWith('A Komanda:'))
  const bIdx = rows.findIndex((r) => (r.cells.name || '').startsWith('B Komanda:'))
  if (aIdx === -1 || bIdx === -1) {
    throw new Error('Could not find both team sections ("A Komanda:"/"B Komanda:")')
  }
  const teamA = parseTeamBlock(rows, aIdx)
  const teamB = parseTeamBlock(rows, bIdx)

  const goals = []
  const penalties = []
  for (const [side, team] of [['A', teamA], ['B', teamB]]) {
    team.players.forEach((p) => {
      if (p.goal) goals.push({ team: side, ...p.goal })
      if (p.penalty) penalties.push({ team: side, ...p.penalty })
    })
  }

  const rosterByJersey = {
    A: Object.fromEntries(teamA.players.map((p) => [p.jersey, p.name])),
    B: Object.fromEntries(teamB.players.map((p) => [p.jersey, p.name])),
  }
  goals.forEach((g) => {
    g.scorerName = rosterByJersey[g.team][g.scorerJersey] || null
    g.assist1Name = g.assist1Jersey ? rosterByJersey[g.team][g.assist1Jersey] || null : null
    g.assist2Name = g.assist2Jersey ? rosterByJersey[g.team][g.assist2Jersey] || null : null
  })
  penalties.forEach((p) => {
    p.penalizedName = p.jersey ? rosterByJersey[p.team][p.jersey] || null : null
  })
  // Shootout goals (no clock time) always sort after every timed goal,
  // regardless of their protocol sequence number - they happen after
  // the game itself ends.
  goals.sort((a, b) => {
    if (!a.time && !b.time) return 0
    if (!a.time) return 1
    if (!b.time) return -1
    return timeToSeconds(a.time) - timeToSeconds(b.time)
  })

  const goalieRows = rows.filter((r) => /^\d{2}:\d{2}$/.test(r.cells.name || ''))
  const goalieChanges = goalieRows.map((r) => ({
    time: r.cells.name,
    goalieAJersey: r.cells.nr,
    goalieBJersey: r.cells.v,
  }))

  // Self-check against the protocol's own printed period-totals footer -
  // catches both parser bugs AND genuine WP-vs-protocol data mismatches
  // (found one: a game recorded as a shutout in WP whose own protocol
  // says the "shut-out" team actually scored once). Never silently
  // trusted - callers decide what to do with a mismatch.
  const officialTotals = {}
  for (const side of ['A', 'B']) {
    const line = lines.find((l) => {
      const strs = l.items.map((it) => it.str.trim())
      return strs.includes('Vārti') && strs.includes(side)
    })
    if (line) {
      const nums = line.items
        .filter((it) => /^\d+$/.test(it.str.trim()))
        .sort((a, b) => a.x - b.x)
        .map((it) => Number(it.str.trim()))
      if (nums.length) officialTotals[side] = nums[nums.length - 1]
    }
  }
  const derivedTotals = {
    A: goals.filter((g) => g.team === 'A').length,
    B: goals.filter((g) => g.team === 'B').length,
  }
  const goalCountMatches = officialTotals.A === derivedTotals.A && officialTotals.B === derivedTotals.B

  return {
    teamA: { name: teamA.teamName, players: teamA.players.map(({ goal, penalty, ...p }) => p) },
    teamB: { name: teamB.teamName, players: teamB.players.map(({ goal, penalty, ...p }) => p) },
    goals,
    penalties,
    goalieChanges,
    qa: { officialTotals, derivedTotals, goalCountMatches },
  }
}
