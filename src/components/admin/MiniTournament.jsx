import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createMiniTournamentGames, resolveMiniTournamentGame } from '../../api'
import { loadDraft, saveDraft, clearDraft } from '../../adminDrafts'
import {
  Panel,
  Field,
  ScreenHeader,
  SelectInput,
  TeamSelect,
  VenueSelect,
  PrimaryButton,
  SecondaryButton,
  ErrorText,
  SuccessText,
  fromDatetimeLocal,
} from './AdminUI'

function blankRow() {
  return {
    id: crypto.randomUUID(),
    homeTeam: '',
    awayTeam: '',
    seedHome: '',
    seedAway: '',
    kickoff: '',
    venueId: '',
    roundId: '1',
    groupId: '1',
  }
}

const rowInputClass =
  'w-full min-w-0 bg-base border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent'
const rowLabelClass = 'block text-[10px] uppercase tracking-wide text-ink-faint font-semibold mb-1'
const DRAFT_KEY = 'miniTournament'

const MiniTournament = forwardRef(function MiniTournament({ lookups, onCancel }, ref) {
  const teams = lookups?.teams || []
  const venues = lookups?.venues || []
  const seasonCombos = lookups?.seasonCombos || []

  const [tab, setTab] = useState('create') // 'create' | 'resolve'

  // The only real typing investment here is CreateTab's row list, which
  // autosaves its own draft below (hasDraftSafety: true) - ResolveTab is
  // just two dropdown picks on an already-listed game, trivial to redo,
  // not worth tracking or warning about on its own.
  useImperativeHandle(ref, () => ({ isDirty: () => false, hasDraftSafety: () => true }))

  return (
    <div className="space-y-4">
      <ScreenHeader
        title="Izveidot playoff"
        subtitle='Izveidot spēles ar vēl nezināmu komandu (piem., "A grupas uzvarētājs") un vēlāk piesaistīt reālo komandu.'
        onCancel={onCancel}
      />
      <div className="flex gap-3">
        <SecondaryButton onClick={() => setTab('create')} className={tab === 'create' ? 'border-accent text-ink' : ''}>
          Izveidot spēles
        </SecondaryButton>
        <SecondaryButton onClick={() => setTab('resolve')} className={tab === 'resolve' ? 'border-accent text-ink' : ''}>
          Atrisināt komandas
        </SecondaryButton>
      </div>
      {tab === 'create' ? (
        <CreateTab teams={teams} venues={venues} seasonCombos={seasonCombos} />
      ) : (
        <ResolveTab lookups={lookups} teams={teams} />
      )}
    </div>
  )
})

export default MiniTournament

