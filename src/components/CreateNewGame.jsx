import { useState } from 'react'
import { createNewGamePreview, createNewGameSave, openExternal } from '../api'
import { BoxScoreTable, GoalsList, PenaltiesList } from './GameSummary'

// Best-effort only - just saves a click when the protocol's printed
// venue name happens to match an existing one exactly (case/whitespace
// aside). Never assumed correct without the admin seeing/confirming it
// in the dropdown - this only pre-selects, it doesn't skip the picker.
function guessVenueId(venues, printedVenue) {
  if (!printedVenue) return ''
  const norm = (s) => s.trim().toLowerCase()
  const match = venues.find((v) => norm(v.name) === norm(printedVenue))
  return match?.id || ''
}

// Local datetime-input helper: "YYYY-MM-DDTHH:MM" <-> "YYYY-MM-DD HH:MM:SS"
function toDatetimeLocal(date, time) {
  if (!date) return ''
  return `${date}T${time || '00:00'}`
}
function fromDatetimeLocal(value) {
  if (!value) return ''
  return value.replace('T', ' ') + ':00'
}

const EMPTY_LOOKUPS = { seasonCombos: [], teams: [], venues: [] }

export default function CreateNewGame({ filePath, parsedTeams, meta, lookups = EMPTY_LOOKUPS, initialSeasonIndex, onCancel }) {
  const [error, setError] = useState(null)

  const [mappedA, setMappedA] = useState('')
  const [mappedB, setMappedB] = useState('')
  const [homeIsA, setHomeIsA] = useState(true)
  // Carries over the season already picked before upload (App.jsx's
  // "Visas sezonas" selector) so it doesn't need choosing twice -
  // still just a default, the dropdown below stays fully editable.
  const [seasonIndex, setSeasonIndex] = useState(initialSeasonIndex || '')
  const [venueId, setVenueId] = useState(() => guessVenueId(lookups.venues, meta?.venue))
  const [kickoff, setKickoff] = useState(() => toDatetimeLocal(meta?.date, meta?.time))

  const [loadingPreview, setLoadingPreview] = useState(false)
  const [preview, setPreview] = useState(null)
  const [saveState, setSaveState] = useState('idle')
  const [saveResult, setSaveResult] = useState(null)

  const canPreview = mappedA && mappedB && mappedA !== mappedB && seasonIndex !== '' && venueId && kickoff
  const homeTeamId = homeIsA ? mappedA : mappedB
  const awayTeamId = homeIsA ? mappedB : mappedA

  async function handlePreview() {
    setLoadingPreview(true)
    setError(null)
    try {
      const result = await createNewGamePreview({ filePath, homeTeamId, awayTeamId, aIsHome: homeIsA })
      setPreview(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingPreview(false)
    }
  }

  async function handleCreate() {
    setSaveState('saving')
    try {
      const result = await createNewGameSave({
        seasonCombo: lookups.seasonCombos[seasonIndex],
        homeTeamId,
        awayTeamId,
        venueId,
        kickoff: fromDatetimeLocal(kickoff),
        gameFields: preview.gameFields,
        payload: preview.payload,
      })
      setSaveState('saved')
      setSaveResult(result)
    } catch (err) {
      setSaveState('failed')
      setSaveResult(err.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-line rounded-lg p-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black uppercase text-ink tracking-wide">Izveidot jaunu spēli</h2>
          <p className="text-ink-faint text-sm mt-1">
            Protokolā: <span className="text-ink font-semibold">{parsedTeams.a}</span> vs{' '}
            <span className="text-ink font-semibold">{parsedTeams.b}</span>
            {meta?.date && <> &middot; {meta.date} {meta.time}</>}
            {meta?.venue && <> &middot; {meta.venue}</>}
          </p>
        </div>
      </div>

      {!preview && (
        <div className="bg-card border border-line rounded-lg p-6 space-y-4">
          <Field label={`Kas ir "${parsedTeams.a}"?`}>
            <TeamSelect teams={lookups.teams} value={mappedA} onChange={setMappedA} />
          </Field>
          <Field label={`Kas ir "${parsedTeams.b}"?`}>
            <TeamSelect teams={lookups.teams} value={mappedB} onChange={setMappedB} />
          </Field>
          <button
            type="button"
            onClick={() => openExternal('https://lach.lv/wp-admin/post-new.php?post_type=sl_team')}
            className="text-accent text-xs font-semibold hover:underline"
          >
            Komandas nav sarakstā? Izveidot jaunu komandu WP-Admin
          </button>

          {mappedA && mappedB && mappedA !== mappedB && (
            <Field label="Mājās spēlēja">
              <select
                value={homeIsA ? 'a' : 'b'}
                onChange={(e) => setHomeIsA(e.target.value === 'a')}
                className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
              >
                <option value="a">{lookups.teams.find((t) => t.id === mappedA)?.name}</option>
                <option value="b">{lookups.teams.find((t) => t.id === mappedB)?.name}</option>
              </select>
            </Field>
          )}

          <Field label="Sezona / turnīrs">
            <select
              value={seasonIndex}
              onChange={(e) => setSeasonIndex(e.target.value)}
              className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Izvēlies...</option>
              {lookups.seasonCombos.map((s, i) => (
                <option key={s.seasonId} value={i}>
                  {s.seasonName} ({s.tournamentName})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Vieta">
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Izvēlies...</option>
              {lookups.venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            onClick={() => openExternal('https://lach.lv/wp-admin/post-new.php?post_type=sl_venue')}
            className="text-accent text-xs font-semibold hover:underline -mt-2"
          >
            Vietas nav sarakstā? Izveidot jaunu vietu WP-Admin
          </button>

          <Field label="Datums un laiks">
            <input
              type="datetime-local"
              value={kickoff}
              onChange={(e) => setKickoff(e.target.value)}
              className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePreview}
              disabled={!canPreview || loadingPreview}
              className="bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {loadingPreview ? 'Apstrādā...' : 'Priekšskatīt'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="bg-card border border-line-strong text-ink-secondary hover:border-accent hover:text-ink font-bold uppercase text-xs tracking-wide px-6 py-3 rounded-lg transition-colors"
            >
              Atcelt
            </button>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      )}

      {preview && (
        <>
          <div className="bg-card border border-line rounded-lg p-4 text-center">
            <h2 className="text-xl font-black uppercase text-ink">
              {preview.homeTeam.name}{' '}
              <span className="text-accent font-black">
                {preview.preview.finalScore.home}:{preview.preview.finalScore.away}
              </span>{' '}
              {preview.awayTeam.name}
            </h2>
          </div>

          {preview.goalCountMatchesProtocol === false && (
            <div className="bg-red-950/40 border border-red-600/40 text-red-300 text-sm rounded-lg px-4 py-3">
              Protokola paškontrole neatbilst: itemizēto vārtu skaits nesakrīt ar protokolā uzdrukāto kopsummu. Pārbaudi rūpīgi.
            </div>
          )}
          {preview.notes.length > 0 && (
            <div className="bg-amber-950/40 border border-amber-600/40 text-amber-300 text-sm rounded-lg px-4 py-3 space-y-1">
              {preview.notes.map((n, i) => (
                <p key={i}>&bull; {n}</p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BoxScoreTable title={preview.homeTeam.name} rows={preview.preview.boxScoreHome} />
            <BoxScoreTable title={preview.awayTeam.name} rows={preview.preview.boxScoreAway} />
          </div>
          <GoalsList goals={preview.preview.goals} homeTeam={preview.homeTeam.name} awayTeam={preview.awayTeam.name} />
          <PenaltiesList penalties={preview.preview.penalties} homeTeam={preview.homeTeam.name} awayTeam={preview.awayTeam.name} />

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={saveState === 'saving' || saveState === 'saved'}
              className="bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {saveState === 'saving' ? 'Izveido...' : 'Izveidot spēli'}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={saveState === 'saving'}
              className="bg-card border border-line-strong text-ink-secondary hover:border-accent hover:text-ink font-bold uppercase text-xs tracking-wide px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              Labot izvēli
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={saveState === 'saving'}
              className="bg-card border border-line-strong text-ink-secondary hover:border-accent hover:text-ink font-bold uppercase text-xs tracking-wide px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {saveState === 'saved' ? 'Augšupielādēt citu' : 'Atcelt'}
            </button>
            {saveState === 'saved' && (
              <span className="text-emerald-400 text-sm font-semibold">
                Izveidots! Spēles ID: {saveResult.game_id}
              </span>
            )}
            {saveState === 'failed' && <span className="text-red-400 text-sm font-semibold">Neizdevās: {saveResult}</span>}
            {saveState === 'saved' && (
              <button
                type="button"
                onClick={() => openExternal(`https://lach.lv/games/${saveResult.game_id}`)}
                className="ml-auto bg-emerald-600 text-white font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-emerald-500 transition-colors"
              >
                Skatīt spēli mājaslapā
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">{label}</label>
      {children}
    </div>
  )
}

function TeamSelect({ teams, value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
    >
      <option value="">Izvēlies...</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  )
}
