import { PeriodScoresTable, BoxScoreTable, GoalsList, PenaltiesList } from './GameSummary'

export default function PreviewGame({ result, saveState, saveResult, onSave, onReset, onOpenExternal }) {
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
        <button
          type="button"
          onClick={() => onOpenExternal(`https://lach.lv/wp-admin/post.php?post=${game_id}&action=edit`)}
          className="bg-card border border-line-strong text-ink-secondary hover:border-accent hover:text-ink font-bold uppercase text-xs tracking-wide px-6 py-3 rounded-lg transition-colors"
        >
          Rediģēt WP-Admin
        </button>
        {saveState === 'saved' && <span className="text-emerald-400 text-sm font-semibold">Saglabāts!</span>}
        {saveState === 'failed' && <span className="text-red-400 text-sm font-semibold">Neizdevās: {saveResult}</span>}
      </div>
    </div>
  )
}