function CreateTab({ teams, venues, seasonCombos }) {
  const draft = loadDraft(DRAFT_KEY)
  const [seasonIndex, setSeasonIndex] = useState(draft?.seasonIndex ?? '')
  const [rows, setRows] = useState(draft?.rows || [blankRow()])
  const [error, setError] = useState(null)
  const [saveState, setSaveState] = useState('idle')
  const [saveResult, setSaveResult] = useState(null)

  const isFirstAutosaveRun = useRef(true)
  useEffect(() => {
    if (isFirstAutosaveRun.current) {
      isFirstAutosaveRun.current = false
      return
    }
    const timer = setTimeout(() => saveDraft(DRAFT_KEY, { seasonIndex, rows }), 500)
    return () => clearTimeout(timer)
  }, [seasonIndex, rows])

  function updateRow(id, patch) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((rs) => [...rs, blankRow()])
  }
  function removeRow(id) {
    setRows((rs) => rs.filter((r) => r.id !== id))
  }

  const validRows = rows.filter((r) => {
    if (!r.kickoff || r.homeTeam === '' || r.awayTeam === '') return false
    if (r.homeTeam === '0' && !r.seedHome.trim()) return false
    if (r.awayTeam === '0' && !r.seedAway.trim()) return false
    return true
  })
  const canSave = seasonIndex !== '' && validRows.length > 0

  async function handleSave() {
    setSaveState('saving')
    setError(null)
    try {
      const combo = seasonCombos[seasonIndex]
      const result = await createMiniTournamentGames({
        seasonId: combo.seasonId,
        tournamentId: combo.tournamentId,
        stageId: combo.stageId,
        leagueId: combo.leagueId,
        games: validRows.map((r) => ({
          home_team: r.homeTeam,
          away_team: r.awayTeam,
          seed_home: r.homeTeam === '0' ? r.seedHome.trim() : undefined,
          seed_away: r.awayTeam === '0' ? r.seedAway.trim() : undefined,
          kickoff: fromDatetimeLocal(r.kickoff),
          venue_id: r.venueId || undefined,
          round_id: r.roundId || undefined,
          group_id: r.groupId || undefined,
        })),
      })
      setSaveState('saved')
      setSaveResult(result)
      clearDraft(DRAFT_KEY)
    } catch (err) {
      setSaveState('failed')
      setError(err.message)
    }
  }

  return (
    <Panel>
      <Field label="Sezona / turnīrs">
        <SelectInput value={seasonIndex} onChange={setSeasonIndex}>
          <option value="">Izvēlies...</option>
          {seasonCombos.map((s, i) => (
            <option key={`${s.seasonId}-${s.tournamentId}`} value={i}>
              {s.seasonName} ({s.tournamentName})
            </option>
          ))}
        </SelectInput>
      </Field>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="relative space-y-2 bg-surface border border-line-strong rounded-md p-3 pr-10">
            <button
              type="button"
              onClick={() => removeRow(r.id)}
              aria-label="Dzēst spēli"
              title="Dzēst šo spēli no saraksta"
              className="absolute top-2 right-2 w-7 h-7 shrink-0 rounded-md text-ink-faint hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-center"
            >
              &times;
            </button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className={rowLabelClass}>Mājas komanda</label>
                <TeamSelect teams={teams} value={r.homeTeam} onChange={(v) => updateRow(r.id, { homeTeam: v })} includeTbd />
                {r.homeTeam === '0' && (
                  <input
                    value={r.seedHome}
                    onChange={(e) => updateRow(r.id, { seedHome: e.target.value })}
                    placeholder='Seed, piem. "A1"'
                    className={`mt-1 ${rowInputClass}`}
                  />
                )}
              </div>
              <div>
                <label className={rowLabelClass}>Viesu komanda</label>
                <TeamSelect teams={teams} value={r.awayTeam} onChange={(v) => updateRow(r.id, { awayTeam: v })} includeTbd />
                {r.awayTeam === '0' && (
                  <input
                    value={r.seedAway}
                    onChange={(e) => updateRow(r.id, { seedAway: e.target.value })}
                    placeholder='Seed, piem. "B2"'
                    className={`mt-1 ${rowInputClass}`}
                  />
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className={rowLabelClass}>Datums un laiks</label>
                <input
                  type="datetime-local"
                  value={r.kickoff}
                  onChange={(e) => updateRow(r.id, { kickoff: e.target.value })}
                  className={rowInputClass}
                />
              </div>
              <div>
                <label className={rowLabelClass}>Vieta</label>
                <VenueSelect venues={venues} value={r.venueId} onChange={(v) => updateRow(r.id, { venueId: v })} />
              </div>
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-ink-faint hover:text-ink select-none">
                Papildu (kārta / grupa) - parasti nav jāmaina
              </summary>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className={rowLabelClass}>Kārta</label>
                  <input
                    value={r.roundId}
                    onChange={(e) => updateRow(r.id, { roundId: e.target.value })}
                    className={rowInputClass}
                  />
                </div>
                <div>
                  <label className={rowLabelClass}>Grupa</label>
                  <input
                    value={r.groupId}
                    onChange={(e) => updateRow(r.id, { groupId: e.target.value })}
                    className={rowInputClass}
                  />
                </div>
              </div>
            </details>
          </div>
        ))}
      </div>
      <SecondaryButton onClick={addRow}>+ Pievienot spēli</SecondaryButton>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <PrimaryButton onClick={handleSave} disabled={!canSave || saveState === 'saving'}>
          {saveState === 'saving' ? 'Izveido...' : `Izveidot ${validRows.length} spēles`}
        </PrimaryButton>
        {saveState === 'saved' && <SuccessText>Izveidotas {saveResult.created?.length || 0} spēles.</SuccessText>}
        <ErrorText>{error}</ErrorText>
      </div>
      {saveResult?.errors?.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-600/40 text-amber-300 text-sm rounded-lg px-4 py-3 space-y-1">
          {saveResult.errors.map((e, i) => (
            <p key={i}>&bull; {JSON.stringify(e)}</p>
          ))}
        </div>
      )}
    </Panel>
  )
}

