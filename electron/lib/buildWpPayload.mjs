// Builds the exact WP/Sports League field payloads that would auto-fill
// a game's stats from its already-parsed protocol, instead of someone
// retyping every player's line by hand into WP admin.
//
// Field shapes below were NOT guessed - reverse-engineered from a real,
// already-filled-in "Edit Game" admin page (a genuine completed game),
// by reading the literal stored `value="..."` of each hidden input:
//
// _sl_player_stats_home / _sl_player_stats_away: a JSON object keyed
// "<player_id>-<code>", one key per NON-ZERO stat (a player with 0
// goals simply has no "<id>-2" key at all - confirmed: one player's
// entry was `{"805-0":1,"805-6":"1","805-15":"1"}`, no "805-2" because
// they didn't score). Codes confirmed against wp-snippets/full-data-v2.php
// AND the admin page's own column-definition JSON, which agree:
//   0  = games_played   (always present, value 1, as a raw JSON number)
//   2  = goals          (omitted if 0; value as a JSON STRING)
//   15 = assists        (omitted if 0; string)
//   16 = penalty_minutes (omitted if 0; string)
//   6  = points          (omitted if 0; string; goals+assists)
//   12 = goals_allowed   (goalies only - INCLUDED even when "0", unlike
//                         the skater codes above, since a real 0 there
//                         is meaningful - a shutout - not "no data")
// _sl_players_home / _sl_players_away: comma-separated player IDs with
// "_GroupName" markers inserted before each position group, e.g.
// "_Goalies,816,_Defense,800,809,806,812,_Forwards,805,813,820,...".

const CODE = { gamesPlayed: 0, goals: 2, points: 6, assists: 15, penaltyMinutes: 16, goalsAllowed: 12 }
const GROUP_ORDER = ['Goalies', 'Defense', 'Forwards']

// A team can carry more than one registered goalie on its WP roster
// (a backup who dressed but never played), which by itself doesn't say
// who actually stood in net for THIS game. The protocol's own "Vārtsargu
// Spēle" section (parsed as `goalieChanges` - one row per goalie
// entering the net, keyed by jersey) is the real answer. Only handles
// the no-substitution case (exactly one distinct jersey for this side
// across every row) - an actual mid-game goalie change would need each
// goal's time correlated against the change rows to split credit
// correctly, which isn't implemented, so that case still falls back to
// the safe "can't safely attribute" skip below rather than guessing.
function resolvePlayingGoalieJersey(goalieChanges, side) {
  if (!goalieChanges || goalieChanges.length === 0) return null
  const field = side === 'A' ? 'goalieAJersey' : 'goalieBJersey'
  const jerseys = new Set(goalieChanges.map((row) => row[field]).filter((j) => j !== null && j !== undefined && j !== ''))
  return jerseys.size === 1 ? [...jerseys][0] : null
}

// team: array of { playerId, jersey, name, group } - the protocol's
// roster for this team, already jersey-resolved to real WP player IDs.
// goals/penalties: this game's full parsed+resolved goals/penalties
// arrays (both teams mixed in, matching parseProtocol's output).
// opponentGoalCount: total REGULATION goals the OTHER team scored (a
// shootout winner already excluded by the caller) - used for a
// goalie's goals_allowed, but only when unambiguous (see notes below).
// goalieChanges: this game's parsed "Vārtsargu Spēle" rows (see
// resolvePlayingGoalieJersey above) - disambiguates which of 2+
// registered goalies on this team actually played net this game.
//
// Shootout goals (situation "PS") are deliberately excluded from every
// individual stat here - standard hockey convention counts a shootout
// winner toward the final score only, never toward a skater's season
// goals/assists or a goalie's GA/GAA. They're still shown in the game
// page's own scoring summary (see GameDetail.jsx), just not tallied
// into season stats.
export function buildPlayerStatsPayload(team, side, goals, penalties, opponentGoalCount, goalieChanges = null) {
  const payload = {}
  const notes = []
  const goalieJerseys = team.filter((p) => p.group === 'Goalies')
  const playingJersey = goalieJerseys.length > 1 ? resolvePlayingGoalieJersey(goalieChanges, side) : null

  team.forEach((p) => {
    if (!p.playerId) {
      notes.push(`"${p.name}" (jersey ${p.jersey ?? '?'}) has no matching WP player - skipped`)
      return
    }
    const g = goals.filter((row) => row.team === side && row.scorerPlayerId === p.playerId && !row.isShootout).length
    const a = goals.filter(
      (row) => row.team === side && !row.isShootout && (row.assist1PlayerId === p.playerId || row.assist2PlayerId === p.playerId),
    ).length
    const pim = penalties
      .filter((row) => row.team === side && row.penalizedPlayerId === p.playerId)
      .reduce((sum, row) => sum + (row.minutes || 0), 0)

    payload[`${p.playerId}-${CODE.gamesPlayed}`] = 1
    if (g > 0) payload[`${p.playerId}-${CODE.goals}`] = String(g)
    if (a > 0) payload[`${p.playerId}-${CODE.assists}`] = String(a)
    if (g + a > 0) payload[`${p.playerId}-${CODE.points}`] = String(g + a)
    if (pim > 0) payload[`${p.playerId}-${CODE.penaltyMinutes}`] = String(pim)

    if (p.group === 'Goalies') {
      if (goalieJerseys.length === 1) {
        payload[`${p.playerId}-${CODE.goalsAllowed}`] = String(opponentGoalCount)
      } else if (playingJersey !== null) {
        if (String(Number(p.jersey)) === String(Number(playingJersey))) {
          payload[`${p.playerId}-${CODE.goalsAllowed}`] = String(opponentGoalCount)
        } else {
          notes.push(`${goalieJerseys.length} goalies listed for this team, but the protocol's own "Vārtsargu Spēle" section confirms only jersey ${playingJersey} played net - "${p.name}" (jersey ${p.jersey}) dressed but didn't play, goals_allowed correctly left unset`)
        }
      } else {
        notes.push(`${goalieJerseys.length} goalies listed for this team - can't safely attribute goals_allowed, left unset for "${p.name}"`)
      }
    }
  })

  return { payload, notes }
}

// team: same shape as above (needs .group to sort into position blocks).
export function buildPlayersPayload(team) {
  const notes = []
  const parts = []
  GROUP_ORDER.forEach((group) => {
    const ids = team.filter((p) => p.group === group && p.playerId).map((p) => p.playerId)
    if (ids.length === 0) return
    parts.push(`_${group}`, ...ids)
  })
  const unresolved = team.filter((p) => !p.playerId)
  if (unresolved.length > 0) {
    notes.push(`${unresolved.length} player(s) not matched to a WP roster entry: ${unresolved.map((p) => p.name).join(', ')}`)
  }
  // Resolved via the site-wide player list rather than this team's own
  // roster (a real WP player, just never added to a team's roster) -
  // their stats ARE included above, but they have no known position
  // group, so they're left out of this comma list until someone adds
  // them to the team roster in WP (a one-time fix, not a per-game one).
  const ungrouped = team.filter((p) => p.playerId && !p.group)
  if (ungrouped.length > 0) {
    notes.push(`${ungrouped.length} player(s) resolved by name only, not on this team's WP roster (stats included, left out of the roster list): ${ungrouped.map((p) => p.name).join(', ')}`)
  }
  return { payload: parts.join(','), notes }
}
