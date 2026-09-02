// Counterpart to buildPreview.mjs for a game that doesn't exist in WP
// at all yet ("walk-in subtourney" case) - kept as its OWN file rather
// than adding branches to buildPreview.mjs, since that one is proven
// against every real game on the live site and this path has a
// genuinely different shape of problem: there's no existing `game`
// object to resolve teams against (resolveTeamId matches a printed name
// against a KNOWN game's home_team/away_team - there is no such game
// yet), the admin picks the two teams directly instead. Some overlap
// with buildPreview.mjs is a deliberate tradeoff for keeping the
// already-working path untouched and easy to reason about on its own.

import {
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

// homeTeamId/awayTeamId: which parsed side (A/B) maps to which real WP
// team - decided by the admin in the "create new game" form, not
// inferred, since (unlike the existing-game path) there's nothing to
// cross-check the protocol's own A/B order against.
// aIsHome: true if parsed.teamA is the home team.
export function buildNewGamePreview(parsed, { homeTeamId, awayTeamId, aIsHome }, teamDetails, players) {
  const homeSide = aIsHome ? 'A' : 'B'
  const awaySide = aIsHome ? 'B' : 'A'

  const globalNameMap = buildGlobalNameMap(players)
  const rosterA = resolveTeamPlayers(parsed.teamA.players, buildJerseyMap(homeTeamId, teamDetails), buildNameMap(homeTeamId, teamDetails), globalNameMap)
  const rosterB = resolveTeamPlayers(parsed.teamB.players, buildJerseyMap(awayTeamId, teamDetails), buildNameMap(awayTeamId, teamDetails), globalNameMap)
  // NOTE: rosterA is resolved against whichever team_id parsed.teamA
  // actually is - if aIsHome is false, "rosterA" is the AWAY roster.
  // Kept as A/B (matching the parsed side) rather than renaming to
  // home/away here, so the buildJerseyMap(homeTeamId, ...) call above
  // needs the RIGHT team id per side:
  const rosterHome = aIsHome ? rosterA : rosterB
  const rosterAway = aIsHome ? rosterB : rosterA
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

  const finalScore = {
    home: goals.filter((g) => g.isHome).length,
    away: goals.filter((g) => !g.isHome).length,
  }

  // Shootout decides the game (any shootout goal at all means it went
  // to a shootout - see parseProtocol.mjs's isShootout notes) -> pen_win
  // /pen_loss (2/1 points, standard IIHF-style scoring, confirmed against
  // every real shootout game already on the site - see
  // PROJECT-NOTES.md). Otherwise a plain regulation decision -> ft_win/
  // ft_loss (2/0). A tie is not a real possibility in this sport.
  const wentToShootout = parsed.goals.some((g) => g.isShootout)
  const homeWon = finalScore.home > finalScore.away
  const homeOutcome = wentToShootout ? (homeWon ? 'pen_win' : 'pen_loss') : homeWon ? 'ft_win' : 'ft_loss'
  const awayOutcome = wentToShootout ? (homeWon ? 'pen_loss' : 'pen_win') : homeWon ? 'ft_loss' : 'ft_win'
  const POINTS_BY_OUTCOME = { ft_win: 2, pen_win: 2, pen_loss: 1, ft_loss: 0 }
  const pointsFor = (outcome) => POINTS_BY_OUTCOME[outcome]

  return {
    preview: {
      finalScore,
      periodScores: null, // not knowable without an existing game's own footer parse pass - see meta.periodScores if needed later
      boxScoreHome: boxScoreFor(rosterHome, homeSide, parsed.goals, parsed.penalties, homeStats.payload),
      boxScoreAway: boxScoreFor(rosterAway, awaySide, parsed.goals, parsed.penalties, awayStats.payload),
      goals,
      penalties,
    },
    gameFields: {
      home_scores: finalScore.home,
      away_scores: finalScore.away,
      home_outcome: homeOutcome,
      away_outcome: awayOutcome,
      home_points: pointsFor(homeOutcome),
      away_points: pointsFor(awayOutcome),
    },
    payload: {
      _sl_player_stats_home: homeStats.payload,
      _sl_player_stats_away: awayStats.payload,
      _sl_players_home: homePlayers.payload,
      _sl_players_away: awayPlayers.payload,
    },
    notes: [...statsA.notes, ...statsB.notes, ...playersA.notes, ...playersB.notes],
    goalCountMatchesProtocol: parsed.qa.goalCountMatches,
  }
}
