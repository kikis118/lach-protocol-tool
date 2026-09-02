import { useState } from 'react'
import { PeriodScoresTable, BoxScoreTable, GoalsList, PenaltiesList } from './GameSummary'

export default function PreviewGame({ result, saveState, saveResult, onSave, onCancel, onOpenExternal }) {
  const { homeTeam, awayTeam, preview, notes, alreadyHasData, alreadyHasDataCheckFailed, goalCountMatchesProtocol, game_id, meta } = result

  const [baltichockeyUrl, setBaltichockeyUrl] = useState(result.existingBaltichockeyUrl || '')

  // Pre-filled from whatever's already saved on this game (a previous
  // upload), falling back to whatever this protocol's own best-effort
  // scan found (see parseProtocol.mjs's findBestPlayers - unverified
  // against a confirmed real layout) - always editable either way, and
  // left blank is a valid, saveable answer if the protocol has none.
  const initialBestPlayers = (result.existingBestPlayers?.length ? result.existingBestPlayers : meta?.bestPlayersParsed) || []
  const [bestPlayers, setBestPlayers] = useState([0, 1, 2].map((i) => initialBestPlayers[i] || ''))

  function setBestPlayer(i, value) {
    setBestPlayers((prev) => prev.map((v, idx) => (idx === i ? value : v)))
  }

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
          {meta?.date && (
            <p className="text-ink-faint text-xs mt-1">
              No protokola: {meta.date}
              {meta.time ? ` ${meta.time}` : ''}
              {meta.venue ? ` · ${meta.venue}` : ''}
            </p>
          )}
        </div>
      </div>

      {preview.periodScores && <PeriodScoresTable periodScores={preview.periodScores} homeTeam={homeTeam.name} awayTeam={awayTeam.name} />}

      <div className="bg-card border border-line rounded-lg p-4">
        <label className="block text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">
          Baltichockey saite
        </label>
        <input
          type="text"
          value={baltichockeyUrl}
          onChange={(e) => setBaltichockeyUrl(e.target.value)}
          placeholder="https://baltichockey.tv/..."
          className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
        />
      </div>

      <div className="bg-card border border-line rounded-lg p-4">
        <label className="block text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">
          Labākie spēlētāji
        </label>
        <p className="text-ink-faint text-xs mb-2">
          {meta?.bestPlayersParsed?.length
            ? 'Atrasts protokolā - pārbaudi un labo, ja nepieciešams.'
            : 'Protokolā nav atrasts - ievadi pašrocīgi, ja vēlies (nav obligāti).'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {bestPlayers.map((value, i) => (
            <input
              key={i}
              type="text"
              value={value}
              onChange={(e) => setBestPlayer(i, e.target.value)}
              placeholder={`Vārds, Uzvārds`}
              className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
            />
          ))}
        </div>
      </div>

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
          onClick={() => onSave({ baltichockeyUrl, bestPlayers })}
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
        <button
          type="button"
          onClick={onCancel}
          disabled={saveState === 'saving'}
          className="bg-card border border-line-strong text-ink-secondary hover:border-accent hover:text-ink font-bold uppercase text-xs tracking-wide px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
        >
          {saveState === 'saved' || saveState === 'failed' ? 'Augšupielādēt citu' : 'Atcelt'}
        </button>
        {saveState === 'saved' && <span className="text-emerald-400 text-sm font-semibold">Saglabāts!</span>}
        {saveState === 'failed' && <span className="text-red-400 text-sm font-semibold">Neizdevās: {saveResult}</span>}
      </div>
    </div>
  )
}
