import { useEffect, useState } from 'react'
import { pickPdf, parseProtocol, saveGame, getCredentials, openExternal, getLookups, checkForUpdates } from './api'
import GamePicker from './components/GamePicker'
import PreviewGame from './components/PreviewGame'
import CreateNewGame from './components/CreateNewGame'
import Setup from './components/Setup'
import UpdateBadge from './components/UpdateBadge'

export default function App() {
  const [credentials, setCredentialsState] = useState(null) // null = still loading
  const [showSettings, setShowSettings] = useState(false)

  const [filePath, setFilePath] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | failed
  const [saveResult, setSaveResult] = useState(null)
  const [creatingNew, setCreatingNew] = useState(false)

  const [lookups, setLookups] = useState(null)
  const [seasonIndex, setSeasonIndex] = useState('') // '' = visas sezonas (no scoping)

  // Update state lives here (not just inside a header widget) so a
  // prominent banner can show the moment the app opens, per the
  // explicit ask - not something buried behind a click.
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [updateError, setUpdateError] = useState(null)

  useEffect(() => {
    getCredentials().then(setCredentialsState)
    runUpdateCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (credentials?.username && credentials?.appPassword) {
      getLookups().then(setLookups)
    }
  }, [credentials])

  async function runUpdateCheck() {
    setUpdateChecking(true)
    setUpdateError(null)
    try {
      setUpdateInfo(await checkForUpdates())
    } catch (err) {
      setUpdateError(err.message)
    } finally {
      setUpdateChecking(false)
    }
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

  async function handleSave() {
    setSaveState('saving')
    try {
      await saveGame(result.game_id, result.payload)
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

  const hasCredentials = credentials?.username && credentials?.appPassword

  return (
    <div className="min-h-screen bg-base text-ink-100 font-sans">
      <header className="bg-surface border-b-2 border-accent shadow-lg">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-black uppercase text-ink tracking-wider">
            LACH <span className="text-accent">Protokolu Rīks</span>
          </h1>
          <div className="flex items-center gap-4">
            <UpdateBadge checking={updateChecking} info={updateInfo} error={updateError} onRecheck={runUpdateCheck} />
            {hasCredentials && (
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="text-ink-faint text-sm font-semibold hover:text-ink"
              >
                Iestatījumi
              </button>
            )}
          </div>
        </div>
      </header>

      {updateInfo?.hasUpdate && (
        <div className="bg-accent text-ink px-4 py-3 flex flex-wrap items-center justify-center gap-3 font-bold text-sm">
          <span>🔔 Pieejama jauna versija: {updateInfo.latestVersion} (tev: {updateInfo.currentVersion})</span>
          <button
            type="button"
            onClick={() => openExternal(updateInfo.releaseUrl)}
            className="bg-ink text-accent px-4 py-1.5 rounded-md uppercase text-xs tracking-wide hover:bg-gray-200 transition-colors"
          >
            Lejupielādēt →
          </button>
        </div>
      )}

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {credentials === null ? null : !hasCredentials || showSettings ? (
          <Setup
            initial={credentials}
            onSaved={(creds) => {
              setCredentialsState(creds)
              setShowSettings(false)
            }}
          />
        ) : (
          <>
            {!result && (
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
                  className="bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Apstrādā...' : 'Izvēlēties failu'}
                </button>
                {error && <p className="text-red-400 text-sm">{error}</p>}
              </div>
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
