function formatKickoff(kickoff) {
  const d = new Date((kickoff || '').replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return kickoff
  return d.toLocaleString('lv-LV', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Shown when the protocol couldn't be matched to exactly one WP game
// automatically (date+team-name matching found 0 or 2+ candidates) - the
// admin picks the right one by eye instead of the tool guessing wrong.
export default function GamePicker({ result, onPick, onCancel }) {
  const candidates = result.candidates?.length > 0 ? result.candidates : result.fallbackCandidates || []
  const isFallback = result.candidates?.length === 0

  return (
    <div className="bg-card border border-line rounded-lg p-6 space-y-4">
      <div>
        <h2 className="text-lg font-black uppercase text-ink tracking-wide">
          {result.status === 'none' ? 'Nav atrasta atbilstoša spēle' : 'Vairākas iespējamas spēles'}
        </h2>
        <p className="text-ink-muted text-sm mt-1">
          Protokolā: <span className="text-ink font-semibold">{result.parsedTeams?.a}</span> vs{' '}
          <span className="text-ink font-semibold">{result.parsedTeams?.b}</span>
          {result.parsedMeta?.date && <> &middot; {result.parsedMeta.date}</>}
        </p>
        {isFallback && (
          <p className="text-ink-faint text-xs mt-2">
            Komandu nosaukumi neatbilda nevienai spēlei - izvēlies pareizo no pēdējām spēlēm zemāk.
          </p>
        )}
      </div>

      <div className="divide-y divide-line border border-line rounded-md overflow-hidden">
        {candidates.map((g) => (
          <button
            key={g.game_id}
            type="button"
            onClick={() => onPick(g.game_id)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-hover/50 transition-colors"
          >
            <span className="text-ink font-medium text-sm">
              {g.homeTeam} <span className="text-ink-faint">vs</span> {g.awayTeam}
            </span>
            <span className="text-ink-faint text-xs shrink-0">{formatKickoff(g.kickoff)}</span>
          </button>
        ))}
        {candidates.length === 0 && (
          <p className="px-4 py-6 text-center text-ink-faint text-sm">Nekas nav atrasts.</p>
        )}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="bg-card border border-line-strong text-ink-secondary hover:border-accent hover:text-ink font-bold uppercase text-xs tracking-wide px-6 py-3 rounded-lg transition-colors"
      >
        Atcelt
      </button>
    </div>
  )
}
