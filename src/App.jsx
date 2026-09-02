import { useRef, useState } from 'react'
import { parseProtocol, saveGame } from './api'
import GamePicker from './components/GamePicker'
import PreviewGame from './components/PreviewGame'

export default function App() {
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | failed
  const [saveResult, setSaveResult] = useState(null)

  async function handleParse(gameId) {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const body = await parseProtocol(file, gameId)
      setResult(body)
      setSaveState('idle')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0] || null
    setFile(f)
    setResult(null)
    setError(null)
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
    setFile(null)
    setResult(null)
    setError(null)
    setSaveState('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="min-h-screen bg-base text-ink-100 font-sans">
      <header className="bg-surface border-b-2 border-accent shadow-lg">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-xl font-black uppercase text-ink tracking-wider">
            LACH <span className="text-accent">Protokolu Rīks</span>
          </h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {!result && (
          <div className="bg-card border border-line rounded-lg p-6 space-y-4">
            <div>
              <h2 className="text-lg font-black uppercase text-ink tracking-wide">Augšupielādēt protokolu</h2>
              <p className="text-ink-faint text-sm mt-1">Izvēlies spēles protokola PDF failu no datora.</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-ink-secondary file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-accent file:text-ink file:font-bold file:uppercase file:text-xs file:tracking-wide file:cursor-pointer hover:file:bg-red-600"
            />
            <button
              type="button"
              onClick={() => handleParse()}
              disabled={!file || loading}
              className="bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {loading ? 'Apstrādā...' : 'Augšupielādēt'}
            </button>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>
        )}

        {result && (result.status === 'ambiguous' || result.status === 'none') && (
          <GamePicker result={result} onPick={(gameId) => handleParse(gameId)} />
        )}

        {result && result.status === 'matched' && (
          <PreviewGame
            result={result}
            saveState={saveState}
            saveResult={saveResult}
            onSave={handleSave}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  )
}
