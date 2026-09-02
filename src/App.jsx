import { useEffect, useState } from 'react'
import { pickPdf, parseProtocol, saveGame, getCredentials, openExternal } from './api'
import GamePicker from './components/GamePicker'
import PreviewGame from './components/PreviewGame'
import CreateNewGame from './components/CreateNewGame'
import Setup from './components/Setup'

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

  useEffect(() => {
    getCredentials().then(setCredentialsState)
  }, [])

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
      const body = await parseProtocol(path ?? filePath, gameId)
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

  const hasCredentials = credentials?.username && credentials?.appPassword

  return (
    <div className="min-h-screen bg-base text-ink-100 font-sans">
      <header className="bg-surface border-b-2 border-accent shadow-lg">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-black uppercase text-ink tracking-wider">
            LACH <span className="text-accent">Protokolu Rīks</span>
          </h1>
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
      </header>

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
                <GamePicker result={result} onPick={(gameId) => handleParse(filePath, gameId)} />
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
              <CreateNewGame filePath={filePath} parsedTeams={result.parsedTeams} meta={result.parsedMeta} onReset={handleReset} />
            )}

            {result && result.status === 'matched' && (
              <PreviewGame
                result={result}
                saveState={saveState}
                saveResult={saveResult}
                onSave={handleSave}
                onReset={handleReset}
                onOpenExternal={openExternal}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
