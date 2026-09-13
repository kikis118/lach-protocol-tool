import { useEffect, useRef, useState } from 'react'
import { pickPdf, parseProtocol, getCredentials, setCredentials, validateCredentials, openExternal, getLookups, checkForUpdates, getUpdateStatus, installUpdate, onUpdateStatus } from './api'
import GamePicker from './components/GamePicker'
import GameEditor from './components/GameEditor'
import Setup from './components/Setup'
import UpdateBadge from './components/UpdateBadge'
import { FREQUENT_TOOLS, RARE_TOOLS, DEV_TOOLS } from './components/admin/toolSections'
import GlobalSearch from './components/admin/GlobalSearch'
import ScheduleCorrection from './components/admin/ScheduleCorrection'
import RosterManagement from './components/admin/RosterManagement'
import TeamEditor from './components/admin/TeamEditor'
import BulkImportGames from './components/admin/BulkImportGames'
import MiniTournament from './components/admin/MiniTournament'
import Diagnostics from './components/admin/Diagnostics'
import { listHistory, removeHistoryEntry, newHistoryId } from './protocolHistory'
import sampleProtocolImg from './assets/sample-protocol-preview.png'

// How long a saved login is trusted without being re-checked against
// WordPress - like a "stay signed in" session rather than a real login
// every launch, but not forever either: if the Application Password
// gets revoked/changed, the next check after this window catches it and
// sends the admin back to Setup instead of failing silently deep in a
// save. ~3 months, per the explicit ask ("months... until major
// changes, then relog").
const REVALIDATE_AFTER_MS = 90 * 24 * 60 * 60 * 1000

// Two credential shapes now (see Setup.jsx): 'pin' mode only needs a pin,
// 'password' mode needs username+appPassword - checked in every place that
// used to just look at username/appPassword directly.
function hasLoginCreds(creds) {
  if (!creds) return false
  return creds.mode === 'pin' ? Boolean(creds.pin) : Boolean(creds.username && creds.appPassword)
}

