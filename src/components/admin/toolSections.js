// Metadata for the admin tool cards shown directly on the home screen
// (App.jsx). FREQUENT_TOOLS render above RARE_TOOLS with a thin divider
// between them - order alone signals priority, per explicit ask to drop
// section headers like "Bieži lietots"/"Retāk lietots" (felt redundant -
// the ordering already says it).

export const FREQUENT_TOOLS = [
  {
    key: 'schedule',
    icon: '📅',
    title: 'Spēles laika/vietas labošana',
    desc: 'Izlabot jau ieplānotas, vēl nespēlētas spēles sākuma laiku vai vietu.',
  },
  {
    key: 'roster',
    icon: '👥',
    title: 'Komandas sastāvs',
    desc: 'Pievienot spēlētājus komandas sastāvam vai pilnībā aizstāt visu sastāvu.',
  },
]

export const RARE_TOOLS = [
  {
    key: 'bulkImport',
    icon: '🗓️',
    title: 'Sezonas grafiks',
    desc: 'Izveidot vairākas jau zināmu komandu spēles uzreiz (sezonas sākumā).',
  },
  {
    key: 'miniTournament',
    icon: '🏆',
    title: 'Izveidot playoff',
    desc: 'Izveidot spēles ar vēl nezināmu komandu ("A grupas uzvarētājs") un vēlāk to atrisināt.',
  },
  {
    key: 'teamEditor',
    icon: '✏️',
    title: 'Rediģēt komandas',
    desc: 'Mainīt esošas komandas nosaukumu vai logo.',
  },
]

// Kikis-only (see isDevUser in GameEditor.jsx for the same pattern/
// rationale) - Global Search covers the everyday "find and fix something"
// need now, so raw diagnostics stopped being useful for anyone else. Kept
// around as a dev tool rather than deleted outright.
export const DEV_TOOLS = [
  {
    key: 'diagnostics',
    icon: '🔍',
    title: 'Diagnostika (dev)',
    desc: 'Tikai lasīšanai - apskatīt WordPress ieraksta datus, meklēt pēc meta lauka.',
  },
]
