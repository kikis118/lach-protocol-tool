import { forwardRef, useImperativeHandle, useState } from 'react'
import { diagPost, diagSearchMeta, diagTableRow } from '../../api'
import { Panel, ScreenHeader, TextInput, PrimaryButton, ErrorText } from './AdminUI'

// Purely read-only - lach-diagnostics.php never writes anything, scoped
// server-side to sl_* post types only. Never dirty - there's nothing here
// that leaving could ever lose.

const TABLE_OPTIONS = [
  { value: 'games', label: 'games (wp_sl_games, pēc game_id)' },
  { value: 'player_statistics', label: 'player_statistics (wp_sl_player_statistics, pēc id)' },
]

const Diagnostics = forwardRef(function Diagnostics({ onCancel }, ref) {
  useImperativeHandle(ref, () => ({ isDirty: () => false }))
  return (
    <div className="space-y-4">
      <ScreenHeader title="Diagnostika" subtitle="Tikai lasīšanai - neko nemaina WordPress pusē." onCancel={onCancel} />
      <PostLookup />
      <MetaSearch />
      <TableRowLookup />
    </div>
  )
})

export default Diagnostics

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
