// Same computation as lach-hockey-app's scripts/wp-autofill.mjs
// buildReportForGame() (jersey/name resolution, shootout-exclusion,
// goalie goals_allowed attribution, WP field payload shape) - ported
// rather than imported since the two projects are deliberately separate
// repos (this one has no dependency on lach-hockey-app's own source).
// Additionally builds a human-readable `preview` (real names, not just
// WP's compact player-id/code payload) for the upload tool's UI to
// render - the payload alone is enough to WRITE the game, but not enough
// to show someone what's about to be written.

import {
  resolveTeamId,
  buildJerseyMap,
  buildNameMap,
  buildGlobalNameMap,
  resolveTeamPlayers,
  buildLocalJerseyMap,
  lookupJersey,
} from './resolveRoster.mjs'
import { buildPlayerStatsPayload, buildPlayersPayload } from './buildWpPayload.mjs'

function statsFor(playerId, goals, penalties, side) {
  const g = goals.filter((row) => row.team === side && row.scorerPlayerId === playerId && !row.isShootout).length
  const a = goals.filter(
    (row) => row.team === side && !row.isShootout && (row.assist1PlayerId === playerId || row.assist2PlayerId === playerId),
  ).length
  const pim = penalties
    .filter((row) => row.team === side && row.penalizedPlayerId === playerId)
    .reduce((sum, row) => sum + (row.minutes || 0), 0)
  return { goals: g, assists: a, points: g + a, pim }
}

// team: resolved roster array (see resolveTeamPlayers). Builds the
// human-readable box score rows this tool's preview UI renders -
// separate from buildPlayerStatsPayload's compact WP-field shape, which
// exists purely for the actual write. goalsAllowed is read straight back
// out of that already-computed payload (code 12) rather than
// recalculated here, so the preview can never disagree with what's
// actually about to be written - including the "left unset, ambiguous
// goalie" case, which then correctly shows as "—" in the preview too.
function boxScoreFor(team, side, goals, penalties, statsPayload) {
  return team.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    jersey: p.jersey,
    group: p.group,
    resolvedVia: p.resolvedVia,
    goalsAllowed: p.playerId ? statsPayload[`${p.playerId}-12`] ?? null : null,
    ...statsFor(p.playerId, goals, penalties, side),
  }))
}

