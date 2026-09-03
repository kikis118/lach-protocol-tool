// Shared local history of manually-entered protocols - a real list (not
// the single hidden "melnraksts" slot ManualProtocol used to keep to
// itself), so the main screen can show every draft/published entry as
// its own card: resume a draft by clicking it, delete it if it's no
// longer wanted, or jump to a published one's WP-Admin edit page.
// Per-viewer localStorage only, same privacy/durability tradeoffs as the
// single-slot draft this replaces - not synced anywhere, not shared
// between installs.

const HISTORY_KEY = 'lachProtocolHistory'

export function listHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
}

// Replaces the entry if `entry.id` already exists, otherwise adds it at
// the front (most-recently-touched-first, matching how the list is
// rendered).
export function upsertHistoryEntry(entry) {
  const list = listHistory()
  const idx = list.findIndex((e) => e.id === entry.id)
  if (idx === -1) list.unshift(entry)
  else list[idx] = entry
  writeHistory(list)
}

export function removeHistoryEntry(id) {
  writeHistory(listHistory().filter((e) => e.id !== id))
}

export function newHistoryId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
