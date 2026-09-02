// Shared read-only display pieces for a parsed game's stats - used by
// both PreviewGame (existing-game path) and CreateNewGame (walk-in
// subtourney path), which otherwise compute the exact same shaped
// preview data (see buildPreview.mjs / buildNewGamePreview.mjs) and
// would just be duplicating this markup.

export const SITUATION_LABEL = { PP1: 'PP', PP2: 'PP', SH1: 'SH', SH2: 'SH' }
const PERIOD_KEYS = ['p1', 'p2', 'p3']

export function PeriodScoresTable({ periodScores, homeTeam, awayTeam }) {
  return (
    <div className="bg-card border border-line rounded-lg px-4 py-3">
      <table className="mx-auto text-sm text-ink-secondary">
        <thead>
          <tr className="text-xs uppercase text-ink-faint">
            <th className="pr-4 text-left font-semibold"></th>
            {PERIOD_KEYS.map((key) => (
              <th key={key} className="px-3 font-semibold text-center">{key.toUpperCase()}</th>
            ))}
            <th className="pl-3 font-semibold text-center text-ink">KOPĀ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="pr-4 text-left font-medium text-ink">{homeTeam}</td>
            {PERIOD_KEYS.map((key) => (
              <td key={key} className="px-3 text-center">{periodScores.home[key] ?? '—'}</td>
            ))}
            <td className="pl-3 text-center font-bold text-ink">{periodScores.home.final}</td>
          </tr>
          <tr>
            <td className="pr-4 text-left font-medium text-ink">{awayTeam}</td>
            {PERIOD_KEYS.map((key) => (
              <td key={key} className="px-3 text-center">{periodScores.away[key] ?? '—'}</td>
            ))}
            <td className="pl-3 text-center font-bold text-ink">{periodScores.away.final}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function BoxScoreTable({ title, rows }) {
  const goalies = rows.filter((r) => r.group === 'Goalies')
  const skaters = rows.filter((r) => r.group !== 'Goalies')

  return (
    <div className="bg-card border border-line rounded-lg overflow-hidden">
      <div className="bg-inset px-4 py-2 border-b border-line">
        <h3 className="text-accent font-bold text-sm uppercase tracking-wide">{title}</h3>
      </div>

      {goalies.length > 0 && (
        <table className="w-full text-left text-sm text-ink-secondary border-b border-line">
          <thead className="text-xs uppercase bg-surface text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Vārtsargs</th>
              <th className="px-3 py-2 font-semibold text-center">GA</th>
            </tr>
          </thead>
          <tbody>
            {goalies.map((r) => (
              <PlayerRow key={r.playerId ?? r.name} r={r} goalie />
            ))}
          </tbody>
        </table>
      )}

      <table className="w-full text-left text-sm text-ink-secondary">
        <thead className="text-xs uppercase bg-surface text-ink-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">#</th>
            <th className="px-3 py-2 font-semibold">Spēlētājs</th>
            <th className="px-3 py-2 font-semibold text-center">G</th>
            <th className="px-3 py-2 font-semibold text-center">A</th>
            <th className="px-3 py-2 font-semibold text-center">PIM</th>
          </tr>
        </thead>
        <tbody>
          {skaters.map((r) => (
            <PlayerRow key={r.playerId ?? r.name} r={r} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlayerRow({ r, goalie = false }) {
  const unresolved = !r.playerId
  return (
    <tr className={`border-b border-line last:border-b-0 ${unresolved ? 'bg-red-950/30' : ''}`}>
      {!goalie && <td className="px-3 py-2 text-ink-faint text-center">{r.jersey ?? '—'}</td>}
      <td className="px-3 py-2 font-medium text-ink">
        {r.name}
        {unresolved && <span className="ml-2 text-red-400 text-xs font-bold uppercase">nav atpazīts</span>}
      </td>
      {goalie ? (
        <td className="px-3 py-2 text-center font-bold text-ink">{r.goalsAllowed ?? '—'}</td>
      ) : (
        <>
          <td className="px-3 py-2 text-center">{r.goals}</td>
          <td className="px-3 py-2 text-center">{r.assists}</td>
          <td className="px-3 py-2 text-center">{r.pim}</td>
        </>
      )}
    </tr>
  )
}

export function GoalsList({ goals, homeTeam, awayTeam }) {
  if (goals.length === 0) return null
  return (
    <div className="bg-card border border-line rounded-lg overflow-hidden">
      <div className="bg-inset px-4 py-2 border-b border-line">
        <h3 className="text-accent font-bold text-sm uppercase tracking-wide">Vārti</h3>
      </div>
      <div className="divide-y divide-line">
        {goals.map((g, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="text-ink-faint text-xs w-14 shrink-0">{g.isShootout ? 'PS' : g.time}</span>
            <span className="flex-1 text-ink">
              <span className="font-semibold">{g.scorerName || '—'}</span>
              {(g.assist1Name || g.assist2Name) && (
                <span className="text-ink-faint"> ({[g.assist1Name, g.assist2Name].filter(Boolean).join(', ')})</span>
              )}
            </span>
            <span className="text-ink-faint text-xs w-24 shrink-0 text-right">{g.isHome ? homeTeam : awayTeam}</span>
            {SITUATION_LABEL[g.situation] && (
              <span className="text-[10px] font-bold uppercase text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 shrink-0">
                {SITUATION_LABEL[g.situation]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function PenaltiesList({ penalties, homeTeam, awayTeam }) {
  if (penalties.length === 0) return null
  return (
    <div className="bg-card border border-line rounded-lg overflow-hidden">
      <div className="bg-inset px-4 py-2 border-b border-line">
        <h3 className="text-accent font-bold text-sm uppercase tracking-wide">Sodi</h3>
      </div>
      <div className="divide-y divide-line">
        {penalties.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="text-ink">{p.penalizedName || <span className="text-ink-faint italic">(komandas sods)</span>}</span>
            <span className="text-ink-faint text-xs">{p.infraction} &middot; {p.minutes} min</span>
            <span className="text-ink-faint text-xs w-24 shrink-0 text-right">{p.isHome ? homeTeam : awayTeam}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
