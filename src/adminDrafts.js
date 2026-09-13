// Lightweight single-slot draft persistence for admin tool screens with
// real multi-row typing investment (roster entry, bulk import, mini-
// tournament rows) - same "don't lose real work on an accidental close"
// motivation as protocolHistory.js's autosave, but simpler: one draft per
// tool, not a list of resumable entries, since these forms don't need a
// history/list UI of their own.

function draftKey(tool) {
  return `lach-admin-draft:${tool}`
}

export function loadDraft(tool) {
  try {
    const raw = localStorage.getItem(draftKey(tool))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveDraft(tool, data) {
  try {
    localStorage.setItem(draftKey(tool), JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function clearDraft(tool) {
  try {
    localStorage.removeItem(draftKey(tool))
  } catch {
    // Nothing sensible to do if localStorage is unavailable - the draft
    // just won't be there next time either, same as it never having saved.
  }
}
