import { useEffect, useState } from 'react'
import { createManualGamePreview, createNewGameSave, openExternal } from '../api'
import { BoxScoreTable, GoalsList, PenaltiesList } from './GameSummary'

// Manual entry for a game whose protocol only exists as a handwritten
// paper sheet (photographed/WhatsApp'd, not a real digital PDF) - e.g.
// EAHF 2026's paper protocols. Mirrors that paper form's own fields
// (roster, Vārti/goals, Sodi/penalties, per team) rather than inventing a
// simplified shape, on the explicit ask that the digital form stay
// recognizable to whoever is transcribing from the photo.
//
// Deliberately builds a `parsed` object shaped EXACTLY like
// parseProtocol.mjs's parseProtocolItems() output (teamA/teamB rosters,
// goals, penalties, goalieChanges, qa) and hands it to the same
// game:createManualPreview -> buildNewGamePreview() pipeline the real PDF
// path uses (see buildNewGamePreview.mjs) - every downstream piece
// (jersey/name resolution against the team's WP roster, stats payload
// building, win/loss/points math) is reused completely unchanged. This
// file's only real job is collecting that same data by hand instead of by
// text extraction.

const SITUATIONS = [
  { value: '', label: '—' },
  { value: 'EQ', label: 'EQ (vienādi)' },
  { value: 'PP1', label: 'PP1 (vairākumā)' },
  { value: 'PP2', label: 'PP2 (vairākumā)' },
  { value: 'SH1', label: 'SH1 (mazākumā)' },
  { value: 'SH2', label: 'SH2 (mazākumā)' },
  { value: 'PS', label: 'PS (bullītis)' },
]

let uidCounter = 0
function uid() {
  uidCounter += 1
  return uidCounter
}

function toDatetimeLocal(date, time) {
  if (!date) return ''
  return `${date}T${time || '00:00'}`
}
function fromDatetimeLocal(value) {
  if (!value) return ''
  return value.replace('T', ' ') + ':00'
}

const EMPTY_LOOKUPS = { seasonCombos: [], teams: [], venues: [], teamDetails: {} }

