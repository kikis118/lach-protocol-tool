// Small shared building blocks for the admin screens (src/components/admin/*)
// - same visual language as CreateNewGame.jsx/PreviewGame.jsx, factored out
// here because seven admin screens would otherwise each redefine the exact
// same panel/field/button markup.

export function Panel({ children, className = '' }) {
  return <div className={`bg-card border border-line rounded-lg p-6 space-y-4 ${className}`}>{children}</div>
}

export function ScreenHeader({ title, subtitle, onCancel }) {
  return (
    <div className="bg-card border border-line rounded-lg p-4 flex items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-black uppercase text-ink tracking-wide">{title}</h2>
        {subtitle && <p className="text-ink-faint text-sm mt-1">{subtitle}</p>}
      </div>
      {onCancel && (
        <SecondaryButton onClick={onCancel} className="shrink-0">
          Aizvērt
        </SecondaryButton>
      )}
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputClass =
  'w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent'

export function SelectInput({ value, onChange, children }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      {children}
    </select>
  )
}

export function TextInput({ value, onChange, ...props }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} {...props} />
}

export function TeamSelect({ teams, value, onChange, includeTbd = false }) {
  return (
    <SelectInput value={value} onChange={onChange}>
      <option value="">Izvēlies...</option>
      {includeTbd && <option value="0">Vēl nav zināms (TBD)</option>}
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </SelectInput>
  )
}

export function VenueSelect({ venues, value, onChange }) {
  return (
    <SelectInput value={value} onChange={onChange}>
      <option value="">Izvēlies...</option>
      {venues.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </SelectInput>
  )
}

export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`bg-accent text-ink font-bold uppercase text-sm tracking-wide px-6 py-3 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`bg-card border border-line-strong text-ink-secondary hover:border-accent hover:text-ink font-bold uppercase text-xs tracking-wide px-6 py-3 rounded-lg transition-colors disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function ErrorText({ children }) {
  if (!children) return null
  return <p className="text-red-400 text-sm">{children}</p>
}

export function SuccessText({ children }) {
  if (!children) return null
  return <p className="text-emerald-400 text-sm font-semibold">{children}</p>
}

// "YYYY-MM-DD HH:MM:SS" (WP shape) <-> "YYYY-MM-DDTHH:MM" (datetime-local)
export function kickoffToDatetimeLocal(kickoff) {
  if (!kickoff) return ''
  return kickoff.replace(' ', 'T').slice(0, 16)
}
export function fromDatetimeLocal(value) {
  if (!value) return ''
  return value.replace('T', ' ') + ':00'
}
