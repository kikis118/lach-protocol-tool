import { useEffect, useState } from 'react'
import { pickPdf, parseProtocol, saveGame, getCredentials, setCredentials, validateCredentials, openExternal, getLookups, checkForUpdates, getUpdateStatus, installUpdate, onUpdateStatus } from './api'
import GamePicker from './components/GamePicker'
import PreviewGame from './components/PreviewGame'
import CreateNewGame from './components/CreateNewGame'
import ManualProtocol from './components/ManualProtocol'
import Setup from './components/Setup'
import UpdateBadge from './components/UpdateBadge'

// How long a saved login is trusted without being re-checked against
// WordPress - like a "stay signed in" session rather than a real login
// every launch, but not forever either: if the Application Password
// gets revoked/changed, the next check after this window catches it and
// sends the admin back to Setup instead of failing silently deep in a
// save. ~3 months, per the explicit ask ("months... until major
// changes, then relog").
const REVALIDATE_AFTER_MS = 90 * 24 * 60 * 60 * 1000

export default function App() {
  const [credentials, setCredentialsState] = useState(null) // null = still loading
  const [showSettings, setShowSettings] = useState(false)
  const [revalidationError, setRevalidationError] = useState(null)

  const [filePath, setFilePath] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | failed
  const [saveResult, setSaveResult] = useState(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [manualEntry, setManualEntry] = useState(false)

  const [lookups, setLookups] = useState(null)
  const [seasonIndex, setSeasonIndex] = useState('') // '' = visas sezonas (no scoping)

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
      if (!creds?.username || !creds?.appPassword) return
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
    if (credentials?.username && credentials?.appPassword) {
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
      setSaveState('idle')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave({ baltichockeyUrl, bestPlayers } = {}) {
    setSaveState('saving')
    try {
      // Always sent as a full overwrite (blank clears it) rather than a
      // sparse patch - same convention already used for the stats table
      // writes this payload also carries.
      const payload = {
        ...result.payload,
        _lach_baltichockey_url: baltichockeyUrl || '',
        _lach_best_players: JSON.stringify((bestPlayers || []).map((s) => s.trim()).filter(Boolean)),
      }
      await saveGame(result.game_id, payload)
      setSaveState('saved')
    } catch (err) {
      setSaveState('failed')
      setSaveResult(err.message)
    }
  }

  function handleReset() {
    setFilePath(null)
    setResult(null)
    setError(null)
    setSaveState('idle')
    setCreatingNew(false)
    setManualEntry(false)
  }

  // Only ever offered while nothing has actually been sent to WordPress
  // yet (every call site below hides/disables this once saveState is
  // 'saving') - once a save request is in flight, cancelling the CLIENT
  // side wouldn't reliably stop it: PHP keeps running a request to
  // completion by default even if the caller gives up waiting, so a
  // "cancel" at that point could look like it worked while the write
  // still happens. Safer to just not offer it there than to fake it.
  function handleCancel() {
    if (window.confirm('Vai tiešām vēlies atcelt? Neviena informācija netiks saglabāta.')) {
      handleReset()
    }
  }

  const hasCredentials = credentials?.username && credentials?.appPassword && !revalidationError

  // Logo click = "go home" to the default upload screen. Only wired up
  // once actually logged in - clicking it while Setup is showing (no
  // credentials yet) would have nowhere meaningful to go. Only confirms
  // if there's actually something to lose (matches handleCancel's own
  // guard) - a bare click from the already-default screen should just
  // work, not nag with a confirm dialog for nothing.
  function handleLogoClick() {
    if (!hasCredentials) return
    setShowSettings(false)
    if (filePath || result || creatingNew || manualEntry) {
      handleCancel()
    } else {
      handleReset()
    }
  }

  return (
    <div className="min-h-screen bg-base text-ink-100 font-sans">
      <header className="bg-surface border-b-2 border-accent shadow-lg">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1
            onClick={handleLogoClick}
            className={`text-xl font-black uppercase text-ink tracking-wider ${
              hasCredentials ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
            }`}
          >
            LACH <span className="text-accent">Protokolu Rīks</span>
          </h1>
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
            {!result && !manualEntry && (
              <div className="bg-card border border-line rounded-lg p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-black uppercase text-ink tracking-wide">Augšupielādēt protokolu</h2>
                  <p className="text-ink-faint text-sm mt-1">Izvēlies spēles protokola PDF failu no datora.</p>
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

                <button
                  type="button"
                  onClick={handlePick}
                  disabled={loading}
                  className="bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
                >
                  {loading ? 'Apstrādā...' : 'Izvēlēties failu'}
                </button>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div className="text-center pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setManualEntry(true)}
                    className="text-accent text-sm font-semibold hover:underline"
                  >
                    Nav PDF (rokrakstā rakstīts protokols) - ievadīt ar roku
                  </button>
                </div>
              </div>
            )}

            {manualEntry && (
              <ManualProtocol lookups={lookups} initialSeasonIndex={seasonIndex} onCancel={handleCancel} />
            )}

            {result && (result.status === 'ambiguous' || result.status === 'none') && !creatingNew && (
              <>
                <GamePicker result={result} onPick={(gameId) => handleParse(filePath, gameId)} onCancel={handleCancel} />
                {result.status === 'none' && (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setCreatingNew(true)}
                      className="text-accent text-sm font-semibold hover:underline"
                    >
                      Šī spēle vēl nemaz nepastāv WordPress - izveidot jaunu spēli
                    </button>
                  </div>
                )}
              </>
            )}

            {result && result.status === 'none' && creatingNew && (
              <CreateNewGame
                filePath={filePath}
                parsedTeams={result.parsedTeams}
                meta={result.parsedMeta}
                lookups={lookups}
                initialSeasonIndex={seasonIndex}
                onCancel={handleCancel}
              />
            )}

            {result && result.status === 'matched' && (
              <PreviewGame
                result={result}
                saveState={saveState}
                saveResult={saveResult}
                onSave={handleSave}
                onCancel={handleCancel}
                onOpenExternal={openExternal}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
