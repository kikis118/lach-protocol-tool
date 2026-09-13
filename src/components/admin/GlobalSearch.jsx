import { useMemo, useState } from 'react'
import { openExternal } from '../../api'
import { Panel, TextInput, SecondaryButton } from './AdminUI'

const MAX_RESULTS_PER_TYPE = 20

// Diacritic-insensitive matching - "liepaja" should find "Liepāja" typed
// with real Latvian letters, and vice versa, since not everyone types
// diacritics on a normal keyboard. NFD decomposes each accented letter
// into its base letter + a combining mark (ā -> a + ˉ, š -> s + ˇ, etc -
// true for every Latvian special character: āčēģīķļņšūž), then the
// combining-marks range is stripped, leaving plain ASCII to compare.
const COMBINING_MARKS = /[̀-ͯ]/g
function normalizeText(s) {
  return (s || '').normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
}

// Always-visible search widget on the home screen (not a screen of its
// own to navigate into - per explicit ask, "a reactive search bar that
// shows items as I type" sitting right on the dashboard) across every
// entity this app knows about, each result jumping straight into the
// right editor. Built to replace "Diagnostika" as the main day-to-day way
// to find and fix something.
//
// Not every entity type has an in-app editor yet: a FINISHED game's own
// recorded stats can't be re-edited here (only a not-yet-played game's
// schedule, or entering a brand new result) - those fall back to opening
// the WP-Admin edit page directly, same as the rest of this app already
// does elsewhere, rather than pretending an editor exists. Venues have no
// in-app editor at all yet, same fallback.
export default function GlobalSearch({ lookups, onNavigate }) {
  const [query, setQuery] = useState('')

  const teams = lookups?.teams || []
  const players = lookups?.players || []
  const venues = lookups?.venues || []
  const games = lookups?.games || []
  const teamName = (id) => teams.find((t) => String(t.id) === String(id))?.name || `#${id}`

  const q = normalizeText(query.trim())
  const results = useMemo(() => {
    if (q.length < 2) return null
    const matchTeams = teams.filter((t) => normalizeText(t.name).includes(q)).slice(0, MAX_RESULTS_PER_TYPE)
    const matchPlayers = players.filter((p) => normalizeText(p.name).includes(q)).slice(0, MAX_RESULTS_PER_TYPE)
    const matchVenues = venues.filter((v) => normalizeText(v.name).includes(q)).slice(0, MAX_RESULTS_PER_TYPE)
    const matchGames = games
      .filter((g) => normalizeText(`${teamName(g.home_team)} ${teamName(g.away_team)}`).includes(q))
      .slice(0, MAX_RESULTS_PER_TYPE)
    return { teams: matchTeams, players: matchPlayers, venues: matchVenues, games: matchGames }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, teams, players, venues, games])

  const totalCount = results
    ? results.teams.length + results.players.length + results.venues.length + results.games.length
    : 0

  return (
    <div className="space-y-3">
      <TextInput value={query} onChange={setQuery} placeholder="🔎 Meklēt komandu, spēlētāju, spēli, vietu..." />
      {q.length > 0 && q.length < 2 && <p className="text-ink-faint text-xs">Ieraksti vismaz 2 simbolus.</p>}

      {results && (
        <div className="space-y-3">
          {totalCount === 0 && (
            <Panel>
              <p className="text-ink-faint text-sm">Nekas netika atrasts.</p>
            </Panel>
          )}

          {results.teams.length > 0 && (
            <Panel>
              <h3 className="text-sm font-black uppercase text-ink-faint tracking-wide">Komandas</h3>
              <div className="space-y-1.5">
                {results.teams.map((t) => (
                  <ResultRow key={t.id} label={t.name}>
                    <SecondaryButton
                      className="px-3 py-1.5"
                      onClick={() => onNavigate('roster', { initialTeamId: t.id })}
                      title="Atver sastāvu (pēc noklusējuma - pašreizējā sezona)"
                    >
                      Sastāvs
                    </SecondaryButton>
                    <SecondaryButton className="px-3 py-1.5" onClick={() => onNavigate('teamEditor', { initialTeamId: t.id })}>
                      Nosaukums/logo
                    </SecondaryButton>
                  </ResultRow>
                ))}
              </div>
            </Panel>
          )}

          {results.players.length > 0 && (
            <Panel>
              <h3 className="text-sm font-black uppercase text-ink-faint tracking-wide">Spēlētāji</h3>
              <div className="space-y-1.5">
                {results.players.map((p) => (
                  <ResultRow key={p.id} label={p.name} sublabel={p.currentTeamId ? teamName(p.currentTeamId) : 'Nav zināma komanda'}>
                    <SecondaryButton
                      className="px-3 py-1.5"
                      disabled={!p.currentTeamId}
                      title={p.currentTeamId ? undefined : 'Nav zināms, kurai komandai šis spēlētājs pieder'}
                      onClick={() => onNavigate('roster', { initialTeamId: p.currentTeamId })}
                    >
                      Rediģēt
                    </SecondaryButton>
                  </ResultRow>
                ))}
              </div>
            </Panel>
          )}

          {results.games.length > 0 && (
            <Panel>
              <h3 className="text-sm font-black uppercase text-ink-faint tracking-wide">Spēles</h3>
              <div className="space-y-1.5">
                {results.games.map((g) => (
                  <ResultRow
                    key={g.game_id}
                    label={`${teamName(g.home_team)} vs ${teamName(g.away_team)}`}
                    sublabel={g.kickoff}
                  >
                    {g.finished !== '1' ? (
                      <SecondaryButton className="px-3 py-1.5" onClick={() => onNavigate('schedule', { initialGameId: g.game_id })}>
                        Labot grafiku
                      </SecondaryButton>
                    ) : (
                      <SecondaryButton
                        className="px-3 py-1.5"
                        onClick={() => openExternal(`https://lach.lv/wp-admin/post.php?post=${g.game_id}&action=edit`)}
                        title="Pabeigtas spēles rezultātu šis rīks pārrediģēt vēl neprot - atver WP-Admin"
                      >
                        WP-Admin ↗
                      </SecondaryButton>
                    )}
                  </ResultRow>
                ))}
              </div>
            </Panel>
          )}

          {results.venues.length > 0 && (
            <Panel>
              <h3 className="text-sm font-black uppercase text-ink-faint tracking-wide">Vietas</h3>
              <div className="space-y-1.5">
                {results.venues.map((v) => (
                  <ResultRow key={v.id} label={v.name}>
                    <SecondaryButton
                      className="px-3 py-1.5"
                      onClick={() => openExternal(`https://lach.lv/wp-admin/post.php?post=${v.id}&action=edit`)}
                      title="Vietu rediģēšana vēl nav šī rīka daļa - atver WP-Admin"
                    >
                      WP-Admin ↗
                    </SecondaryButton>
                  </ResultRow>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}

function ResultRow({ label, sublabel, children }) {
  return (
    <div className="flex items-center gap-3 bg-surface border border-line-strong rounded-md px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-ink text-sm font-semibold truncate">{label}</p>
        {sublabel && <p className="text-ink-faint text-xs truncate">{sublabel}</p>}
      </div>
      {children}
    </div>
  )
}
