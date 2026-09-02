import { useState } from 'react'
import { checkForUpdates, openExternal } from '../api'

// Just a check, not a real auto-updater - see electron/main.mjs's
// updates:check handler for why. Shows the result inline next to the
// button rather than a modal, since it's a low-stakes, dismissable bit
// of info, not something that should interrupt the current task.
export default function UpdateChecker() {
  const [state, setState] = useState('idle') // idle | checking | done | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleCheck() {
    setState('checking')
    setError(null)
    try {
      const r = await checkForUpdates()
      setResult(r)
      setState('done')
    } catch (err) {
      setError(err.message)
      setState('error')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleCheck}
        disabled={state === 'checking'}
        className="text-ink-faint text-sm font-semibold hover:text-ink disabled:opacity-50"
      >
        {state === 'checking' ? 'Pārbauda...' : 'Pārbaudīt atjauninājumus'}
      </button>

      {state === 'done' && result.latestVersion === null && (
        <span className="text-ink-faint text-xs">nav publicēta neviena versija</span>
      )}
      {state === 'done' && result.latestVersion !== null && !result.hasUpdate && (
        <span className="text-emerald-400 text-xs font-semibold">jaunākā versija ✓</span>
      )}
      {state === 'done' && result.hasUpdate && (
        <button
          type="button"
          onClick={() => openExternal(result.releaseUrl)}
          className="text-accent text-xs font-bold hover:underline"
        >
          Pieejama jauna versija {result.latestVersion} →
        </button>
      )}
      {state === 'error' && <span className="text-red-400 text-xs">Neizdevās pārbaudīt: {error}</span>}
    </div>
  )
}
