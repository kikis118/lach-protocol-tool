// Header control for the update check - a real, visible label (was
// icon-only before, which wasn't obvious what it did) plus the same
// icon and red-dot badge. The full-width banner in App.jsx is still the
// prominent "there's an update" notice; this is just the always-visible
// "check now" affordance, made unambiguous with its own text.
export default function UpdateBadge({ checking, info, error, onRecheck }) {
  const hasUpdate = info?.hasUpdate

  let statusText = null
  if (error) statusText = `Neizdevās pārbaudīt: ${error}`
  else if (info?.hasUpdate) statusText = `Pieejama versija ${info.latestVersion}`
  else if (info?.latestVersion) statusText = 'Jaunākā versija ✓'
  else if (info) statusText = 'Nav publicēta neviena versija'

  return (
    <button
      type="button"
      onClick={onRecheck}
      disabled={checking}
      title="Pārbaudīt, vai pieejama jauna Protokolu Rīka versija"
      className="relative flex items-center gap-2 rounded-full border border-line-strong text-ink-faint hover:border-accent hover:text-ink transition-colors px-3 py-1.5 disabled:opacity-50"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={`w-4 h-4 shrink-0 ${checking ? 'animate-spin' : ''}`}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 15a8 8 0 0 0 14.9 2.5M19.5 9a8 8 0 0 0-14.9-2.5"
        />
      </svg>
      <span className="text-xs font-semibold uppercase tracking-wide whitespace-nowrap">
        {checking ? 'Pārbauda atjauninājumus...' : 'Pārbaudīt atjauninājumus'}
      </span>
      {statusText && !checking && (
        <span className="text-[10px] text-ink-faintest normal-case font-normal whitespace-nowrap">({statusText})</span>
      )}
      {hasUpdate && (
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent border-2 border-surface" />
      )}
    </button>
  )
}