function ResolveTab({ lookups, teams }) {
  const teamName = (id) => teams.find((t) => String(t.id) === String(id))?.name || `#${id}`

  const placeholders = useMemo(
    () => (lookups?.games || []).filter((g) => Number(g.home_team) === 0 || Number(g.away_team) === 0),
    [lookups],
  )

  const [gameId, setGameId] = useState('')
  const selected = placeholders.find((g) => String(g.game_id) === String(gameId)) || null
  const [homeTeam, setHomeTeam] = useState('')
  const [awayTeam, setAwayTeam] = useState('')
  const [error, setError] = useState(null)
  const [saveState, setSaveState] = useState('idle')

  function pickGame(id) {
    setGameId(id)
    const g = placeholders.find((x) => String(x.game_id) === String(id))
    setHomeTeam(Number(g?.home_team) === 0 ? '' : String(g?.home_team || ''))
    setAwayTeam(Number(g?.away_team) === 0 ? '' : String(g?.away_team || ''))
    setSaveState('idle')
    setError(null)
  }

  const canSave = selected && homeTeam && awayTeam && homeTeam !== awayTeam

  async function handleSave() {
    setSaveState('saving')
    setError(null)
    try {
      await resolveMiniTournamentGame({ gameId: selected.game_id, homeTeamId: homeTeam, awayTeamId: awayTeam })
      setSaveState('saved')
    } catch (err) {
      setSaveState('failed')
      setError(err.message)
    }
  }

  return (
    <Panel>
      {placeholders.length === 0 ? (
        <p className="text-ink-faint text-sm">Nav neatrisinātu turnīra spēļu.</p>
      ) : (
        <Field label="Spēle">
          <SelectInput value={gameId} onChange={pickGame}>
            <option value="">Izvēlies...</option>
            {placeholders.map((g) => (
              <option key={g.game_id} value={g.game_id}>
                {Number(g.home_team) === 0 ? g.seed_home || 'TBD' : teamName(g.home_team)} vs{' '}
                {Number(g.away_team) === 0 ? g.seed_away || 'TBD' : teamName(g.away_team)} &middot; {g.kickoff}
              </option>
            ))}
          </SelectInput>
        </Field>
      )}

      {selected && (
        <>
          {Number(selected.home_team) === 0 && (
            <Field label={`Mājas komanda (${selected.seed_home || 'TBD'})`}>
              <TeamSelect teams={teams} value={homeTeam} onChange={setHomeTeam} />
            </Field>
          )}
          {Number(selected.away_team) === 0 && (
            <Field label={`Viesu komanda (${selected.seed_away || 'TBD'})`}>
              <TeamSelect teams={teams} value={awayTeam} onChange={setAwayTeam} />
            </Field>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={handleSave} disabled={!canSave || saveState === 'saving'}>
              {saveState === 'saving' ? 'Saglabā...' : 'Atrisināt spēli'}
            </PrimaryButton>
            {saveState === 'saved' && <SuccessText>Saglabāts!</SuccessText>}
            <ErrorText>{error}</ErrorText>
          </div>
        </>
      )}
    </Panel>
  )
}
