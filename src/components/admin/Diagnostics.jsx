import { forwardRef, useImperativeHandle, useEffect, useState } from 'react'
import { diagPost, diagSearchMeta, diagTableRow, getHelperPins, setHelperPin, deleteHelperPin } from '../../api'
import { Panel, ScreenHeader, TextInput, PrimaryButton, SecondaryButton, ErrorText, SuccessText } from './AdminUI'

// Mostly read-only (lach-diagnostics.php itself never writes anything,
// scoped server-side to sl_* post types only) plus the helper-PIN manager
// below, which does write. isDirty stays false regardless - a typed-but-
// unsaved name/PIN is cheap to retype, not worth the same loss-prevention
// machinery as the heavier multi-field admin forms.

const TABLE_OPTIONS = [
  { value: 'games', label: 'games (wp_sl_games, pēc game_id)' },
  { value: 'player_statistics', label: 'player_statistics (wp_sl_player_statistics, pēc id)' },
]

const Diagnostics = forwardRef(function Diagnostics({ onCancel }, ref) {
  useImperativeHandle(ref, () => ({ isDirty: () => false }))
  return (
    <div className="space-y-4">
      <ScreenHeader title="Diagnostika" subtitle="Tikai lasīšanai - neko nemaina WordPress pusē." onCancel={onCancel} />
      <HelperPinManager />
      <PostLookup />
      <MetaSearch />
      <TableRowLookup />
    </div>
  )
})

export default Diagnostics

// Named PINs (not one shared secret) - see lach-hockey-app's
// lach-helper-pin-auth.php. Each is what gets shared with ONE helper
// (WhatsApp DM etc.) instead of the real Application Password, and each is
// independently revocable - dropping one person doesn't force reissuing
// everyone else's. Only this endpoint's own real-auth requirement (never a
// PIN itself) can add/rotate/remove an entry, so a leaked PIN alone can
// never be used to mint or delete one.
function HelperPinManager() {
  const [pins, setPins] = useState(null)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function load() {
    getHelperPins()
      .then((r) => setPins(r.pins || []))
      .catch((err) => setError(err.message))
  }

  useEffect(load, [])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const result = await setHelperPin(name.trim(), pin.trim())
      setPins(result.pins || [])
      setName('')
      setPin('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(entryName) {
    setError(null)
    try {
      const result = await deleteHelperPin(entryName)
      setPins(result.pins || [])
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Panel>
      <h3 className="text-sm font-black uppercase text-ink-faint tracking-wide">Palīgu PIN kodi</h3>
      <p className="text-ink-faint text-xs">
        Katram palīgam savs PIN kods - dalies ar to individuāli (piem. WhatsApp), nevis viens kods visiem. Dzēšot vienu, pārējie turpina darboties.
      </p>

      {pins === null ? (
        <p className="text-ink-faint text-sm">Ielādē...</p>
      ) : pins.length === 0 ? (
        <p className="text-ink-faint text-sm">Vēl neviens PIN nav iestatīts.</p>
      ) : (
        <div className="space-y-1.5">
          {pins.map((p) => (
            <div key={p.name} className="flex items-center gap-2 bg-surface border border-line-strong rounded-md px-3 py-2">
              <span className="flex-1 text-ink text-sm font-semibold">{p.name}</span>
              <span className="text-ink-faint text-xs font-mono">{p.pin}</span>
              <button
                type="button"
                onClick={() => remove(p.name)}
                aria-label="Dzēst"
                className="w-7 h-7 shrink-0 rounded-md text-ink-faint hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-center"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <TextInput value={name} onChange={setName} placeholder="Vārds (piem. Andris)" />
        <TextInput value={pin} onChange={setPin} placeholder="PIN kods (vismaz 8 simboli)" />
        <SecondaryButton onClick={save} disabled={!name.trim() || pin.trim().length < 8 || saving} className="shrink-0">
          {saving ? 'Saglabā...' : 'Pievienot'}
        </SecondaryButton>
      </div>
      <ErrorText>{error}</ErrorText>
    </Panel>
  )
}

function ResultBlock({ result }) {
  if (!result) return null
  return (
    <pre className="bg-surface border border-line-strong rounded-md p-3 text-xs text-ink-secondary overflow-auto max-h-80">
      {JSON.stringify(result, null, 2)}
    </pre>
  )
}

function PostLookup() {
  const [id, setId] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await diagPost(id))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Panel>
      <h3 className="text-sm font-black uppercase text-ink-faint tracking-wide">Ieraksts pēc ID</h3>
      <div className="flex gap-2">
        <TextInput value={id} onChange={setId} placeholder="post ID, piem. 1235" />
        <PrimaryButton onClick={run} disabled={!id || loading}>
          {loading ? '...' : 'Meklēt'}
        </PrimaryButton>
      </div>
      <ErrorText>{error}</ErrorText>
      <ResultBlock result={result} />
    </Panel>
  )
}

function MetaSearch() {
  const [q, setQ] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await diagSearchMeta(q))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Panel>
      <h3 className="text-sm font-black uppercase text-ink-faint tracking-wide">Meklēt meta laukos</h3>
      <div className="flex gap-2">
        <TextInput value={q} onChange={setQ} placeholder="vismaz 3 simboli" />
        <PrimaryButton onClick={run} disabled={q.trim().length < 3 || loading}>
          {loading ? '...' : 'Meklēt'}
        </PrimaryButton>
      </div>
      <ErrorText>{error}</ErrorText>
      {result && (
        <div className="space-y-1 max-h-80 overflow-auto">
          {(result.matches || []).map((m, i) => (
            <p key={i} className="text-xs text-ink-secondary">
              #{m.post_id} ({m.post_type}) "{m.post_title}" &middot; {m.meta_key} = {m.meta_value}
            </p>
          ))}
          {(result.matches || []).length === 0 && <p className="text-ink-faint text-sm">Nav rezultātu.</p>}
        </div>
      )}
    </Panel>
  )
}

function TableRowLookup() {
  const [table, setTable] = useState('games')
  const [id, setId] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await diagTableRow(table, id))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Panel>
      <h3 className="text-sm font-black uppercase text-ink-faint tracking-wide">Neapstrādāta tabulas rinda</h3>
      <div className="flex gap-2">
        <select
          value={table}
          onChange={(e) => setTable(e.target.value)}
          className="bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
        >
          {TABLE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <TextInput value={id} onChange={setId} placeholder="ID" />
        <PrimaryButton onClick={run} disabled={!id || loading}>
          {loading ? '...' : 'Meklēt'}
        </PrimaryButton>
      </div>
      <ErrorText>{error}</ErrorText>
      <ResultBlock result={result} />
    </Panel>
  )
}
