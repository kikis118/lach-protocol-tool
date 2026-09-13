import { useState } from 'react'
import { setCredentials, validateCredentials } from '../api'

// Shown on first run (no credentials saved yet) and from "Iestatījumi" any
// time after. Two modes now (2026-09-13):
// - "Application Password" - the original per-installer WordPress
//   Application Password, generated under the shared LHL_admin1 account.
//   Only Kristians himself is expected to use this mode (he knows where to
//   find/generate one) - the step-by-step "how to find it" guide that used
//   to live on this screen was dropped for exactly that reason, not because
//   the feature changed.
// - "PIN" - a short shared secret WordPress translates server-side into the
//   same LHL_admin1 identity (see lach-hockey-app's lach-helper-pin-auth.php)
//   without this app ever holding the real Application Password. This is
//   the mode meant for helpers - easy to share, easy to rotate, and a leak
//   never exposes the real WordPress credential.
//
// Acts like a real login (checks the candidate credentials against
// WordPress before accepting them) and stamps a `validatedAt` time App.jsx
// uses to silently re-check every so often, so this screen only reappears
// the first time or once credentials actually stop working.
export default function Setup({ initial, onSaved, revalidationError }) {
  const [mode, setMode] = useState(initial?.mode || 'password')
  const [username, setUsername] = useState(initial?.username || 'LHL_admin1')
  const [appPassword, setAppPassword] = useState(initial?.appPassword || '')
  const [pin, setPin] = useState(initial?.pin || '')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const canSave = mode === 'pin' ? Boolean(pin) : Boolean(username && appPassword)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const result = await validateCredentials({ mode, username, appPassword, pin })
      if (!result.valid) {
        setError(result.error || 'Nepareizi pieslēgšanās dati')
        return
      }
      const creds = { mode, username, appPassword, pin, validatedAt: new Date().toISOString() }
      await setCredentials(creds)
      onSaved(creds)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card border border-line rounded-lg p-6 space-y-4 mx-auto mt-12 max-w-md">
      <div>
        <h2 className="text-lg font-black uppercase text-ink tracking-wide">Pieslēgšanās</h2>
        {revalidationError && (
          <p className="text-amber-400 text-sm font-semibold mt-2">
            Iepriekšējie pieslēgšanās dati vairs nav derīgi ({revalidationError}) - lūdzu pieslēdzies no jauna.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('password')}
          className={`flex-1 text-xs font-bold uppercase tracking-wide px-3 py-2 rounded-lg border transition-colors ${
            mode === 'password' ? 'border-accent text-ink bg-accent/10' : 'border-line-strong text-ink-faint'
          }`}
        >
          Application Password
        </button>
        <button
          type="button"
          onClick={() => setMode('pin')}
          className={`flex-1 text-xs font-bold uppercase tracking-wide px-3 py-2 rounded-lg border transition-colors ${
            mode === 'pin' ? 'border-accent text-ink bg-accent/10' : 'border-line-strong text-ink-faint'
          }`}
        >
          PIN kods
        </button>
      </div>

      {mode === 'password' ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">Lietotājvārds</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm transition-all focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 hover:border-ink-faint"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">Application Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 pr-10 text-ink text-sm transition-all focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 hover:border-ink-faint"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Slēpt paroli' : 'Rādīt paroli'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-secondary transition-colors"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">PIN kods</label>
          <input
            type="text"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm transition-all focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 hover:border-ink-faint"
          />
        </div>
      )}

      {error && <p className="text-red-400 text-sm font-semibold">{error}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave || saving}
        className="bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
      >
        {saving ? 'Pārbauda...' : 'Pieslēgties'}
      </button>
    </div>
  )
}