export default function ManualProtocol({ lookups = EMPTY_LOOKUPS, initialSeasonIndex, onCancel }) {
  const [error, setError] = useState(null)

  const [homeTeamId, setHomeTeamId] = useState('')
  const [awayTeamId, setAwayTeamId] = useState('')
  const [seasonIndex, setSeasonIndex] = useState(initialSeasonIndex || '')
  const [venueId, setVenueId] = useState('')
  const [kickoff, setKickoff] = useState('')

  const [homeRoster, setHomeRoster] = useState([])
  const [awayRoster, setAwayRoster] = useState([])
  const [homeGoals, setHomeGoals] = useState([])
  const [awayGoals, setAwayGoals] = useState([])
  const [homePenalties, setHomePenalties] = useState([])
  const [awayPenalties, setAwayPenalties] = useState([])
  const [goalieChanges, setGoalieChanges] = useState([])

  // Self-check against the paper protocol's own printed final score,
  // same role as the real PDF path's officialTotals-vs-derivedTotals
  // check - optional, since it's just a typo safety net, not itself part
  // of the data being saved.
  const [checkHomeFinal, setCheckHomeFinal] = useState('')
  const [checkAwayFinal, setCheckAwayFinal] = useState('')

  const [loadingPreview, setLoadingPreview] = useState(false)
  const [preview, setPreview] = useState(null)
  const [saveState, setSaveState] = useState('idle')
  const [saveResult, setSaveResult] = useState(null)

  const homeTeamName = lookups.teams.find((t) => t.id === homeTeamId)?.name || ''
  const awayTeamName = lookups.teams.find((t) => t.id === awayTeamId)?.name || ''

  // Prefills each team's roster from its known WP roster the moment it's
  // picked (jersey + name, editable) - the admin then just deletes the
  // rows for anyone who didn't dress and adds a row for any guest not on
  // the WP roster yet, rather than retyping everyone from a blank table.
  useEffect(() => {
    const roster = lookups.teamDetails?.[homeTeamId]?.roster || []
    setHomeRoster(roster.map((p) => ({ id: uid(), jersey: p.number != null ? String(p.number) : '', name: p.name })))
  }, [homeTeamId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const roster = lookups.teamDetails?.[awayTeamId]?.roster || []
    setAwayRoster(roster.map((p) => ({ id: uid(), jersey: p.number != null ? String(p.number) : '', name: p.name })))
  }, [awayTeamId]) // eslint-disable-line react-hooks/exhaustive-deps

  const canPreview = homeTeamId && awayTeamId && homeTeamId !== awayTeamId && seasonIndex !== '' && venueId && kickoff

  function buildParsed() {
    const toPlayers = (roster) => roster.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), jersey: r.jersey.trim() || null }))
    const toGoals = (rows, side) =>
      rows
        .filter((g) => g.scorerJersey.trim())
        .map((g) => ({
          team: side,
          seq: null,
          time: g.situation === 'PS' ? null : g.time.trim() || null,
          scorerJersey: g.scorerJersey.trim(),
          assist1Jersey: g.assist1Jersey.trim() || null,
          assist2Jersey: g.assist2Jersey.trim() || null,
          situation: g.situation || null,
          isShootout: g.situation === 'PS',
        }))
    const toPenalties = (rows, side) =>
      rows
        .filter((p) => p.infraction.trim())
        .map((p) => ({
          team: side,
          jersey: p.jersey.trim() || null,
          minutes: p.minutes.trim() ? Number(p.minutes) : null,
          infraction: p.infraction.trim(),
          slStart: p.slStart.trim() || null,
          blEnd: p.blEnd.trim() || null,
        }))

    const goals = [...toGoals(homeGoals, 'A'), ...toGoals(awayGoals, 'B')]
    const penalties = [...toPenalties(homePenalties, 'A'), ...toPenalties(awayPenalties, 'B')]
    const parsedGoalieChanges = goalieChanges
      .filter((r) => r.time.trim())
      .map((r) => ({ time: r.time.trim(), goalieAJersey: r.homeJersey.trim() || null, goalieBJersey: r.awayJersey.trim() || null }))

    const derivedTotals = { A: goals.filter((g) => g.team === 'A').length, B: goals.filter((g) => g.team === 'B').length }
    const officialTotals = {}
    if (checkHomeFinal.trim()) officialTotals.A = Number(checkHomeFinal)
    if (checkAwayFinal.trim()) officialTotals.B = Number(checkAwayFinal)
    const goalCountMatches =
      'A' in officialTotals && 'B' in officialTotals
        ? officialTotals.A === derivedTotals.A && officialTotals.B === derivedTotals.B
        : true

    return {
      teamA: { name: homeTeamName, players: toPlayers(homeRoster) },
      teamB: { name: awayTeamName, players: toPlayers(awayRoster) },
      goals,
      penalties,
      goalieChanges: parsedGoalieChanges,
      qa: { officialTotals, derivedTotals, goalCountMatches },
    }
  }

  async function handlePreview() {
    setLoadingPreview(true)
    setError(null)
    try {
      const parsed = buildParsed()
      const result = await createManualGamePreview({ parsed, homeTeamId, awayTeamId, aIsHome: true })
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
      <div className="bg-card border border-line rounded-lg p-4">
        <h2 className="text-lg font-black uppercase text-ink tracking-wide">Ievadīt protokolu ar roku</h2>
      </div>

      {!preview && (
        <>
          <div className="bg-card border border-line rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Mājas komanda">
                <TeamSelect teams={lookups.teams} value={homeTeamId} onChange={setHomeTeamId} />
              </Field>
              <Field label="Viesu komanda">
                <TeamSelect teams={lookups.teams} value={awayTeamId} onChange={setAwayTeamId} />
              </Field>
            </div>
            <button
              type="button"
              onClick={() => openExternal('https://lach.lv/wp-admin/post-new.php?post_type=sl_team')}
              className="text-accent text-xs font-semibold hover:underline -mt-2"
            >
              Komandas nav sarakstā? Izveidot jaunu komandu WP-Admin
            </button>

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
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TeamProtocolPanel
              label="A komanda (mājas)"
              teamName={homeTeamName}
              roster={homeRoster}
              setRoster={setHomeRoster}
              goals={homeGoals}
              setGoals={setHomeGoals}
              penalties={homePenalties}
              setPenalties={setHomePenalties}
            />
            <TeamProtocolPanel
              label="B komanda (viesi)"
              teamName={awayTeamName}
              roster={awayRoster}
              setRoster={setAwayRoster}
              goals={awayGoals}
              setGoals={setAwayGoals}
              penalties={awayPenalties}
              setPenalties={setAwayPenalties}
            />
          </div>

          <GoalieChangesPanel rows={goalieChanges} setRows={setGoalieChanges} />

          <div className="bg-card border border-line rounded-lg p-4 space-y-3">
            <h3 className="text-ink-faint text-xs uppercase tracking-wide font-semibold">
              Pašpārbaude (nav obligāti) - protokola apakšā izdrukātais gala rezultāts
            </h3>
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <Field label={`Vārti kopā (${homeTeamName || 'mājas'})`}>
                <input
                  type="number"
                  value={checkHomeFinal}
                  onChange={(e) => setCheckHomeFinal(e.target.value)}
                  className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
                />
              </Field>
              <Field label={`Vārti kopā (${awayTeamName || 'viesi'})`}>
                <input
                  type="number"
                  value={checkAwayFinal}
                  onChange={(e) => setCheckAwayFinal(e.target.value)}
                  className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
                />
              </Field>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePreview}
              disabled={!canPreview || loadingPreview}
              className="bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
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
        </>
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
              Pašpārbaude neatbilst: itemizēto vārtu skaits nesakrīt ar ievadīto gala rezultātu. Pārbaudi rūpīgi.
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
          </div>
        </>
      )}
    </div>
  )
}

