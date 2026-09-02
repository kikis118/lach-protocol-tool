// Compact header control: a refresh-icon button with a red dot badge
// when an update is known to be available (the actual prominent
// notice is the full-width banner in App.jsx - this is just the
// always-visible "recheck" control, plus the same info as a tooltip).
export default function UpdateBadge({ checking, info, error, onRecheck }) {
  const hasUpdate = info?.hasUpdate

  let title = 'Pārbaudīt atjauninājumus'
  if (checking) title = 'Pārbauda...'
  else if (error) title = `Neizdevās pārbaudīt: ${error}`
  else if (info?.hasUpdate) title = `Pieejama jauna versija ${info.latestVersion}`
  else if (info?.latestVersion) title = `Jaunākā versija (${info.currentVersion})`
  else if (info) title = 'Nav publicēta neviena versija'

  return (
    <button
      type="button"
      onClick={onRecheck}
      disabled={checking}
      title={title}
      className="relative w-9 h-9 rounded-full border border-line-strong text-ink-faint hover:border-accent hover:text-ink transition-colors flex items-center justify-center disabled:opacity-50"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 15a8 8 0 0 0 14.9 2.5M19.5 9a8 8 0 0 0-14.9-2.5"
        />
      </svg>
      {hasUpdate && (
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent border-2 border-surface" />
      )}
    </button>
  )
}
