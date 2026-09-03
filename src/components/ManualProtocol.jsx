import { useEffect, useRef, useState } from 'react'
import { createManualGamePreview, createMissingPlayers, createNewGameSave, openExternal } from '../api'
import { PeriodScoresTable, BoxScoreTable, GoalsList, PenaltiesList } from './GameSummary'

// Saved to localStorage (survives an app update/relaunch, unlike plain
// React state) so filling in a manual protocol isn't lost - restored
// automatically the next time this screen opens. Both a silent autosave
// AND an explicit "Saglabāt melnrakstu" button write to the exact same
// slot (see persistDraft() below) - one slot only, so starting a fresh
// manual entry after loading a draft just overwrites it on the next save.
const DRAFT_KEY = 'lachManualProtocolDraft'

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const GROUP_TO_POZ = { Goalies: 'Vārtsargs', Defense: 'Aizsargs', Forwards: 'Uzbrucējs' }
const POZ_TO_GROUP = { Vārtsargs: 'Goalies', Aizsargs: 'Defense', Uzbrucējs: 'Forwards' }
const POZ_OPTIONS = ['', 'Vārtsargs', 'Aizsargs', 'Uzbrucējs']

// Gates the Dev Tools panel below to exactly ONE personal WP login
// ("kikis") - deliberately an exact match, not a loose substring check,
// so it stays locked for every OTHER person this app gets installed for
// (everyone else signs in as the shared LHL_admin1 account, or their own
// distinct one) even if one of those usernames happened to contain
// similar letters.
function isDevUser(credentials) {
  return (credentials?.username || '').trim().toLowerCase() === 'kikis'
}

// Recovery tool, legacy/fallback form: rebuilds roster rows (jersey +
// name only) from a plain copy-paste of this screen's own rendered box-
// score tables (jersey<TAB>name [+ concatenated "nav atpazīts" badge
// text, no space between them since there's none in the rendered DOM]
// <TAB>G<TAB>A<TAB>PIM per row, a team-name-only line marking the switch
// from home to away). Superseded by the JSON snapshot format below for
// anything created after that was added, but kept working since a
// screenshot/paste taken before then only has this shape.
function parsePastedRoster(text, homeTeamName, awayTeamName) {
  const home = []
  const away = []
  let side = 'home'
  const normalize = (s) => s.trim().replace(/^["']|["']$/g, '').toLowerCase()
  const homeNorm = normalize(homeTeamName || '')
  const awayNorm = normalize(awayTeamName || '')

  text.split('\n').forEach((rawLine) => {
    const line = rawLine.trim()
    if (!line) return
    const norm = normalize(line)
    if (homeNorm && norm === homeNorm) { side = 'home'; return }
    if (awayNorm && norm === awayNorm) { side = 'away'; return }
    if (/^#\b/.test(line) || /^Spēlētājs/i.test(line)) return // header row

    let parts = line.split('\t').map((s) => s.trim()).filter((s) => s !== '')
    if (parts.length !== 5) parts = line.split(/\s{2,}/).map((s) => s.trim()).filter((s) => s !== '')
    if (parts.length !== 5) return

    const [jerseyRaw, nameRaw] = parts
    const jersey = /^\d+$/.test(jerseyRaw) ? jerseyRaw : ''
    const name = nameRaw.replace(/nav atpaz[iī]ts\s*$/i, '').trim()
    if (!name) return
    ;(side === 'home' ? home : away).push({ id: uid(), jersey, name, poz: '' })
  })

  return { home, away }
}

// One-time-use recovery escape hatch, not a general import tool (which
// is why it's dev-tools-gated rather than a real feature of the form).
// Accepts a JSON snapshot - {home: {roster, goals, penalties}, away:
// {...}}, each row shaped like this form's own row objects minus `id` -
// and restores ALL of it (roster + goals + penalties, both teams) in
// one paste. Falls back to the older plain-text box-score-only parser
// above for anything that isn't valid JSON, so a paste taken before this
// format existed still works (roster only, matching what that format
// ever captured).
function parseDevPaste(text, homeTeamName, awayTeamName) {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed)
      const toRoster = (rows) => (rows || []).map((r) => ({ id: uid(), jersey: r.jersey || '', name: r.name || '', poz: r.poz || '' }))
      const toGoals = (rows) => (rows || []).map((r) => ({
        id: uid(), time: r.time || '', scorerJersey: r.scorerJersey || '',
        assist1Jersey: r.assist1Jersey || '', assist2Jersey: r.assist2Jersey || '', situation: r.situation || '',
      }))
      const toPenalties = (rows) => (rows || []).map((r) => ({
        id: uid(), jersey: r.jersey || '', minutes: r.minutes || '', infraction: r.infraction || '',
        slStart: r.slStart || '', blEnd: r.blEnd || '',
      }))
      return {
        full: true,
        home: { roster: toRoster(data.home?.roster), goals: toGoals(data.home?.goals), penalties: toPenalties(data.home?.penalties) },
        away: { roster: toRoster(data.away?.roster), goals: toGoals(data.away?.goals), penalties: toPenalties(data.away?.penalties) },
      }
    } catch {
      // Not valid JSON after all - fall through to the legacy parser.
    }
  }
  const { home, away } = parsePastedRoster(text, homeTeamName, awayTeamName)
  return { full: false, home: { roster: home, goals: [], penalties: [] }, away: { roster: away, goals: [], penalties: [] } }
}

