import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { bulkImportGames } from '../../api'
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

const DRAFT_KEY = 'bulkImport'

function blankRow() {
  return { id: crypto.randomUUID(), homeTeam: '', awayTeam: '', kickoff: '', venueId: '', gameDay: '' }
}

const rowInputClass =
  'w-full min-w-0 bg-base border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent'
const rowLabelClass = 'block text-[10px] uppercase tracking-wide text-ink-faint font-semibold mb-1'

const BulkImportGames = forwardRef(function BulkImportGames({ lookups, onCancel }, ref) {
  const teams = lookups?.teams || []
  const venues = lookups?.venues || []
  const seasonCombos = lookups?.seasonCombos || []

  const draft = loadDraft(DRAFT_KEY)
  const [seasonIndex, setSeasonIndex] = useState(draft?.seasonIndex ?? '')
  const [roundId, setRoundId] = useState(draft?.roundId ?? '1')
  const [groupId, setGroupId] = useState(draft?.groupId ?? '1')
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
    const timer = setTimeout(() => saveDraft(DRAFT_KEY, { seasonIndex, roundId, groupId, rows }), 500)
    return () => clearTimeout(timer)
  }, [seasonIndex, roundId, groupId, rows])

  function updateRow(id, patch) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((rs) => [...rs, blankRow()])
  }
  function removeRow(id) {
    setRows((rs) => rs.filter((r) => r.id !== id))
  }

  // bulk-import-games.php requires both teams to already be real - no
  // TBD/placeholder support (that's what mini-tournament-games.php is for).
  const validRows = rows.filter((r) => r.homeTeam && r.awayTeam && r.homeTeam !== r.awayTeam && r.kickoff)
  const canSave = seasonIndex !== '' && validRows.length > 0
  const isDirty = seasonIndex !== '' || rows.some((r) => r.homeTeam || r.awayTeam || r.kickoff || r.venueId || r.gameDay)
  useImperativeHandle(ref, () => ({ isDirty: () => isDirty, hasDraftSafety: () => true }))

  async function handleSave() {
    setSaveState('saving')
    setError(null)
    try {
      const combo = seasonCombos[seasonIndex]
      const result = await bulkImportGames({
        seasonId: combo.seasonId,
        tournamentId: combo.tournamentId,
        stageId: combo.stageId,
        leagueId: combo.leagueId,
        roundId,
        groupId,
        games: validRows.map((r) => ({
          home_team: r.homeTeam,
          away_team: r.awayTeam,
          kickoff: fromDatetimeLocal(r.kickoff),
          venue_id: r.venueId || undefined,
          game_day: r.gameDay || undefined,
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
    <div className="space-y-4">
      <ScreenHeader
        title="Sezonas grafiks"
        subtitle="Izveido vairākas jaunas, ieplānotas spēles uzreiz - abām komandām jābūt zināmām jau tagad."
        onCancel={onCancel}
      />

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
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-faint hover:text-ink select-none">
            Papildu (kārta / grupa) - parasti nav jāmaina
          </summary>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <Field label="Kārta">
              <input value={roundId} onChange={(e) => setRoundId(e.target.value)} className={rowInputClass} />
            </Field>
            <Field label="Grupa">
              <input value={groupId} onChange={(e) => setGroupId(e.target.value)} className={rowInputClass} />
            </Field>
          </div>
        </details>
      </Panel>

      <Panel>
        <h3 className="text-sm font-black uppercase text-ink-faint tracking-wide">Spēles</h3>
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
                  <TeamSelect teams={teams} value={r.homeTeam} onChange={(v) => updateRow(r.id, { homeTeam: v })} />
                </div>
                <div>
                  <label className={rowLabelClass}>Viesu komanda</label>
                  <TeamSelect teams={teams} value={r.awayTeam} onChange={(v) => updateRow(r.id, { awayTeam: v })} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
                <div>
                  <label className={rowLabelClass}>Spēles diena (nav obligāti)</label>
                  <input
                    value={r.gameDay}
                    onChange={(e) => updateRow(r.id, { gameDay: e.target.value })}
                    className={rowInputClass}
                  />
                </div>
              </div>
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
    </div>
  )
})

export default BulkImportGames
