import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createMissingPlayers, updatePlayerName } from '../../api'
import { loadDraft, saveDraft, clearDraft } from '../../adminDrafts'
import { Panel, Field, ScreenHeader, SelectInput, PrimaryButton, SecondaryButton, ErrorText, SuccessText } from './AdminUI'

const DRAFT_KEY = 'roster'

const GROUP_OPTIONS = [
  { value: 'Goalies', label: 'Vārtsargi' },
  { value: 'Defense', label: 'Aizsargi' },
  { value: 'Forwards', label: 'Uzbrucēji' },
]

function blankRow() {
  return { id: crypto.randomUUID(), name: '', jersey: '', group: 'Forwards' }
}

function rowsFromRoster(roster) {
  return (roster || []).map((p) => ({
    id: crypto.randomUUID(),
    name: p.name || '',
    jersey: p.number ?? '',
    group: p.group || 'Forwards',
  }))
}

const RosterManagement = forwardRef(function RosterManagement({ lookups, onCancel, askConfirm, initialTeamId }, ref) {
  const teams = lookups?.teams || []
  const teamDetails = lookups?.teamDetails || {}
  // Sorted most-recent-first by lookups:get's deriveSeasonCombos (main.mjs)
  // - index 0 is the current season, used as the default below.
  const seasonCombos = lookups?.seasonCombos || []

  const draft = loadDraft(DRAFT_KEY)
  const [seasonIndex, setSeasonIndex] = useState(draft?.seasonIndex ?? (seasonCombos.length ? 0 : ''))
  // initialTeamId (from GlobalSearch, "edit this player" -> jump straight
  // to their team) wins over a resumed draft's own team, since arriving
  // here from a search click is a fresh, deliberate action.
  const [teamId, setTeamId] = useState(initialTeamId || draft?.teamId || '')
  const [mode, setMode] = useState(draft?.mode || 'add') // 'add' | 'replace'
  const [rows, setRows] = useState(draft?.rows || [blankRow()])
  const [error, setError] = useState(null)
  const [saveState, setSaveState] = useState('idle')
  const [saveResult, setSaveResult] = useState(null)
  // Which existing roster entry is being edited inline (player_id or
  // null), and its own editable buffer/save state - separate from the
  // add/replace form's own saveState below it.
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({ name: '', jersey: '', group: 'Forwards' })
  const [editSaving, setEditSaving] = useState({}) // player_id -> 'saving' | 'failed'

  const currentRoster = teamId ? teamDetails[teamId]?.roster || [] : []
  const teamLabel = teams.find((t) => String(t.id) === String(teamId))?.name || ''

  // A team has no season field of its own anywhere in WordPress - "which
  // teams are in this season" only exists implicitly, via which teams have
  // a game in that season's tournament (same derivation the site's own
  // standings computation uses). This groups the team picker by that, so
  // the admin isn't hunting through every team WordPress has ever known
  // about just to fix this season's rosters - it doesn't hide anyone
  // (a brand-new team with no games yet still shows up under "Citas").
  const seasonTeamIds = useMemo(() => {
    const combo = seasonIndex !== '' ? seasonCombos[seasonIndex] : null
    if (!combo) return null
    const ids = new Set()
    for (const g of lookups?.games || []) {
      if (String(g.tournament_id) === String(combo.tournamentId)) {
        ids.add(String(g.home_team))
        ids.add(String(g.away_team))
      }
    }
    return ids
  }, [seasonIndex, seasonCombos, lookups])

  const seasonTeams = seasonTeamIds ? teams.filter((t) => seasonTeamIds.has(String(t.id))) : teams
  const otherTeams = seasonTeamIds ? teams.filter((t) => !seasonTeamIds.has(String(t.id))) : []

  // Autosave (debounced) - a roster with several typed rows is real work
  // to lose. First render never persists (mirrors GameEditor's own fix for
  // exactly this - restoring a draft shouldn't immediately re-write itself
  // and, here, there's nothing to protect against overwriting anyway on
  // first mount).
  const isFirstAutosaveRun = useRef(true)
  useEffect(() => {
    if (isFirstAutosaveRun.current) {
      isFirstAutosaveRun.current = false
      return
    }
    const timer = setTimeout(() => saveDraft(DRAFT_KEY, { seasonIndex, teamId, mode, rows }), 500)
    return () => clearTimeout(timer)
  }, [seasonIndex, teamId, mode, rows])

  function pickTeam(id) {
    setTeamId(id)
    setMode('add')
    setRows([blankRow()])
    setSaveState('idle')
    setError(null)
  }

  function switchMode(next) {
    setMode(next)
    setRows(next === 'replace' ? rowsFromRoster(currentRoster) : [blankRow()])
    setSaveState('idle')
    setError(null)
  }

  function updateRow(id, patch) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((rs) => [...rs, blankRow()])
  }
  function removeRow(id) {
    setRows((rs) => rs.filter((r) => r.id !== id))
  }

  const validRows = rows.filter((r) => r.name.trim())
  const canSave = teamId && validRows.length > 0
  // Only counts as "would lose real work" once something was actually
  // typed - picking a team and looking at the add-a-player blank row
  // isn't data entry.
  const isDirty = validRows.length > 0

  useImperativeHandle(ref, () => ({ isDirty: () => isDirty, hasDraftSafety: () => true }))

  async function handleSave() {
    if (mode === 'replace') {
      const ok = await askConfirm(
        `Tas aizstās visu "${teamLabel}" pašreizējo sastāvu (${currentRoster.length} spēlētāji) ` +
          `ar zemāk redzamo sarakstu (${validRows.length} spēlētāji). Turpināt?`,
      )
      if (!ok) return
    }
    setSaveState('saving')
    setError(null)
    try {
      const result = await createMissingPlayers({
        teamId,
        replace: mode === 'replace',
        players: validRows.map((r) => ({
          name: r.name.trim(),
          jersey: r.jersey ? Number(r.jersey) : null,
          group: r.group,
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

  function startEdit(player) {
    setEditingId(player.player_id)
    setEditDraft({ name: player.name, jersey: player.number != null ? String(player.number) : '', group: player.group || 'Forwards' })
    setError(null)
  }
  function cancelEdit() {
    setEditingId(null)
  }

  // Jersey number and position live on the ROSTER ENTRY itself, so both
  // are safe to correct by re-submitting the full current roster
  // (replace: true, same endpoint "Aizstāt visu sastāvu" already uses)
  // with just this one row's fields changed. A NAME correction is
  // different: create-players.php matches players by name to decide
  // create-vs-reuse, so submitting a corrected name through it would fork
  // a brand-new player post instead of fixing this one - update-player-
  // name.php (a real rename, in place) handles that half first, then the
  // roster replace call refreshes the cached name on the roster entry
  // itself (see create-players.php's own comment on that denormalization).
  async function saveEdit(player) {
    const name = editDraft.name.trim()
    if (!name) return
    setEditSaving((s) => ({ ...s, [player.player_id]: 'saving' }))
    setError(null)
    try {
      if (name !== player.name) {
        await updatePlayerName({ playerId: player.player_id, name })
      }
      const players = currentRoster.map((p) =>
        p.player_id === player.player_id
          ? { name, jersey: editDraft.jersey.trim() ? Number(editDraft.jersey.trim()) : null, group: editDraft.group }
          : { name: p.name, jersey: p.number ?? null, group: p.group || 'Forwards' },
      )
      await createMissingPlayers({ teamId, replace: true, players })
      setEditSaving((s) => ({ ...s, [player.player_id]: undefined }))
      setEditingId(null)
    } catch (err) {
      setEditSaving((s) => ({ ...s, [player.player_id]: 'failed' }))
      setError(`Neizdevās saglabāt izmaiņas: ${err.message}`)
    }
  }

  return (
    <div className="space-y-4">
      <ScreenHeader
        title="Komandas sastāvs"
        subtitle="Pievienot jaunus spēlētājus komandas sastāvam, vai pilnībā aizstāt visu sastāvu."
        onCancel={onCancel}
      />

      <Panel>
        <Field label="Sezona / turnīrs">
          <SelectInput value={seasonIndex} onChange={setSeasonIndex}>
            <option value="">Visas sezonas</option>
            {seasonCombos.map((s, i) => (
              <option key={`${s.seasonId}-${s.tournamentId}`} value={i}>
                {s.seasonName} ({s.tournamentName})
              </option>
            ))}
          </SelectInput>
          <p className="text-ink-faint text-xs mt-1">
            Katrai sezonai sastāvs atšķiras - šis tikai sagrupē komandu sarakstu zemāk, sastāva dati paši
            netiek dalīti pa sezonām.
          </p>
        </Field>
        <Field label="Komanda">
          <SelectInput value={teamId} onChange={pickTeam}>
            <option value="">Izvēlies...</option>
            {seasonTeamIds ? (
              <>
                <optgroup label="Šīs sezonas komandas">
                  {seasonTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
                {otherTeams.length > 0 && (
                  <optgroup label="Citas komandas">
                    {otherTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </>
            ) : (
              teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))
            )}
          </SelectInput>
        </Field>
      </Panel>

      {teamId && (
        <>
          <Panel>
            <h3 className="text-sm font-black uppercase text-ink-faint tracking-wide">
              Pašreizējais sastāvs ({currentRoster.length})
            </h3>
            {currentRoster.length === 0 ? (
              <p className="text-ink-faint text-sm">Sastāvs vēl ir tukšs.</p>
            ) : (
              <div className="space-y-1.5 text-sm text-ink-secondary">
                {currentRoster.map((p) =>
                  editingId === p.player_id ? (
                    <div key={p.player_id} className="flex flex-wrap items-center gap-2 bg-surface border border-line-strong rounded-md p-2">
                      <input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="Vārds Uzvārds"
                        className="flex-1 min-w-[10rem] bg-base border border-line-strong rounded-md px-2 py-1 text-ink text-sm focus:outline-none focus:border-accent"
                      />
                      <input
                        value={editDraft.jersey}
                        onChange={(e) => setEditDraft((d) => ({ ...d, jersey: e.target.value }))}
                        placeholder="Nr."
                        className="w-16 bg-base border border-line-strong rounded-md px-2 py-1 text-ink text-sm focus:outline-none focus:border-accent"
                      />
                      <select
                        value={editDraft.group}
                        onChange={(e) => setEditDraft((d) => ({ ...d, group: e.target.value }))}
                        className="bg-base border border-line-strong rounded-md px-2 py-1 text-ink text-xs focus:outline-none focus:border-accent"
                      >
                        {GROUP_OPTIONS.map((g) => (
                          <option key={g.value} value={g.value}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                      <SecondaryButton
                        onClick={() => saveEdit(p)}
                        disabled={!editDraft.name.trim() || editSaving[p.player_id] === 'saving'}
                        className="px-3 py-1.5"
                      >
                        {editSaving[p.player_id] === 'saving' ? 'Saglabā...' : 'Saglabāt'}
                      </SecondaryButton>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        aria-label="Atcelt"
                        className="w-7 h-7 shrink-0 rounded-md text-ink-faint hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-center"
                      >
                        &times;
                      </button>
                      {editSaving[p.player_id] === 'failed' && <span className="text-red-400 text-xs w-full">Neizdevās saglabāt.</span>}
                    </div>
                  ) : (
                    <div key={p.player_id} className="flex items-center gap-2">
                      <span className="flex-1">
                        #{p.number || '-'} {p.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        title="Rediģēt vārdu, numuru vai pozīciju"
                        className="text-accent text-xs font-semibold hover:underline"
                      >
                        Rediģēt
                      </button>
                    </div>
                  ),
                )}
              </div>
            )}
          </Panel>

          <Panel>
            <div className="flex gap-3">
              <SecondaryButton onClick={() => switchMode('add')} className={mode === 'add' ? 'border-accent text-ink' : ''}>
                Pievienot spēlētājus
              </SecondaryButton>
              <SecondaryButton
                onClick={() => switchMode('replace')}
                className={mode === 'replace' ? 'border-accent text-ink' : ''}
              >
                Aizstāt visu sastāvu
              </SecondaryButton>
            </div>

            {mode === 'replace' && (
              <p className="text-amber-400 text-xs">
                Šis pilnībā izdzēsīs pašreizējo sastāva sarakstu un aizstās to ar zemāk redzamo - rediģē uzmanīgi.
              </p>
            )}

            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="flex gap-2 items-center">
                  <input
                    value={r.name}
                    onChange={(e) => updateRow(r.id, { name: e.target.value })}
                    placeholder="Vārds Uzvārds"
                    className="flex-1 bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
                  />
                  <input
                    value={r.jersey}
                    onChange={(e) => updateRow(r.id, { jersey: e.target.value })}
                    placeholder="Nr."
                    className="w-16 bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
                  />
                  <select
                    value={r.group}
                    onChange={(e) => updateRow(r.id, { group: e.target.value })}
                    className="bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
                  >
                    {GROUP_OPTIONS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    aria-label="Dzēst rindu"
                    className="w-8 h-8 shrink-0 rounded-md text-ink-faint hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-center"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            <SecondaryButton onClick={addRow}>+ Pievienot rindu</SecondaryButton>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <PrimaryButton onClick={handleSave} disabled={!canSave || saveState === 'saving'}>
                {saveState === 'saving' ? 'Saglabā...' : mode === 'replace' ? 'Aizstāt sastāvu' : 'Pievienot spēlētājus'}
              </PrimaryButton>
              {saveState === 'saved' && <SuccessText>Saglabāts!</SuccessText>}
              <ErrorText>{error}</ErrorText>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
})

export default RosterManagement