function DevTools({ credentials, homeTeamName, awayTeamName, onRestoreAll }) {
  const [open, setOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)

  if (!isDevUser(credentials)) return null

  function handleRestore() {
    const parsed = parseDevPaste(text, homeTeamName, awayTeamName)
    onRestoreAll(parsed)
    setResult(
      parsed.full
        ? `Atjaunots viss: ${parsed.home.roster.length}/${parsed.away.roster.length} spēlētāji, ${parsed.home.goals.length}/${parsed.away.goals.length} vārti, ${parsed.home.penalties.length}/${parsed.away.penalties.length} sodi (mājas/viesi).`
        : `Atjaunots tikai sastāvs (vecais formāts): ${parsed.home.roster.length} mājas, ${parsed.away.roster.length} viesu spēlētāji.`,
    )
  }

  return (
    <div className="bg-card border border-dashed border-line-strong rounded-lg p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-ink-faint text-xs font-semibold uppercase tracking-wide hover:text-ink-secondary transition-colors"
      >
        🛠 Dev rīki {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => setPasteOpen((o) => !o)}
            className="text-accent text-xs font-semibold hover:underline"
          >
            Ielīmēt saglabātu JSON momentuzņēmumu (atjauno sastāvu + vārtus + sodus, abām komandām)
          </button>
          {pasteOpen && (
            <div className="space-y-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="Ielīmē JSON momentuzņēmumu (vai vecāku box-score kopiju)..."
                className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-xs font-mono focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={handleRestore}
                disabled={!text.trim()}
                className="bg-card border border-line-strong text-ink-secondary hover:border-accent hover:text-ink font-bold uppercase text-xs tracking-wide px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Atjaunot
              </button>
              {result && <p className="text-emerald-400 text-xs font-semibold">{result}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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

export default function ManualProtocol({ lookups = EMPTY_LOOKUPS, initialSeasonIndex, credentials = null, onCancel }) {
  const [error, setError] = useState(null)
  // Loaded once, at mount - a later save just overwrites the same slot.
  const [draft] = useState(() => loadDraft())
  const [draftSavedAt, setDraftSavedAt] = useState(null)

  const [homeTeamId, setHomeTeamId] = useState(draft?.homeTeamId || '')
  const [awayTeamId, setAwayTeamId] = useState(draft?.awayTeamId || '')
  const [seasonIndex, setSeasonIndex] = useState(draft?.seasonIndex ?? (initialSeasonIndex || ''))
  const [venueId, setVenueId] = useState(draft?.venueId || '')
  const [kickoff, setKickoff] = useState(draft?.kickoff || '')

  const [homeRoster, setHomeRoster] = useState(draft?.homeRoster || [])
  const [awayRoster, setAwayRoster] = useState(draft?.awayRoster || [])
  const [homeGoals, setHomeGoals] = useState(draft?.homeGoals || [])
  const [awayGoals, setAwayGoals] = useState(draft?.awayGoals || [])
  const [homePenalties, setHomePenalties] = useState(draft?.homePenalties || [])
  const [awayPenalties, setAwayPenalties] = useState(draft?.awayPenalties || [])
  const [goalieChanges, setGoalieChanges] = useState(draft?.goalieChanges || [])

  // Per-period goal counts (the paper protocol's own "Periodu Rezultāti"
  // footer) - shown on the preview (same PeriodScoresTable the real PDF
  // path already uses) and doubles as a self-check against the itemized
  // goals below, same role as the PDF path's officialTotals-vs-
  // derivedTotals check. Purely a typo safety net / display, like every
  // other period-score use in this app - never itself written to WP (see
  // buildNewGamePreview.mjs's own periodScores note).
  const [periodHome, setPeriodHome] = useState(draft?.periodHome || { p1: '', p2: '', p3: '' })
  const [periodAway, setPeriodAway] = useState(draft?.periodAway || { p1: '', p2: '', p3: '' })

  const [loadingPreview, setLoadingPreview] = useState(false)
  const [preview, setPreview] = useState(null)
  const [saveState, setSaveState] = useState('idle')
  const [saveResult, setSaveResult] = useState(null)

  const [creatingPlayersFor, setCreatingPlayersFor] = useState(null) // 'home' | 'away' | null
  const [createPlayersResult, setCreatePlayersResult] = useState({ home: null, away: null })

  const homeTeamName = lookups.teams.find((t) => t.id === homeTeamId)?.name || ''
  const awayTeamName = lookups.teams.find((t) => t.id === awayTeamId)?.name || ''

// Once a game is actually created in WP it's no longer "in progress" -
  // persisting (or re-persisting) a draft past that point would make it
  // reappear the next time manual entry is opened (e.g. for the NEXT
  // game), showing stale data from this already-saved one.
  function persistDraft() {
    if (saveState === 'saved') return false
    try {
      const data = { homeTeamId, awayTeamId, seasonIndex, venueId, kickoff, homeRoster, awayRoster, homeGoals, awayGoals, homePenalties, awayPenalties, goalieChanges, periodHome, periodAway }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
      return true
    } catch (err) {
      setError(`Neizdevās saglabāt melnrakstu: ${err.message}`)
      return false
    }
  }
  // Explicit button - same underlying save as the silent autosave below,
  // just with its own visible confirmation for "I'm about to close this,
  // did it actually save".
  function saveDraft() {
    if (persistDraft()) setDraftSavedAt(new Date())
  }
  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch { /* ignore */ }
  }
  useEffect(() => {
    if (saveState === 'saved') clearDraft()
  }, [saveState])

  // Silent autosave, on top of the explicit save-draft button - covers
  // the case the admin DIDN'T get a chance to click it (app closed/
  // updated mid-entry). Debounced so typing a name doesn't write to
  // localStorage on every single keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (persistDraft()) setDraftSavedAt(new Date())
    }, 800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    homeTeamId, awayTeamId, seasonIndex, venueId, kickoff,
    homeRoster, awayRoster, homeGoals, awayGoals, homePenalties, awayPenalties,
    goalieChanges, periodHome, periodAway,
  ])

  // Prefills each team's roster from its known WP roster the moment it's
  // picked (jersey + name + position, editable) - the admin then just
  // deletes the rows for anyone who didn't dress and adds a row for any
  // guest not on the WP roster yet, rather than retyping everyone from a
  // blank table. Skipped exactly once if a restored draft already had
  // its own (possibly hand-edited) roster for that side - otherwise
  // restoring a draft would immediately overwrite it with a fresh WP
  // fetch, silently discarding whatever editing had already been done.
  const skipHomePrefill = useRef(Boolean(draft?.homeTeamId))
  const skipAwayPrefill = useRef(Boolean(draft?.awayTeamId))
  useEffect(() => {
    if (skipHomePrefill.current) { skipHomePrefill.current = false; return }
    const roster = lookups.teamDetails?.[homeTeamId]?.roster || []
    setHomeRoster(roster.map((p) => ({ id: uid(), jersey: p.number != null ? String(p.number) : '', name: p.name, poz: GROUP_TO_POZ[p.group] || '' })))
  }, [homeTeamId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (skipAwayPrefill.current) { skipAwayPrefill.current = false; return }
    const roster = lookups.teamDetails?.[awayTeamId]?.roster || []
    setAwayRoster(roster.map((p) => ({ id: uid(), jersey: p.number != null ? String(p.number) : '', name: p.name, poz: GROUP_TO_POZ[p.group] || '' })))
  }, [awayTeamId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateMissingPlayers(side) {
    const teamId = side === 'home' ? homeTeamId : awayTeamId
    const roster = side === 'home' ? homeRoster : awayRoster
    if (!teamId) return
    setCreatingPlayersFor(side)
    setCreatePlayersResult((r) => ({ ...r, [side]: null }))
    try {
      const players = roster
        .filter((r) => r.name.trim())
        .map((r) => ({ name: r.name.trim(), jersey: r.jersey.trim() || null, group: POZ_TO_GROUP[r.poz] || null }))
      const result = await createMissingPlayers({ teamId, players })
      const created = result.filter((r) => r.created).length
      const failed = result.filter((r) => r.error)
      setCreatePlayersResult((r) => ({
        ...r,
        [side]: failed.length > 0
          ? `Izveidoti ${created} jauni spēlētāji, bet ${failed.length} neizdevās: ${failed.map((f) => f.name).join(', ')}`
          : `Gatavs - izveidoti ${created} jauni spēlētāji (pārējie jau eksistēja WP).`,
      }))
    } catch (err) {
      setCreatePlayersResult((r) => ({ ...r, [side]: `Neizdevās: ${err.message}` }))
    } finally {
      setCreatingPlayersFor(null)
    }
  }

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
    // Only computed once all 3 periods for that side are filled in - a
    // partial period entry shouldn't trigger a possibly-wrong mismatch
    // warning.
    const periodTotal = (p) => (p.p1.trim() && p.p2.trim() && p.p3.trim() ? Number(p.p1) + Number(p.p2) + Number(p.p3) : null)
    const homePeriodTotal = periodTotal(periodHome)
    const awayPeriodTotal = periodTotal(periodAway)
    const officialTotals = {}
    if (homePeriodTotal !== null) officialTotals.A = homePeriodTotal
    if (awayPeriodTotal !== null) officialTotals.B = awayPeriodTotal
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
      // Attached client-side (never sent to/read from WP - see this
      // component's own periodHome/periodAway comment) purely so the
      // preview can reuse PeriodScoresTable, same display the real PDF
      // path already gets. `final` comes from the actual computed score,
      // not the typed periods, so it can never disagree with the box
      // score above it even if a period field has a typo.
      const anyPeriodEntered = [periodHome, periodAway].some((p) => p.p1.trim() || p.p2.trim() || p.p3.trim())
      if (anyPeriodEntered) {
        result.preview.periodScores = {
          home: { p1: periodHome.p1 || undefined, p2: periodHome.p2 || undefined, p3: periodHome.p3 || undefined, final: result.preview.finalScore.home },
          away: { p1: periodAway.p1 || undefined, p2: periodAway.p2 || undefined, p3: periodAway.p3 || undefined, final: result.preview.finalScore.away },
        }
      }
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
      <div className="bg-card border border-line rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black uppercase text-ink tracking-wide">Ievadīt protokolu ar roku</h2>
        {!preview && (
          <div className="flex items-center gap-2">
            {draftSavedAt && (
              <span className="text-ink-faint text-xs">
                Melnraksts saglabāts {draftSavedAt.toLocaleTimeString('lv-LV')}
              </span>
            )}
            <button
              type="button"
              onClick={saveDraft}
              className="bg-card border border-line-strong text-ink-secondary hover:border-accent hover:text-ink font-semibold uppercase text-xs tracking-wide px-3 py-1.5 rounded-md transition-colors"
            >
              Saglabāt melnrakstu
            </button>
          </div>
        )}
      </div>

      <DevTools
        credentials={credentials}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        onRestoreAll={(parsed) => {
          setHomeRoster(parsed.home.roster)
          setAwayRoster(parsed.away.roster)
          if (parsed.full) {
            setHomeGoals(parsed.home.goals)
            setAwayGoals(parsed.away.goals)
            setHomePenalties(parsed.home.penalties)
            setAwayPenalties(parsed.away.penalties)
          }
        }}
      />

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

            <Field label="Arēna">
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
              onCreateMissingPlayers={homeTeamId ? () => handleCreateMissingPlayers('home') : null}
              creatingPlayers={creatingPlayersFor === 'home'}
              createPlayersMessage={createPlayersResult.home}
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
              onCreateMissingPlayers={awayTeamId ? () => handleCreateMissingPlayers('away') : null}
              creatingPlayers={creatingPlayersFor === 'away'}
              createPlayersMessage={createPlayersResult.away}
            />
          </div>

          <GoalieChangesPanel rows={goalieChanges} setRows={setGoalieChanges} />

          <PeriodScoresEditor
            homeTeamName={homeTeamName}
            awayTeamName={awayTeamName}
            periodHome={periodHome}
            setPeriodHome={setPeriodHome}
            periodAway={periodAway}
            setPeriodAway={setPeriodAway}
          />

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
              Pašpārbaude neatbilst: itemizēto vārtu skaits nesakrīt ar ievadītajiem periodu rezultātiem. Pārbaudi rūpīgi.
            </div>
          )}
          {preview.notes.length > 0 && (
            <div className="bg-amber-950/40 border border-amber-600/40 text-amber-300 text-sm rounded-lg px-4 py-3 space-y-1">
              {preview.notes.map((n, i) => (
                <p key={i}>&bull; {n}</p>
              ))}
            </div>
          )}

          {preview.preview.periodScores && (
            <PeriodScoresTable periodScores={preview.preview.periodScores} homeTeam={preview.homeTeam.name} awayTeam={preview.awayTeam.name} />
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
function TeamProtocolPanel({
  label, teamName, roster, setRoster, goals, setGoals, penalties, setPenalties,
  onCreateMissingPlayers, creatingPlayers, createPlayersMessage,
}) {
  return (
    <div className="bg-card border border-line rounded-lg p-4 space-y-4">
      <h3 className="text-accent font-bold text-sm uppercase tracking-wide">
        {label}
        {teamName && <span className="text-ink font-black normal-case ml-2">{teamName}</span>}
      </h3>

      <RosterEditor roster={roster} setRoster={setRoster} />
      {onCreateMissingPlayers && (
        <div>
          <button
            type="button"
            onClick={onCreateMissingPlayers}
            disabled={creatingPlayers}
            className="text-accent text-xs font-semibold hover:underline disabled:opacity-50"
          >
            {creatingPlayers ? 'Izveido...' : '+ Izveidot iztrūkstošos spēlētājus WP'}
          </button>
          {createPlayersMessage && <p className="text-ink-faint text-xs mt-1">{createPlayersMessage}</p>}
        </div>
      )}
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
    setRoster([...roster, { id: uid(), jersey: '', name: '', poz: '' }])
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">Sastāvs (Nr, Vārds, Uzvārds, Poz.)</p>
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
            <select
              value={r.poz || ''}
              onChange={(e) => updateRow(r.id, 'poz', e.target.value)}
              title="Pozīcija (nosaka Vārtsargs/Aizsargs/Uzbrucējs statistikā)"
              className="w-28 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm focus:outline-none focus:border-accent"
            >
              {POZ_OPTIONS.map((p) => (
                <option key={p} value={p}>{p || 'Poz.'}</option>
              ))}
            </select>
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

// The paper protocol's own "Periodu Rezultāti" footer - per-period goal
// counts for both teams. Purely informational/self-check (see this
// component's own periodHome/periodAway state comment) - never itself
// written to WP, just shown back on the preview via PeriodScoresTable
// and used to catch a transcription slip against the itemized goals.
function PeriodScoresEditor({ homeTeamName, awayTeamName, periodHome, setPeriodHome, periodAway, setPeriodAway }) {
  return (
    <div className="bg-card border border-line rounded-lg p-4 space-y-3">
      <h3 className="text-ink-faint text-xs uppercase tracking-wide font-semibold">
        Periodu rezultāti (nav obligāti) - protokola apakšā izdrukātie rezultāti
      </h3>
      <div className="overflow-x-auto">
        <table className="text-sm text-ink-secondary">
          <thead>
            <tr className="text-xs uppercase text-ink-faint">
              <th className="pr-4 text-left font-semibold"></th>
              <th className="px-2 font-semibold text-center">1.</th>
              <th className="px-2 font-semibold text-center">2.</th>
              <th className="px-2 font-semibold text-center">3.</th>
            </tr>
          </thead>
          <tbody>
            <PeriodRow label={homeTeamName || 'Mājas'} period={periodHome} setPeriod={setPeriodHome} />
            <PeriodRow label={awayTeamName || 'Viesi'} period={periodAway} setPeriod={setPeriodAway} />
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PeriodRow({ label, period, setPeriod }) {
  return (
    <tr>
      <td className="pr-4 font-medium text-ink whitespace-nowrap">{label}</td>
      {['p1', 'p2', 'p3'].map((key) => (
        <td key={key} className="px-2 py-1">
          <input
            type="number"
            value={period[key]}
            onChange={(e) => setPeriod({ ...period, [key]: e.target.value })}
            className="w-16 bg-surface border border-line-strong rounded-md px-2 py-1.5 text-ink text-sm text-center focus:outline-none focus:border-accent"
          />
        </td>
      ))}
    </tr>
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