// meta: parseProtocolMeta(items)'s output (date/time/venue/periodScores)
// - periodScores is keyed by the protocol's own A/B side, same as every
// other per-side field here, so it needs the same home/away remapping.
export function buildPreview(parsed, game, teams, teamDetails, players, meta = {}) {
  const teamIdA = resolveTeamId(parsed.teamA.name, game, teams)
  const teamIdB = resolveTeamId(parsed.teamB.name, game, teams)
  if (!teamIdA || !teamIdB) {
    throw new Error(`Could not match "${parsed.teamA.name}"/"${parsed.teamB.name}" to this game's home/away teams`)
  }

  const globalNameMap = buildGlobalNameMap(players)
  const rosterA = resolveTeamPlayers(parsed.teamA.players, buildJerseyMap(teamIdA, teamDetails), buildNameMap(teamIdA, teamDetails), globalNameMap)
  const rosterB = resolveTeamPlayers(parsed.teamB.players, buildJerseyMap(teamIdB, teamDetails), buildNameMap(teamIdB, teamDetails), globalNameMap)
  const localJerseyMapA = buildLocalJerseyMap(rosterA)
  const localJerseyMapB = buildLocalJerseyMap(rosterB)

  const resolveJersey = (side, jersey) => {
    const map = side === 'A' ? localJerseyMapA : localJerseyMapB
    return lookupJersey(map, jersey)?.playerId ?? null
  }
  parsed.goals.forEach((g) => {
    g.scorerPlayerId = resolveJersey(g.team, g.scorerJersey)
    g.assist1PlayerId = resolveJersey(g.team, g.assist1Jersey)
    g.assist2PlayerId = resolveJersey(g.team, g.assist2Jersey)
  })
  parsed.penalties.forEach((p) => {
    p.penalizedPlayerId = resolveJersey(p.team, p.jersey)
  })

  const shootoutGoalsA = parsed.goals.filter((g) => g.team === 'A' && g.isShootout).length
  const shootoutGoalsB = parsed.goals.filter((g) => g.team === 'B' && g.isShootout).length
  const goalsForA = parsed.goals.filter((g) => g.team === 'A').length - shootoutGoalsA
  const goalsForB = parsed.goals.filter((g) => g.team === 'B').length - shootoutGoalsB

  const statsA = buildPlayerStatsPayload(rosterA, 'A', parsed.goals, parsed.penalties, goalsForB, parsed.goalieChanges)
  const statsB = buildPlayerStatsPayload(rosterB, 'B', parsed.goals, parsed.penalties, goalsForA, parsed.goalieChanges)
  const playersA = buildPlayersPayload(rosterA)
  const playersB = buildPlayersPayload(rosterB)

  // Same "protocol's own A/B never reliably matches WP's home/away"
  // caveat as wp-autofill.mjs - teamIdA/teamIdB are already correctly
  // resolved above, that's what decides home vs away, never the
  // protocol's own printed order.
  const aIsHome = String(teamIdA) === String(game.home_team)
  const homeTeamId = aIsHome ? teamIdA : teamIdB
  const awayTeamId = aIsHome ? teamIdB : teamIdA
  const homeSide = aIsHome ? 'A' : 'B'
  const awaySide = aIsHome ? 'B' : 'A'
  const homeRoster = aIsHome ? rosterA : rosterB
  const awayRoster = aIsHome ? rosterB : rosterA
  const homeStats = aIsHome ? statsA : statsB
  const awayStats = aIsHome ? statsB : statsA
  const homePlayers = aIsHome ? playersA : playersB
  const awayPlayers = aIsHome ? playersB : playersA

  const nameFor = (side, jersey) => {
    const map = side === 'A' ? localJerseyMapA : localJerseyMapB
    return lookupJersey(map, jersey)?.name ?? null
  }

  const goals = parsed.goals.map((g) => ({
    isHome: g.team === homeSide,
    time: g.time,
    situation: g.situation,
    isShootout: g.isShootout,
    scorerName: nameFor(g.team, g.scorerJersey) || g.scorerName,
    assist1Name: g.assist1Jersey ? nameFor(g.team, g.assist1Jersey) || g.assist1Name : null,
    assist2Name: g.assist2Jersey ? nameFor(g.team, g.assist2Jersey) || g.assist2Name : null,
  }))

  const penalties = parsed.penalties.map((p) => ({
    isHome: p.team === homeSide,
    penalizedName: p.jersey ? nameFor(p.team, p.jersey) || p.penalizedName : null,
    infraction: p.infraction,
    minutes: p.minutes,
    slStart: p.slStart,
    blEnd: p.blEnd,
  }))

  const periodScoresHome = meta.periodScores?.[homeSide] || null
  const periodScoresAway = meta.periodScores?.[awaySide] || null
  // The protocol's own printed footer total (periodScoresX.final) is the
  // real final score (includes a shootout-deciding goal, unlike
  // goalsForA/B above which deliberately excludes it for the season-stat
  // write) - falls back to a plain itemized goal count only if that
  // footer wasn't parseable for some reason, so the preview always shows
  // SOME score rather than none.
  const finalScore = {
    home: periodScoresHome?.final ?? goals.filter((g) => g.isHome).length,
    away: periodScoresAway?.final ?? goals.filter((g) => !g.isHome).length,
  }

  return {
    game_id: game.game_id,
    homeTeam: { name: teams[homeTeamId], team_id: homeTeamId },
    awayTeam: { name: teams[awayTeamId], team_id: awayTeamId },
    goalCountMatchesProtocol: parsed.qa.goalCountMatches,
    preview: {
      finalScore,
      periodScores: periodScoresHome && periodScoresAway ? { home: periodScoresHome, away: periodScoresAway } : null,
      boxScoreHome: boxScoreFor(homeRoster, homeSide, parsed.goals, parsed.penalties, homeStats.payload),
      boxScoreAway: boxScoreFor(awayRoster, awaySide, parsed.goals, parsed.penalties, awayStats.payload),
      goals,
      penalties,
    },
    payload: {
      _sl_player_stats_home: homeStats.payload,
      _sl_player_stats_away: awayStats.payload,
      _sl_players_home: homePlayers.payload,
      _sl_players_away: awayPlayers.payload,
    },
    notes: [...statsA.notes, ...statsB.notes, ...playersA.notes, ...playersB.notes],
  }
}
