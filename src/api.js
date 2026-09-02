export async function parseProtocol(file, gameId) {
  const form = new FormData()
  form.append('protocol', file)
  if (gameId) form.append('gameId', gameId)
  const res = await fetch('/api/parse', { method: 'POST', body: form })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

export async function saveGame(gameId, payload) {
  const res = await fetch(`/api/game/${gameId}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}