export default function App() {
  const [credentials, setCredentialsState] = useState(null) // null = still loading
  const [showSettings, setShowSettings] = useState(false)
  const [revalidationError, setRevalidationError] = useState(null)

  const [filePath, setFilePath] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [manualEntry, setManualEntry] = useState(false)
  // null = home screen. Anything else = one specific admin tool open,
  // picked directly from the sectioned cards on the home screen (see
  // toolSections.js) - no separate menu step. A tool's own "Aizvērt" goes
  // back to null; the header's "← Atpakaļ" (handleCancel) does the same via
  // handleReset, same as every other flow in this file.
  const [adminScreen, setAdminScreen] = useState(null)
  // Extra props for whichever admin screen is open - only ever populated
  // by GlobalSearch's "jump straight to this team/game" results
  // (initialTeamId/initialGameId); every other way of opening a tool
  // starts blank.
  const [adminScreenParams, setAdminScreenParams] = useState({})
  function openAdminScreen(key, params = {}) {
    setAdminScreenParams(params)
    setAdminScreen(key)
  }
  const manualProtocolRef = useRef(null)
  // Same dirty-tracking contract every admin tool screen now implements
  // via forwardRef: { isDirty(), hasDraftSafety()? } - see handleCancel.
  const adminScreenRef = useRef(null)
  // Which history entry the currently-open GameEditor is attached to - a
  // fresh id whenever it opens fresh (manual entry, a new PDF upload that
  // matched an existing game, or "Izveidot jaunu spēli" for one that
  // didn't), or an existing entry's own id + its saved data when resuming
  // a draft from the list below. Refreshed from localStorage every time
  // the main screen is shown (mount, and whenever handleReset returns
  // here), not kept live while the child is open - it autosaves to the
  // SAME id, so nothing is lost either way.
  const [historyList, setHistoryList] = useState(() => listHistory())
  const [activeHistoryId, setActiveHistoryId] = useState(null)
  const [activeHistoryData, setActiveHistoryData] = useState(null)

  const [lookups, setLookups] = useState(null)
  const [seasonIndex, setSeasonIndex] = useState('') // '' = visas sezonas (no scoping)
  const [showSampleProtocol, setShowSampleProtocol] = useState(false)

  // In-app confirm modal, replacing window.confirm() everywhere in this
  // file - a real bug, not just cosmetic: Electron/Chromium has a known
  // quirk where native dialogs (window.confirm/alert) can leave the
  // renderer's focus in a bad state for a few seconds after closing,
  // specifically affecting native form controls like <select> - matches
  // exactly what was reported ("back from cancelling a protocol, the
  // Sezona/turnīrs dropdown is unclickable for a few seconds"). A custom
  // React modal never triggers a native dialog at all, so this class of
  // bug can't happen. `askConfirm` returns a Promise instead of
  // blocking synchronously, resolved by whichever button gets clicked.
  const [confirmState, setConfirmState] = useState(null) // { message, danger, resolve } | null
  // `danger: true` renders the message in red - reserved for the one case
  // that actually matters (leaving would genuinely discard unsaved data
  // with no autosave behind it). Every other confirm in this file is a
  // neutral "are you sure", not a warning.
  function askConfirm(message, { danger = false } = {}) {
    return new Promise((resolve) => setConfirmState({ message, danger, resolve }))
  }
  function answerConfirm(answer) {
    confirmState?.resolve(answer)
    setConfirmState(null)
  }

  // Update state lives here (not just inside a header widget) so a
  // prominent banner can show the moment the app opens, per the
  // explicit ask - not something buried behind a click. Driven by
  // electron-updater's real event stream (checking/downloading/
  // downloaded/error), pushed from the main process as it happens
  // rather than polled - `runUpdateCheck` just kicks a check off, the
  // subscription below is what actually updates this state.
  const [updateStatus, setUpdateStatus] = useState({ state: 'idle' })

  useEffect(() => {
    getCredentials().then(async (creds) => {
      setCredentialsState(creds)
      if (!hasLoginCreds(creds)) return
      const age = creds.validatedAt ? Date.now() - new Date(creds.validatedAt).getTime() : Infinity
      if (age < REVALIDATE_AFTER_MS) return
      const check = await validateCredentials(creds)
      if (check.valid) {
        const refreshed = { ...creds, validatedAt: new Date().toISOString() }
        await setCredentials(refreshed)
        setCredentialsState(refreshed)
      } else {
        // Credentials themselves are kept (so Setup can prefill them for
        // editing) but no longer treated as "logged in" - hasCredentials
        // below only looks at username/appPassword, so this alone
        // wouldn't force Setup back open without the check further down.
        setRevalidationError(check.error)
      }
    })
    const unsubscribe = onUpdateStatus(setUpdateStatus)
    getUpdateStatus().then(setUpdateStatus)
    runUpdateCheck()
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (hasLoginCreds(credentials)) {
      getLookups().then(setLookups)
    }
  }, [credentials])

  function runUpdateCheck() {
    checkForUpdates().then(setUpdateStatus)
  }

  async function handlePick() {
    const path = await pickPdf()
    if (!path) return
    setFilePath(path)
    setResult(null)
    setError(null)
    await handleParse(path)
  }

  async function handleParse(path, gameId) {
    setLoading(true)
    setError(null)
    try {
      const seasonId = lookups?.seasonCombos[seasonIndex]?.seasonId
      const body = await parseProtocol(path ?? filePath, gameId, gameId ? undefined : seasonId)
      setResult(body)
      // A matched game drops straight into GameEditor (no extra click, see
      // render below) - give it a fresh history entry right away, same as
      // handleStartManualEntry does, so its autosave/dirty-tracking works
      // uniformly regardless of how the editor was opened. The unmatched
      // ("creatingNew") path gets its own historyId only once that button
      // is actually clicked, below.
      if (body.status === 'matched') {
        setActiveHistoryId(newHistoryId())
        setActiveHistoryData(null)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setFilePath(null)
    setResult(null)
    setError(null)
    setCreatingNew(false)
    setManualEntry(false)
    setAdminScreen(null)
    setAdminScreenParams({})
    setActiveHistoryId(null)
    setActiveHistoryData(null)
    setHistoryList(listHistory())
  }

  function handleStartManualEntry() {
    setActiveHistoryId(newHistoryId())
    setActiveHistoryData(null)
    setManualEntry(true)
  }

  // Also how an ALREADY-PUBLISHED entry gets re-opened for editing (no
  // wp-admin detour, per explicit ask) - forced to mode 'existing' +
  // existingGameId regardless of how it was originally created (a plain
  // "new game" post still has a real game_id after its first publish),
  // since from this point on it's always "update this specific game",
  // never "create another one". finish-scheduled-game.php (lach-hockey-
  // app repo) accepts this even when the game is already finished -
  // it replaces the result rather than refusing.
  function handleResumeHistoryEntry(entry) {
    setActiveHistoryId(entry.id)
    setActiveHistoryData(
      entry.status === 'saved' && entry.gameId
        ? { ...entry.data, mode: 'existing', existingGameId: String(entry.gameId) }
        : entry.data,
    )
    setManualEntry(true)
  }

  async function handleDeleteHistoryEntry(id) {
    if (!(await askConfirm('Vai tiešām dzēst šo protokolu no saraksta?'))) return
    removeHistoryEntry(id)
    setHistoryList(listHistory())
  }

  // Only ever offered while nothing has actually been sent to WordPress
  // yet (GameEditor's own saveState hides/disables this once it's
  // 'saving') - once a save request is in flight, cancelling the CLIENT
  // side wouldn't reliably stop it: PHP keeps running a request to
  // completion by default even if the caller gives up waiting, so a
  // "cancel" at that point could look like it worked while the write
  // still happens. Safer to just not offer it there than to fake it.
  //
  // GameEditor autosaves its own draft (now regardless of whether it was
  // opened via manual entry, a PDF that matched nothing, or a PDF that
  // matched an existing game - all three get a historyId, see handleParse/
  // the "Izveidot jaunu spēli" button below), so "you'll lose everything"
  // is usually just false - only ask when there's a real, not-yet-
  // persisted change (the ref's isDirty), and word it as a save prompt
  // rather than a data-loss warning. Answering yes force-flushes that
  // draft before leaving, so it's never a race against the ~800ms debounce.
  async function handleCancel() {
    const editorOpen = manualEntry || creatingNew || result?.status === 'matched'
    if (editorOpen && manualProtocolRef.current) {
      if (!manualProtocolRef.current.isDirty()) {
        handleReset()
        return
      }
      if (await askConfirm('Protokols nav saglabāts. Saglabāt?')) {
        manualProtocolRef.current.flushDraft()
        handleReset()
      }
      return
    }
    // Same contract, for whichever admin tool screen is open (schedule/
    // roster/team-editor/bulk-import/mini-tournament/diagnostics - see
    // each file's own useImperativeHandle). `hasDraftSafety()` means the
    // screen autosaves its own draft (roster/bulk-import/mini-tournament),
    // so leaving never loses anything worth warning about - just go.
    // Otherwise, only warn when something was actually entered, and only
    // THEN in the red "this will not be saved" tone - never for a screen
    // nothing was typed into yet.
    if (adminScreen && adminScreenRef.current) {
      if (adminScreenRef.current.hasDraftSafety?.() || !adminScreenRef.current.isDirty()) {
        handleReset()
        return
      }
      if (await askConfirm('Aizverot šo, ievadītie dati NETIKS saglabāti. Vai tiešām vēlies iziet?', { danger: true })) {
        handleReset()
      }
      return
    }
    if (await askConfirm('Vai tiešām vēlies atcelt? Neviena informācija netiks saglabāta.')) {
      handleReset()
    }
  }

  const hasCredentials = hasLoginCreds(credentials) && !revalidationError
  // Same exact-match convention as GameEditor.jsx's own isDevUser - gates
  // DEV_TOOLS (raw diagnostics) to one personal login, now that
  // GlobalSearch covers the everyday "find and fix something" need for
  // everyone else.
  const isKikis = (credentials?.username || '').trim().toLowerCase() === 'kikis'
  // Whether there's actually somewhere to go "back" FROM - same
  // condition the explicit back button (below) uses to decide whether
  // to show itself at all.
  const hasSomethingOpen = Boolean(filePath || result || creatingNew || manualEntry || adminScreen)

  // Logo click = same "go back" action as the explicit button - kept
  // working for muscle memory, but per explicit feedback ("not obvious
  // to click the logo every time") it's no longer the ONLY way back.
  // Only wired up once actually logged in - clicking it while Setup is
  // showing (no credentials yet) would have nowhere meaningful to go.
  // Only confirms if there's actually something to lose (matches
  // handleCancel's own guard) - a bare click from the already-default
  // screen should just work, not nag with a confirm dialog for nothing.
  function handleLogoClick() {
    if (!hasCredentials) return
    setShowSettings(false)
    if (hasSomethingOpen) {
      handleCancel()
    } else {
      handleReset()
    }
  }

  return (
    <div className="min-h-screen bg-base text-ink-100 font-sans">
      <header className="bg-surface border-b-2 border-accent shadow-lg">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {hasCredentials && hasSomethingOpen && (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1.5 text-ink-secondary hover:text-ink font-bold uppercase text-sm tracking-wide transition-colors"
              >
                &larr; Atpakaļ
              </button>
            )}
            <h1
              onClick={handleLogoClick}
              className={`text-xl font-black uppercase text-ink tracking-wider ${
                hasCredentials ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
              }`}
            >
              LACH <span className="text-accent">Administrēšana</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <UpdateBadge status={updateStatus} onRecheck={runUpdateCheck} />
            {hasCredentials && (
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="text-ink-faint text-sm font-semibold hover:text-ink transition-colors"
              >
                Autorizēties
              </button>
            )}
          </div>
        </div>
      </header>

      {updateStatus.state === 'downloading' && (
        <div className="bg-accent text-ink px-4 py-3 flex flex-wrap items-center justify-center gap-3 font-bold text-sm">
          <span>
            ⬇ Lejupielādē atjauninājumu {updateStatus.version}
            {typeof updateStatus.percent === 'number' ? ` (${updateStatus.percent}%)` : '...'}
          </span>
        </div>
      )}

      {updateStatus.state === 'downloaded' && (
        <div className="bg-accent text-ink px-4 py-3 flex flex-wrap items-center justify-center gap-3 font-bold text-sm">
          <span>🔔 Versija {updateStatus.version} lejupielādēta un gatava uzstādīšanai</span>
          <button
            type="button"
            onClick={() => installUpdate()}
            className="bg-ink text-accent px-4 py-1.5 rounded-md uppercase text-xs tracking-wide hover:bg-gray-200 transition-colors"
          >
            Restartēt un uzstādīt →
          </button>
        </div>
      )}

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {credentials === null ? null : !hasCredentials || showSettings ? (
          <Setup
            initial={credentials}
            revalidationError={revalidationError}
            onSaved={(creds) => {
              setCredentialsState(creds)
              setShowSettings(false)
              setRevalidationError(null)
            }}
          />
        ) : (
          <>
            {!result && !manualEntry && !adminScreen && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                <div className="bg-card border border-line rounded-lg p-6 space-y-4 flex flex-col">
                  <div>
                    <h2 className="text-lg font-black uppercase text-ink tracking-wide">📄 Augšupielādēt protokolu</h2>
                    <p className="text-ink-faint text-sm mt-1">
                      Tikai PDF formātā - oficiālais elektroniskais protokols, ko sistēma automātiski nolasa un sasaista ar spēli.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowSampleProtocol(true)}
                      className="text-accent text-xs font-bold uppercase tracking-wide mt-2 hover:underline"
                    >
                      Skatīt parauga protokolu →
                    </button>
                  </div>

                  {lookups && (
                    <div>
                      <label className="block text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">
                        Sezona / turnīrs
                      </label>
                      <select
                        value={seasonIndex}
                        onChange={(e) => setSeasonIndex(e.target.value)}
                        className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
                      >
                        <option value="">Visas sezonas</option>
                        {lookups.seasonCombos.map((s, i) => (
                          <option key={s.seasonId} value={i}>
                            {s.seasonName} ({s.tournamentName})
                          </option>
                        ))}
                      </select>
                      <p className="text-ink-faint text-xs mt-1">
                        Ja izvēlēta sezona, protokols tiks meklēts tikai tajā - precīzāk un ātrāk.
                      </p>
                      <p className="text-ink-faint text-xs mt-1">
                        Ja neredzi pareizo sezonu vai turnīru, vienkārši atstāj "Visas sezonas".
                      </p>
                    </div>
                  )}

                  <div className="mt-auto">
                    <button
                      type="button"
                      onClick={handlePick}
                      disabled={loading}
                      className="bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
                    >
                      {loading ? 'Apstrādā...' : 'Izvēlēties failu'}
                    </button>
                    {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                  </div>
                </div>

                <div className="bg-card border border-line rounded-lg p-6 space-y-4 flex flex-col">
                  <div>
                    <h2 className="text-lg font-black uppercase text-ink tracking-wide">✍️ Izveidot / labot spēli</h2>
                    <p className="text-ink-faint text-sm mt-1">
                      Nav PDF faila vai gribi ievadīt visu pats: izveido jaunu spēli vai pievieno rezultātu
                      jau ieplānotai, tāpat kā uz papīra.
                    </p>
                  </div>
                  <div className="mt-auto">
                    <button
                      type="button"
                      onClick={handleStartManualEntry}
                      className="bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      Izveidot spēli
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!result && !manualEntry && !adminScreen && (
              <GlobalSearch lookups={lookups} onNavigate={openAdminScreen} />
            )}

            {!result && !manualEntry && !adminScreen && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FREQUENT_TOOLS.map((t) => (
                  <ToolCard key={t.key} tool={t} onClick={() => openAdminScreen(t.key)} />
                ))}
              </div>
            )}

            {!result && !manualEntry && !adminScreen && (
              <hr className="border-t border-line" />
            )}

            {!result && !manualEntry && !adminScreen && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...RARE_TOOLS, ...(isKikis ? DEV_TOOLS : [])].map((t) => (
                  <ToolCard key={t.key} tool={t} onClick={() => openAdminScreen(t.key)} />
                ))}
              </div>
            )}

            {!result && !manualEntry && !adminScreen && historyList.length > 0 && (
              <div className="bg-card border border-line rounded-lg p-6 space-y-3">
                <h2 className="text-lg font-black uppercase text-ink tracking-wide">Protokolu vēsture</h2>
                <div className="space-y-2">
                  {historyList.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 bg-surface border border-line-strong rounded-md px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => handleResumeHistoryEntry(entry)}
                        title={entry.status === 'saved' ? 'Atvērt un labot rīkā' : 'Turpināt melnrakstu'}
                        className="flex-1 text-left"
                      >
                        <span className="text-ink font-semibold text-sm">
                          {entry.homeTeamName || 'Mājas'} vs {entry.awayTeamName || 'Viesi'}
                        </span>
                        {entry.kickoff && (
                          <span className="text-ink-faint text-xs ml-2">{entry.kickoff.replace('T', ' ')}</span>
                        )}
                      </button>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
                          entry.status === 'saved'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {entry.status === 'saved' ? 'Publicēts' : 'Melnraksts'}
                      </span>
                      {entry.status === 'saved' && entry.gameId && (
                        <button
                          type="button"
                          onClick={() => openExternal(`https://lach.lv/wp-admin/post.php?post=${entry.gameId}&action=edit`)}
                          aria-label="Atvērt WP-Admin"
                          title="Atvērt WP-Admin"
                          className="w-7 h-7 shrink-0 rounded-md text-ink-faint hover:text-accent hover:bg-accent/10 transition-colors flex items-center justify-center text-xs"
                        >
                          ↗
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteHistoryEntry(entry.id)}
                        aria-label="Dzēst"
                        title="Dzēst"
                        className="w-7 h-7 shrink-0 rounded-md text-ink-faint hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-center"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {manualEntry && (
              <GameEditor
                ref={manualProtocolRef}
                lookups={lookups}
                initialSeasonIndex={seasonIndex}
                credentials={credentials}
                historyId={activeHistoryId}
                initialData={activeHistoryData}
                onCancel={handleCancel}
                askConfirm={askConfirm}
              />
            )}

            {result && (result.status === 'ambiguous' || result.status === 'none') && !creatingNew && (
              <>
                <GamePicker result={result} onPick={(gameId) => handleParse(filePath, gameId)} onCancel={handleCancel} />
                {result.status === 'none' && (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveHistoryId(newHistoryId())
                        setActiveHistoryData(null)
                        setCreatingNew(true)
                      }}
                      className="text-accent text-sm font-semibold hover:underline"
                    >
                      Šī spēle vēl nemaz nepastāv WordPress - izveidot jaunu spēli
                    </button>
                  </div>
                )}
              </>
            )}

            {result && result.status === 'none' && creatingNew && (
              <GameEditor
                ref={manualProtocolRef}
                lookups={lookups}
                initialSeasonIndex={seasonIndex}
                credentials={credentials}
                historyId={activeHistoryId}
                initialData={activeHistoryData}
                prefill={{ filePath, meta: result.parsedMeta, parsedTeams: result.parsedTeams }}
                onCancel={handleCancel}
                askConfirm={askConfirm}
              />
            )}

            {result && result.status === 'matched' && (
              <GameEditor
                ref={manualProtocolRef}
                lookups={lookups}
                initialSeasonIndex={seasonIndex}
                credentials={credentials}
                historyId={activeHistoryId}
                initialData={activeHistoryData}
                prefill={{ filePath, matched: result }}
                onCancel={handleCancel}
                askConfirm={askConfirm}
              />
            )}

            {adminScreen === 'schedule' && (
              <ScheduleCorrection
                ref={adminScreenRef}
                lookups={lookups}
                initialGameId={adminScreenParams.initialGameId}
                onCancel={handleCancel}
              />
            )}
            {adminScreen === 'roster' && (
              <RosterManagement
                ref={adminScreenRef}
                lookups={lookups}
                initialTeamId={adminScreenParams.initialTeamId}
                onCancel={handleCancel}
                askConfirm={askConfirm}
              />
            )}
            {adminScreen === 'teamEditor' && (
              <TeamEditor
                ref={adminScreenRef}
                lookups={lookups}
                initialTeamId={adminScreenParams.initialTeamId}
                onCancel={handleCancel}
              />
            )}
            {adminScreen === 'bulkImport' && (
              <BulkImportGames ref={adminScreenRef} lookups={lookups} onCancel={handleCancel} />
            )}
            {adminScreen === 'miniTournament' && (
              <MiniTournament ref={adminScreenRef} lookups={lookups} onCancel={handleCancel} />
            )}
            {adminScreen === 'diagnostics' && <Diagnostics ref={adminScreenRef} onCancel={handleCancel} />}
          </>
        )}
      </main>

      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          danger={confirmState.danger}
          onYes={() => answerConfirm(true)}
          onNo={() => answerConfirm(false)}
        />
      )}
      {showSampleProtocol && <SampleProtocolModal onClose={() => setShowSampleProtocol(false)} />}
    </div>
  )
}

