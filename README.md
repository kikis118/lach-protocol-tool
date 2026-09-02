# LACH Protokolu Rīks

Desktop app (Electron): upload a game protocol PDF, see it parsed and
matched against the live [lach.lv](https://lach.lv) game it belongs to,
review the computed box score/goals/penalties, then either save it
straight to WordPress or jump to that game's WP-Admin edit page to fix
it by hand.

Anyone can install and run this on their own computer - each person
enters their own WordPress Application Password on first run (stored in
a local `credentials.json` under Electron's own per-user app-data
folder, never bundled with the app, never shared between installs).

## Development

```bash
npm install
npm run dev:vite      # terminal 1 - Vite dev server on :5174
npm run dev:electron  # terminal 2 - Electron window loading that dev server
```

## Building the installer

```bash
npm run dist
```

Produces a Windows installer under `release/`.

## How matching works

The protocol itself has no game_id - the tool reads its printed date and
both team names, and matches those against the live site's own game list
(same team-name normalization rules as `lach-hockey-app`'s
`wp-autofill.mjs`). An exact single match proceeds straight to the
preview; anything else (0 or 2+ matches) shows a picker to confirm by
hand.

## Editing

No inline editing yet - if the parsed preview is wrong, "Rediģēt
WP-Admin" jumps straight to that game's real WP-Admin edit screen (opens
in the OS's default browser). The parser has been reliable in practice,
so this has been the right tradeoff so far: build for the common case
(parser gets it right, just confirm and save), keep the escape hatch for
the rare case rather than a full inline editor.

## Creating a new game (walk-in / subtournament game not in WP yet)

If a protocol doesn't match any existing game, the app offers "Izveidot
jaunu spēli" instead of a dead end. This is deliberately narrow: an
EXISTING season/tournament and EXISTING teams/venue must be picked from
dropdowns - brand-new teams, venues, seasons, or tournaments are always
a manual wp-admin step first (a direct link is shown for that). Once
mapped, it creates the game and writes all player stats in one request
via `wp-snippets/create-finished-game.php`.

## WordPress-side pieces (in the main lach-hockey-app repo's wp-snippets/)

- `game-autofill.php` - read/write an EXISTING game's stats (the normal flow)
- `create-finished-game.php` - create a BRAND NEW finished game + its stats (walk-in flow)
- `protocol-tool-link.php` - adds an "Ielādēt Protokolu" button to the wp-admin bar, using a `lachprotocol://` link this app registers itself as the handler for once installed (packaged builds only)

## Why this is a desktop app, not a hosted web tool

Originally built as a local Express server + browser tab. When asked to
make it reachable from anywhere with real WordPress-login gating, it
turned out the hosting plan behind lach.lv doesn't support Node.js apps,
and enabling that would mean removing WordPress from that domain
entirely - not acceptable. Rewriting the PDF parser in PHP (it depends
on per-character X/Y coordinates from `pdfjs-dist`, not just raw text)
was ruled out as a disproportionate rewrite for the benefit. Packaging
as a real installable app - each person supplies their own WordPress
Application Password - was the option with no new cost, no rewrite, and
it can be handed to more than one person, unlike the original
local-only version.