// One team's own slice of the paper protocol: roster + its own Vārti
// (goals) + Sodi (penalties) sub-tables, matching the paper's own
// "A komanda" / "B komanda" sections (each printed with its own roster,
// goals and penalties - never split across a shared table).
function TeamProtocolPanel({ label, teamName, roster, setRoster, goals, setGoals, penalties, setPenalties }) {
  return (
    <div className="bg-card border border-line rounded-lg p-4 space-y-4">
      <h3 className="text-accent font-bold text-sm uppercase tracking-wide">
        {label}
        {teamName && <span className="text-ink font-black normal-case ml-2">{teamName}</span>}
      </h3>

      <RosterEditor roster={roster} setRoster={setRoster} />
      <GoalsEditor rows={goals} setRows={setGoals} />
      <PenaltiesEditor rows={penalties} setRows={setPenalties} />
    </div>
  )
}

function RosterEditor({ roster, setRoster }) {
  function updateRow(id, field, value) {
    setRoster(roster.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }
  function removeRow(id) {
    setRoster(roster.filter((r) => r.id !== id))
  }
  function addRow() {
    setRoster([...roster, { id: uid(), jersey: '', name: '' }])
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">Sastāvs (Nr, Vārds, Uzvārds)</p>
      <div className="space-y-1.5">
        {roster.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Nr"
              value={r.jersey}
              onChange={(e) => updateRow(r.id, 'jersey', e.target.value)}
              className="w-14 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="Vārds, Uzvārds"
              value={r.name}
              onChange={(e) => updateRow(r.id, 'name', e.target.value)}
              className="flex-1 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            />
            <RemoveRowButton onClick={() => removeRow(r.id)} />
          </div>
        ))}
      </div>
      <AddRowButton onClick={addRow} label="+ Pievienot spēlētāju" />
    </div>
  )
}