function ToolCard({ tool, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-card border border-line rounded-lg p-5 space-y-2 hover:border-accent transition-colors"
    >
      <h3 className="text-base font-black uppercase text-ink tracking-wide">
        {tool.icon && <span className="mr-2">{tool.icon}</span>}
        {tool.title}
      </h3>
      <p className="text-ink-faint text-sm">{tool.desc}</p>
    </button>
  )
}

function SampleProtocolModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-line-strong rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 space-y-2 shrink-0">
          <h2 className="text-lg font-black uppercase text-ink tracking-wide">Parauga protokols</h2>
          <p className="text-ink-secondary text-sm">
            Šādi izskatās oficiālais LHL elektroniskais protokols, ko šis rīks prot automātiski nolasīt no PDF.
          </p>
          <p className="text-red-400 text-sm font-bold">
            Rokrakstā aizpildīts vai nofotografēts protokols NEDARBOSIES - sistēma to nevar nolasīt.
            Der tikai PDF fails tieši šādā formātā. Ja protokols ir rokrakstā, izmanto "Ievadīt ar roku".
          </p>
        </div>
        <div className="overflow-auto px-6 flex-1 bg-inset">
          <img src={sampleProtocolImg} alt="Parauga protokols" className="w-full h-auto rounded border border-line" />
        </div>
        <div className="p-6 pt-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 transition-colors"
          >
            Aizvērt
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmModal({ message, danger, onYes, onNo }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-line-strong rounded-lg shadow-xl p-6 max-w-sm w-full space-y-4">
        <p className={danger ? 'text-red-400 text-sm font-bold' : 'text-ink text-sm'}>{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onNo}
            className="bg-card border border-line-strong text-ink-secondary hover:border-accent hover:text-ink font-bold uppercase text-xs tracking-wide px-4 py-2 rounded-lg transition-colors"
          >
            Nē
          </button>
          <button
            type="button"
            onClick={onYes}
            className="bg-accent text-ink font-bold uppercase text-xs tracking-wide px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
          >
            Jā
          </button>
        </div>
      </div>
    </div>
  )
}
