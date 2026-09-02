import { resolveTeamId } from './resolveRoster.mjs'

// Uploaded protocols don't come with a known game_id (unlike
// lach-hockey-app's wp-autofill.mjs, which starts from an already-known
// WP game and downloads ITS linked protocol) - this has to work the
// other way around: given what the protocol itself printed (date, two
// team names), find which live WP game it must be.
//
// Primary signal is date + both team names resolving against that game's
// home/away teams (resolveTeamId already handles the "HK" prefix/casing
// differences - see resolveRoster.mjs). Falls back to team-names-only
// (no date) if the protocol's date line couldn't be parsed, or if
// nothing matched on that exact date - a wider net that may return
// several candidates across seasons, which is fine: the caller always
// checks candidates.length === 1 before treating it as a confident
// auto-match, and shows a picker otherwise.
export function findMatchingGames({ date, teamAName, teamBName }, games, teams) {
  const byTeams = (pool) =>
    pool.filter((g) => {
      const a = resolveTeamId(teamAName, g, teams)
      const b = resolveTeamId(teamBName, g, teams)
      return a && b && a !== b
    })

  if (date) {
    const sameDate = games.filter((g) => (g.kickoff || '').slice(0, 10) === date)
    const matches = byTeams(sameDate)
    if (matches.length > 0) return { matches, scope: 'date+teams' }
  }

  return { matches: byTeams(games), scope: 'teams-only' }
}