function GoalsEditor({ rows, setRows }) {
  function updateRow(id, field, value) {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }
  function removeRow(id) {
    setRows(rows.filter((r) => r.id !== id))
  }
  function addRow() {
    setRows([...rows, { id: uid(), time: '', scorerJersey: '', assist1Jersey: '', assist2Jersey: '', situation: '' }])
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">Vārti (Laiks, VG, P, P, Sit.)</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="Laiks"
              title="Laiks (M:SS)"
              value={r.time}
              onChange={(e) => updateRow(r.id, 'time', e.target.value)}
              disabled={r.situation === 'PS'}
              className="w-16 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent disabled:opacity-40"
            />
            <input
              type="text"
              placeholder="VG"
              title="Vārtu guvēja Nr"
              value={r.scorerJersey}
              onChange={(e) => updateRow(r.id, 'scorerJersey', e.target.value)}
              className="w-12 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="P"
              title="1. piespēle, Nr"
              value={r.assist1Jersey}
              onChange={(e) => updateRow(r.id, 'assist1Jersey', e.target.value)}
              className="w-12 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="P"
              title="2. piespēle, Nr"
              value={r.assist2Jersey}
              onChange={(e) => updateRow(r.id, 'assist2Jersey', e.target.value)}
              className="w-12 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            />
            <select
              value={r.situation}
              onChange={(e) => updateRow(r.id, 'situation', e.target.value)}
              className="flex-1 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            >
              {SITUATIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <RemoveRowButton onClick={() => removeRow(r.id)} />
          </div>
        ))}
      </div>
      <AddRowButton onClick={addRow} label="+ Pievienot vārtus" />
    </div>
  )
}

function PenaltiesEditor({ rows, setRows }) {
  function updateRow(id, field, value) {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }
  function removeRow(id) {
    setRows(rows.filter((r) => r.id !== id))
  }
  function addRow() {
    setRows([...rows, { id: uid(), jersey: '', minutes: '2', infraction: '', slStart: '', blEnd: '' }])
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">Sodi (Nr, Min, Pārkāpums, SL, BL)</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="Nr"
              title="Sodītā spēlētāja Nr (tukšs = komandas sods)"
              value={r.jersey}
              onChange={(e) => updateRow(r.id, 'jersey', e.target.value)}
              className="w-12 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="Min"
              value={r.minutes}
              onChange={(e) => updateRow(r.id, 'minutes', e.target.value)}
              className="w-12 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="Pārkāpums"
              value={r.infraction}
              onChange={(e) => updateRow(r.id, 'infraction', e.target.value)}
              className="flex-1 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="SL"
              value={r.slStart}
              onChange={(e) => updateRow(r.id, 'slStart', e.target.value)}
              className="w-14 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="BL"
              value={r.blEnd}
              onChange={(e) => updateRow(r.id, 'blEnd', e.target.value)}
              className="w-14 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            />
            <RemoveRowButton onClick={() => removeRow(r.id)} />
          </div>
        ))}
      </div>
      <AddRowButton onClick={addRow} label="+ Pievienot sodu" />
    </div>
  )
}

// "Vārtsargu Spēle" section on the paper - only needed when a team used
// more than one goalie in the same game (see buildWpPayload.mjs's
// resolvePlayingGoalieJersey) - left empty is the common case and is
// completely fine, buildPlayerStatsPayload() falls back to "the one
// listed goalie played the whole game" automatically.
function GoalieChangesPanel({ rows, setRows }) {
  function updateRow(id, field, value) {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }
  function removeRow(id) {
    setRows(rows.filter((r) => r.id !== id))
  }
  function addRow() {
    setRows([...rows, { id: uid(), time: '', homeJersey: '', awayJersey: '' }])
  }

  return (
    <div className="bg-card border border-line rounded-lg p-4">
      <p className="text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">
        Vārtsargu maiņa (tikai, ja komandai bija vairāk par vienu vārtsargu spēlē)
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Laiks"
              value={r.time}
              onChange={(e) => updateRow(r.id, 'time', e.target.value)}
              className="w-20 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="A vārtsargs Nr"
              value={r.homeJersey}
              onChange={(e) => updateRow(r.id, 'homeJersey', e.target.value)}
              className="flex-1 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="B vārtsargs Nr"
              value={r.awayJersey}
              onChange={(e) => updateRow(r.id, 'awayJersey', e.target.value)}
              className="flex-1 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            />
            <RemoveRowButton onClick={() => removeRow(r.id)} />
          </div>
        ))}
      </div>
      <AddRowButton onClick={addRow} label="+ Pievienot maiņu" />
    </div>
  )
}

function AddRowButton({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} className="text-accent text-xs font-semibold hover:underline mt-1.5">
      {label}
    </button>
  )
}

function RemoveRowButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dzēst rindu"
      title="Dzēst rindu"
      className="w-7 h-7 shrink-0 rounded-md text-ink-faint hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-center"
    >
      &times;
    </button>
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
