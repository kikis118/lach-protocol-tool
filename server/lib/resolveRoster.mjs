// Shared between scripts/parse-protocols.mjs (frontend enrichment) and
// scripts/wp-autofill.mjs (WP field auto-fill) - both need to map a
// protocol's printed team name/jersey numbers onto real WP team/player
// IDs, using the exact same rules.

// Matches a protocol's printed team name ("HK JŪRAS SPĒKI") to the WP
// team_id for this game's home/away teams. Case differs (PDF is
// upper-case). One team is a mismatch beyond case: the protocol prints
// "HK 1625 LIEPĀJA" while WP's own name for it is just "1625 Liepāja" -
// stripping a standalone "HK" token from both sides before comparing
// handles that without treating "HK" as insignificant for the 5 teams
// where it's genuinely part of the name.
export function resolveTeamId(printedName, game, teams) {
  const norm = (s) => (s || '').trim().toUpperCase().split(/\s+/).filter((w) => w !== 'HK').join(' ')
  if (norm(teams[game.home_team]) === norm(printedName)) return game.home_team
  if (norm(teams[game.away_team]) === norm(printedName)) return game.away_team
  return null
}

// The protocol sometimes zero-pads single-digit jerseys ("07"), WP
// always stores a plain integer (7) - compare both as numbers so
// "07"/7/"7" all match. Confirmed this was silently breaking real
// resolutions (e.g. Valters Stirna, WP number 7, protocol prints "07").
function jerseyKey(jersey) {
  return jersey === null || jersey === undefined || jersey === '' ? null : String(Number(jersey))
}

// Drops any jersey key TWO OR MORE roster entries would claim, instead
// of letting whichever one comes last in the array silently win. Found
// on a real game (1121): WP's own 1625 Liepāja roster has both Jānis
// Fjodorovs AND Valters Stirna listed as jersey 7 - a genuine upstream
// data slip, not something this code can know is wrong, but blindly
// trusting the jersey match meant Stirna's entry silently overwrote
// Fjodorovs's, and because a (wrong) jersey match was found at all, the
// name-based fallback below never even got a chance to run for his row.
// Excluding the ambiguous key here forces BOTH of their protocol rows to
// fall through to name matching instead, where "Jānis Fjodorovs" and
// "Valters Stirna" are unambiguous. Same principle either way: the
// protocol PDF is the ground truth for who actually played - anything
// else (WP roster data, which team was entered as home/away, ...)
// disagreeing with it is assumed to be the mistake, not the PDF.
function dedupeAmbiguousKeys(entries) {
  const counts = {}
  entries.forEach(([key]) => {
    if (key) counts[key] = (counts[key] || 0) + 1
  })
  return entries.filter(([key]) => key && counts[key] === 1)
}

// Rosters reflect the team's CURRENT roster, not necessarily the exact
// roster on the day of an old game - an accepted approximation, same
// one the rest of the site already makes.
export function buildJerseyMap(teamId, teamDetails) {
  const roster = teamDetails[teamId]?.roster || []
  const entries = roster.map((p) => [jerseyKey(p.number), { playerId: p.player_id, name: p.name, group: p.group }])
  return Object.fromEntries(dedupeAmbiguousKeys(entries))
}

export function lookupJersey(jerseyMap, jersey) {
  const key = jerseyKey(jersey)
  return key ? jerseyMap[key] || null : null
}

// Builds a jersey map scoped to what THIS protocol actually printed
// (from an already name-resolved roster - see resolveTeamPlayers),
// rather than the team's current WP roster. Goal/penalty jersey
// references within the same game must be resolved against this, not
// the global WP jerseyMap directly, so a mid-season number change is
// only ever a problem once (at roster-resolution time) instead of
// silently failing again for every goal/penalty that player was
// involved in. Same ambiguous-key exclusion as buildJerseyMap - if two
// resolved players on the same team normalize to the same jersey key
// (e.g. "7" and "07"), a bare jersey number on a goal/penalty row can't
// safely be attributed to either, so it's left unresolved rather than
// guessed.
export function buildLocalJerseyMap(resolvedPlayers) {
  const entries = resolvedPlayers
    .filter((p) => p.playerId)
    .map((p) => [jerseyKey(p.jersey), { playerId: p.playerId, name: p.name, group: p.group }])
  return Object.fromEntries(dedupeAmbiguousKeys(entries))
}

// Some protocols append an annotation straight into the name cell (seen:
// "Mārtiņš Skrundenieks (vārtsargs)" for a goalie who is, elsewhere,
// plainly "Mārtiņš Skrundenieks") - stripped before comparing.
const normalizeName = (name) =>
  (name || '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

export function buildNameMap(teamId, teamDetails) {
  const roster = teamDetails[teamId]?.roster || []
  return Object.fromEntries(
    roster.map((p) => [normalizeName(p.name), { playerId: p.player_id, name: p.name, group: p.group }]),
  )
}

// Some players who appear on a protocol (guests/loans for that game)
// have a real WP player post but were never added to ANY team's
// roster listing - confirmed by checking (e.g. "Intars Sproģis" exists
// in the site-wide players map but isn't in any team_details roster).
// Falls back to this as a last resort - group is unknown (null) since
// there's no roster entry to read it from.
export function buildGlobalNameMap(players) {
  const map = {}
  Object.entries(players || {}).forEach(([id, name]) => {
    map[normalizeName(name)] = { playerId: Number(id), name, group: null }
  })
  return map
}

// Attaches { playerId, group } to every entry in a parsed team's roster
// list (parsed.teamA.players / parsed.teamB.players). Tries the printed
// NAME first, falling back to jersey number only if no name match exists.
// Confirmed on real games (937, 962, 976): Ventspils Puikas' current WP
// roster has Alens Bergmanis wearing #11, but #11 was Ričards Rikords in
// game 937 and Romāns Garders in games 962/976 - jersey numbers get
// reassigned between seasons, so jersey-first silently attributed three
// separate players' goals/penalties to whoever wears that number TODAY,
// even though the protocol printed the correct name right there on the
// row. A name mismatch (typo/formatting) still falls through to jersey,
// which is why that fallback stays. `resolvedVia` is kept for
// transparency in dry-run notes, not used functionally.
export function resolveTeamPlayers(players, jerseyMap, nameMap, globalNameMap = {}) {
  return players.map((p) => {
    const byName = nameMap[normalizeName(p.name)]
    const byJersey = byName ? null : lookupJersey(jerseyMap, p.jersey)
    const byGlobalName = byName || byJersey ? null : globalNameMap[normalizeName(p.name)]
    const match = byName || byJersey || byGlobalName
    return {
      ...p,
      playerId: match?.playerId ?? null,
      group: match?.group ?? null,
      resolvedVia: byName ? 'name' : byJersey ? 'jersey' : byGlobalName ? 'global-name' : null,
    }
  })
}
