import { useState } from 'react'
import { setCredentials } from '../api'
import WpAdminGuide from './WpAdminGuide'

// Shown on first run (no credentials saved yet) and from "Iestatījumi"
// any time after - each person who installs this app enters their OWN
// WordPress Application Password here, stored in a local JSON file on
// their own machine only (see electron/main.mjs credentialsPath()),
// never bundled with the app and never sent anywhere but lach.lv itself.
export default function Setup({ initial, onSaved }) {
  const [username, setUsername] = useState(initial?.username || '')
  const [appPassword, setAppPassword] = useState(initial?.appPassword || '')
  const [saving, setSaving] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await setCredentials({ username, appPassword })
      onSaved({ username, appPassword })
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
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="text-accent text-sm font-semibold hover:underline mt-2"
        >
          {showGuide ? 'Paslēpt soli pa solim' : 'Kā to atrast? Rādīt soli pa solim →'}
        </button>
        {showGuide && (
          <div className="mt-3">
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
            className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">Application Password</label>
          <input
            type="password"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
            className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={!username || !appPassword || saving}
        className="bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saglabā...' : 'Saglabāt'}
      </button>
    </div>
  )
}
