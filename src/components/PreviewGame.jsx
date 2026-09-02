const SITUATION_LABEL = { PP1: 'PP', PP2: 'PP', SH1: 'SH', SH2: 'SH' }
const PERIOD_KEYS = ['p1', 'p2', 'p3']

function PeriodScoresTable({ periodScores, homeTeam, awayTeam }) {
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

function BoxScoreTable({ title, rows }) {
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

function GoalsList({ goals, homeTeam, awayTeam }) {
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

function PenaltiesList({ penalties, homeTeam, awayTeam }) {
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

export default function PreviewGame({ result, saveState, saveResult, onSave, onReset }) {
  const { homeTeam, awayTeam, preview, notes, alreadyHasData, alreadyHasDataCheckFailed, goalCountMatchesProtocol, game_id } = result

  return (
    <div className="space-y-4">
      <div className="bg-card border border-line rounded-lg p-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black uppercase text-ink">
            {homeTeam.name}{' '}
            <span className="text-accent font-black">
              {preview.finalScore.home}:{preview.finalScore.away}
            </span>{' '}
            {awayTeam.name}
          </h2>
          <p className="text-ink-faint text-xs mt-1">Spēles ID: {game_id}</p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-accent text-sm font-semibold hover:underline shrink-0"
        >
          Augšupielādēt citu
        </button>
      </div>

      {preview.periodScores && <PeriodScoresTable periodScores={preview.periodScores} homeTeam={homeTeam.name} awayTeam={awayTeam.name} />}

      {alreadyHasData && (
        <div className="bg-amber-950/40 border border-amber-600/40 text-amber-300 text-sm rounded-lg px-4 py-3">
          Šai spēlei WordPress jau ir saglabāti dati - saglabājot, tie tiks pārrakstīti.
        </div>
      )}
      {alreadyHasDataCheckFailed && (
        <div className="bg-red-950/40 border border-red-600/40 text-red-300 text-sm rounded-lg px-4 py-3">
          Neizdevās pārbaudīt, vai šai spēlei jau ir saglabāti dati - pārbaudi WP-Admin pašrocīgi pirms saglabāšanas.
        </div>
      )}
      {goalCountMatchesProtocol === false && (
        <div className="bg-red-950/40 border border-red-600/40 text-red-300 text-sm rounded-lg px-4 py-3">
          Protokola paškontrole neatbilst: itemizēto vārtu skaits nesakrīt ar protokolā uzdrukāto kopsummu. Pārbaudi rūpīgi.
        </div>
      )}
      {notes.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-600/40 text-amber-300 text-sm rounded-lg px-4 py-3 space-y-1">
          {notes.map((n, i) => (
            <p key={i}>&bull; {n}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BoxScoreTable title={homeTeam.name} rows={preview.boxScoreHome} />
        <BoxScoreTable title={awayTeam.name} rows={preview.boxScoreAway} />
      </div>

      <GoalsList goals={preview.goals} homeTeam={homeTeam.name} awayTeam={awayTeam.name} />
      <PenaltiesList penalties={preview.penalties} homeTeam={homeTeam.name} awayTeam={awayTeam.name} />

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saveState === 'saving'}
          className="bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
        >
          {saveState === 'saving' ? 'Saglabā...' : 'Saglabāt spēli'}
        </button>
        <a
          href={`https://lach.lv/wp-admin/post.php?post=${game_id}&action=edit`}
          target="_blank"
          rel="noreferrer"
          className="bg-card border border-line-strong text-ink-secondary hover:border-accent hover:text-ink font-bold uppercase text-xs tracking-wide px-6 py-3 rounded-lg transition-colors"
        >
          Rediģēt WP-Admin
        </a>
        {saveState === 'saved' && <span className="text-emerald-400 text-sm font-semibold">Saglabāts!</span>}
        {saveState === 'failed' && <span className="text-red-400 text-sm font-semibold">Neizdevās: {saveResult}</span>}
      </div>
    </div>
  )
}
