// A generic mockup of the WP-Admin "Users -> Profile -> Application
// Passwords" screen, NOT a real screenshot - the real one would carry
// Kristians's actual account data (existing password names, IP
// fragments, etc.), not something to ship inside the app. Mimics the
// same 4 numbered callouts he drew on his own screenshot.
export default function WpAdminGuide() {
  return (
    <div className="bg-surface border border-line-strong rounded-lg overflow-hidden text-xs">
      <div className="flex">
        <div className="w-28 bg-[#1d2327] text-gray-300 shrink-0 py-2">
          <NavItem label="Media" />
          <NavItem label="Pages" />
          <NavItem label="Sports Leagues" />
          <NavItem label="Snippets" />
          <NavItem label="Users" active step={1} />
          <div className="pl-4">
            <SubNavItem label="All Users" />
            <SubNavItem label="Add User" />
            <SubNavItem label="Profile" active step={2} />
          </div>
        </div>

        <div className="flex-1 bg-[#f0f0f1] text-[#1d2327] p-3 space-y-3">
          <p className="font-bold">Application Passwords</p>
          <p className="text-[10px] text-gray-600">
            Application passwords allow authentication via non-interactive systems, such as the REST API, without
            providing your actual password.
          </p>

          <div className="relative">
            <p className="font-semibold mb-1">New Application Password Name</p>
            <div className="bg-white border border-gray-400 rounded px-2 py-1 relative">
              protokoli
              <Callout step={3} className="-right-2 -top-8" text="var ierakstīt jebko" />
            </div>
          </div>

          <div className="relative inline-block">
            <button type="button" className="bg-[#2271b1] text-white rounded px-3 py-1.5 font-semibold" disabled>
              Add Application Password
            </button>
            <Callout step={4} className="-right-6 top-full mt-1" text="" />
          </div>
        </div>
      </div>
    </div>
  )
}

function NavItem({ label, active, step }) {
  return (
    <div className={`relative px-3 py-1.5 ${active ? 'bg-[#2271b1] text-white font-semibold' : ''}`}>
      {label}
      {step && <StepBadge step={step} className="-right-2 top-1/2 -translate-y-1/2" />}
    </div>
  )
}

function SubNavItem({ label, active, step }) {
  return (
    <div className={`relative px-2 py-1 text-[11px] ${active ? 'text-white font-semibold' : 'text-gray-400'}`}>
      {label}
      {step && <StepBadge step={step} className="-right-2 top-1/2 -translate-y-1/2" />}
    </div>
  )
}

function StepBadge({ step, className }) {
  return (
    <span
      className={`absolute w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center ${className}`}
    >
      {step}
    </span>
  )
}

function Callout({ step, text, className }) {
  return (
    <span className={`absolute whitespace-nowrap flex items-center gap-1 text-red-600 font-bold ${className}`}>
      <StepBadge step={step} className="relative translate-y-0" />
      {text}
    </span>
  )
}
