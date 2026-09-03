import { useState } from 'react'
import { setCredentials, validateCredentials, openExternal } from '../api'
import WpAdminGuide from './WpAdminGuide'

// Shown on first run (no credentials saved yet) and from "Iestatījumi"
// any time after - each person who installs this app enters their OWN
// Application Password here (under the shared LHL_admin1 account this
// tool is distributed under - the username defaults to that so every
// installer only has to generate their own Application Password, not
// also know/type the account name), stored in a local JSON file on
// their own machine only (see electron/main.mjs credentialsPath()),
// never bundled with the app and never sent anywhere but lach.lv itself.
//
// Acts like a real login now (was previously just "save whatever's
// typed, find out later if it was wrong"): checks the credentials
// against WordPress's own /wp/v2/users/me before accepting them, and
// stamps a `validatedAt` time that App.jsx uses to silently re-check
// every so often - so this screen only reappears again either the
// first time, or once those credentials actually stop working (a
// revoked/changed Application Password), not on every single launch.
export default function Setup({ initial, onSaved, revalidationError }) {
  const [username, setUsername] = useState(initial?.username || 'LHL_admin1')
  const [appPassword, setAppPassword] = useState(initial?.appPassword || '')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const result = await validateCredentials({ username, appPassword })
      if (!result.valid) {
        setError(result.error || 'Nepareizi pieslēgšanās dati')
        return
      }
      const creds = { username, appPassword, validatedAt: new Date().toISOString() }
      await setCredentials(creds)
      onSaved(creds)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={`bg-card border border-line rounded-lg p-6 space-y-4 mx-auto mt-12 transition-all ${showGuide ? 'max-w-2xl' : 'max-w-md'}`}
    >
      <div>
        <h2 className="text-lg font-black uppercase text-ink tracking-wide">WordPress pieslēgšanās dati</h2>
        <p className="text-ink-faint text-sm mt-1">
          Nepieciešams WordPress lietotājvārds un Application Password (izveido to lach.lv wp-admin &rarr; Lietotāji &rarr;
          Profils &rarr; Application Passwords).
        </p>
        {revalidationError && (
          <p className="text-amber-400 text-sm font-semibold mt-2">
            Iepriekšējie pieslēgšanās dati vairs nav derīgi ({revalidationError}) - lūdzu pieslēdzies no jauna.
          </p>
        )}
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="bg-card border border-line-strong text-ink-secondary hover:border-accent hover:text-ink font-semibold text-sm px-4 py-2 rounded-lg transition-all hover:scale-[1.02] active:scale-[0.98] mt-3"
        >
          {showGuide ? 'Paslēpt soli pa solim' : 'Kā to atrast? Rādīt soli pa solim →'}
        </button>
        {showGuide && (
          <div className="mt-3 space-y-3">
            <div className="text-center">
              <button
                type="button"
                onClick={() => openExternal('https://lach.lv/wp-admin/profile.php')}
                className="inline-flex items-center gap-2 bg-accent text-ink font-bold uppercase text-xs tracking-wide px-5 py-2.5 rounded-lg hover:bg-red-600 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Atvērt profila lapu tieši →
              </button>
            </div>
            <WpAdminGuide />
          </div>
        )}
      </div>
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
      {error && <p className="text-red-400 text-sm font-semibold">{error}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={!username || !appPassword || saving}
        className="bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
      >
        {saving ? 'Pārbauda...' : 'Pieslēgties'}
      </button>
    </div>
  )
}
