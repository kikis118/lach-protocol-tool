# LACH Protokolu Rīks

Desktop app for uploading LHL game protocol PDFs straight into
[lach.lv](https://lach.lv) WordPress: pick a PDF, it's matched to the
right game automatically, you review a full preview (score, box score,
goals, penalties), then either save it or jump to WP-Admin to fix
anything by hand. Also handles walk-in games that don't exist in
WordPress yet.

## Installing (for league admins)

1. Get the latest installer (`LACH Protokolu Rīks Setup X.X.X.exe`) — either from this repo's [Releases page](https://github.com/kikis118/lach-protocol-tool/releases) if one has been published there, or however it was sent to you directly.
2. Run it. It's a normal one-click installer (no admin rights needed) — it installs for your Windows user only and adds a Start Menu shortcut.
3. Open "LACH Protokolu Rīks" from the Start Menu.
4. **First run only**: it'll ask for a WordPress username and an *Application Password* (not your normal login password — these are separate, and each person needs their own):
   - Log into [lach.lv/wp-admin](https://lach.lv/wp-admin)
   - Go to **Users → Profile** (your own profile, near the bottom)
   - Under **Application Passwords**, type a name for it (e.g. "Protokolu rīks") and click **Add New Application Password**
   - Copy the generated password (looks like `xxxx xxxx xxxx xxxx xxxx xxxx`) into the app, along with your WordPress username
   - Click **Saglabāt** — that's it, this only needs to happen once per computer
5. From then on: **Izvēlēties failu** → pick the protocol PDF → review the preview → **Saglabāt spēli**.

Nothing about this needs the internet on your end beyond a normal connection to lach.lv — the app itself doesn't run any server or need any port opened. As long as your computer can reach lach.lv normally (the same as browsing to it) and your Application Password is valid, saving writes live, immediately, to the real site — there's no delay, queue, or separate publish step.

### Updating

There's no auto-update yet — download and run a newer installer the same way; it replaces the old version in place. Your saved credentials aren't affected by an update.

### Uninstalling

Use Windows' normal **Settings → Apps** (or the uninstaller in the Start Menu folder) like any other app.

## How matching works

The protocol itself has no game ID — the tool reads its printed date and
both team names, and matches those against lach.lv's own game list (same
team-name normalization rules as `lach-hockey-app`'s `wp-autofill.mjs`).
An exact single match proceeds straight to the preview; anything else (0
or 2+ matches) shows a picker to confirm by hand.

## Editing

No inline editing yet — if the parsed preview is wrong, "Rediģēt
WP-Admin" jumps straight to that game's real WP-Admin edit screen (opens
in your default browser). The parser has been reliable in practice, so
this has been the right tradeoff so far: build for the common case
(parser gets it right, just confirm and save), keep the escape hatch for
the rare case rather than a full inline editor.

## Creating a new game (walk-in / subtournament game not in WP yet)

If a protocol doesn't match any existing game, the app offers "Izveidot
jaunu spēli" instead of a dead end. This is deliberately narrow: an
EXISTING season/tournament and EXISTING teams/venue must be picked from
dropdowns — brand-new teams, venues, seasons, or tournaments are always
a manual wp-admin step first (a direct link is shown for that). Once
mapped, it creates the game and writes all player stats in one request.

---

## For developers

### Running from source

```bash
npm install
npm run dev:vite      # terminal 1 - Vite dev server on :5174
npm run dev:electron  # terminal 2 - Electron window loading that dev server
```

### Building the installer

```bash
npm run dist
```

Produces a Windows installer under `release/`. Icon source lives in
`build/icon.ico` (Windows exe/installer icon) and `build/icon.png` (used
for the app window icon in dev mode and copied to `public/favicon.png`
for the browser-tab favicon) — both generated from
`lach-hockey-app/src/assets/lhl-logo-transparent.png`.

### WordPress-side pieces (in the main `lach-hockey-app` repo's `wp-snippets/`)

- `game-autofill.php` — read/write an EXISTING game's stats (the normal flow)
- `create-finished-game.php` — create a BRAND NEW finished game + its stats (walk-in flow)
- `protocol-tool-link.php` — adds an "Ielādēt Protokolu" button to the wp-admin bar, using a `lachprotocol://` link this app registers itself as the handler for once installed (packaged builds only)

### Why this is a desktop app, not a hosted web tool

Originally built as a local Express server + browser tab. When asked to
make it reachable from anywhere with real WordPress-login gating, it
turned out the hosting plan behind lach.lv doesn't support Node.js apps,
and enabling that would mean removing WordPress from that domain
entirely — not acceptable. Rewriting the PDF parser in PHP (it depends
on per-character X/Y coordinates from `pdfjs-dist`, not just raw text)
was ruled out as a disproportionate rewrite for the benefit. Packaging
as a real installable app — each person supplies their own WordPress
Application Password — was the option with no new cost, no rewrite, and
it can be handed to more than one person, unlike the original
local-only version.
