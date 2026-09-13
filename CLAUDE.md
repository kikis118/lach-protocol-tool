# LACH Administrēšana — notes for future Claude sessions

Renamed from "LACH Protokolu Rīks" (2026-09-13) — this is now a general WordPress admin
surface (schedule correction, roster management, bracket/season creation, team editing,
global search), not just a protocol-upload tool. See `README.md` (Latvian, written for
club admins) for what this does and how to install/run it. This file is operational
context that isn't obvious from reading the code cold — mostly hockey domain rules
encoded in the parsing/save logic, and repo-level constraints that are easy to
accidentally break.

## A second, mobile web version now exists in the sibling repo

`lach-hockey-app/admin-app/` (2026-09-13) is a separate, phone-usable web admin
app deployed to `lach.lv/admin/`, covering roster management and schedule
correction only (the two screens with no backend gap). It's a manual fork of
`RosterManagement.jsx`/`ScheduleCorrection.jsx`/`AdminUI.jsx`/`adminDrafts.js`
from this repo, plus a browser-`fetch` reimplementation of the relevant
`api.js`/`electron/main.mjs` calls (no IPC there - it's a plain SPA, not
Electron) - same "port by hand, keep in sync" discipline this file already
documents for the parsing libs shared with `lach-hockey-app`. A fix to either
of those two screens' logic here needs manual porting there too, and vice
versa. See that repo's own `CLAUDE.md` ("`admin-app/` — a second, separate
SPA...") for the full rationale (why same-origin avoids needing CORS, why no
`.htaccess` change was needed, why it lives in that repo instead of a new one).

## The admin screens (src/components/admin/) and the unified game editor

Everything reachable from the home screen's "Meklēt" search bar and the tool cards below
it (`src/components/admin/*`, wired up in `src/App.jsx` via `adminScreen` state) is a
2026-09-13 addition: `ScheduleCorrection`, `RosterManagement`, `TeamEditor` (name+logo,
merged from two separate screens), `BulkImportGames`, `MiniTournament` (playoff bracket
creation/resolve), `Diagnostics` (kikis-login-only now, see `isKikis` in App.jsx),
`GlobalSearch` (embedded widget on the home screen, not a navigable screen). Each admin
screen reports its own dirty state via `forwardRef`/`useImperativeHandle` (`{ isDirty(),
hasDraftSafety()? }`) so `App.jsx`'s `handleCancel` only warns when something would
genuinely be lost — don't add a new admin screen without wiring this up, or leaving it
will silently either nag for nothing or lose data with no warning. `RosterManagement`/
`BulkImportGames`/`MiniTournament` additionally autosave a draft via `src/adminDrafts.js`
(a lighter, single-slot version of `protocolHistory.js`'s list-based drafts below).

`src/components/GameEditor.jsx` (renamed from `ManualProtocol.jsx`) is now the ONE screen
for entering/editing a game, regardless of how it got there — blank manual entry, a PDF
that matched nothing (prompts for team mapping first, then prefills), or a PDF that
matched an existing game (prefills directly, mode `'matched'`, saves via `game:save`/
game-autofill). `rowsFromParsed()` in that file is the inverse of its own `buildParsed()`
— if you change one, check whether the other needs the same fix. `CreateNewGame.jsx` and
`PreviewGame.jsx` (previously separate screens for the unmatched/matched PDF cases) are
deleted — don't recreate them; extend GameEditor's `prefill` prop handling instead.

## "PS" is overloaded — shootout goal vs. in-game penalty-shot goal are NOT the same thing

This is the single most important domain gotcha in the codebase, and it caused a real
production bug (games 1228 and 1235 both wrongly recorded as `pen_win`/`pen_loss` —
`pen_loss` even awarded an undeserved league point — for what were actually clean
regulation wins). See commits `00303a2` and `a85e13c`.

- **Official LHL PDF exports** (`electron/lib/parseProtocol.mjs`) only ever use
  situation code `"PS"` for a genuine shootout-deciding goal, which by the format's own
  convention never has an in-game clock time (confirmed: game 1067, row
  `V=4, Laiks=blank, VG=10, S=PS`). So `parseProtocol.mjs` still uses the simple
  `isShootout: c.s === 'PS'` (line ~140) — **this is intentional, not an unfixed copy of
  the old bug**. Don't "fix" it to match `ManualProtocol.jsx` below without first
  confirming an official PDF export can actually produce a timed "PS" row; nothing found
  so far suggests it can.
- **Manual/handwritten-protocol entry** (`src/components/ManualProtocol.jsx`,
  `buildParsed()`) has no such guarantee — a handwritten protocol used `"PS"` for an
  ordinary in-game penalty shot (awarded for a foul, WITH a real clock time). The fix:
  `isShootout` is derived from whether a clock time was actually typed
  (`g.situation === 'PS' && !clock`), never from the situation code alone. The time
  input for a `"PS"` row is intentionally *not* disabled (it used to be, which is what
  caused the bug — disabling it forced every "PS" selection to null out the time and
  silently become a shootout).
- Either way, `situation: 'PS'` is kept on the goal record even when it's *not* a
  shootout (see `a85e13c`) — the site badges a non-shootout "PS" goal the same way it
  badges PP/SH, so the situation code must still reach WP. Only `isShootout` — not the
  presence of the `"PS"` code — decides shootout-only handling everywhere downstream
  (see next section).
- This tool's own in-app preview (`src/components/GameSummary.jsx`, `SITUATION_LABEL`)
  only maps `PP1/PP2/SH1/SH2` to badges — it does **not** badge a non-shootout `"PS"`
  goal, unlike the live site's `GameDetail.jsx` (sibling repo) which does. That's a real
  asymmetry, not necessarily a bug to fix reflexively — check with the user before
  changing it, since it may be deliberate scope (this tool's preview is a QA check, not
  a pixel-perfect mirror of the site).
- Downstream, `isShootout` (not the situation code) is what actually matters:
  `electron/lib/buildWpPayload.mjs`'s `buildPlayerStatsPayload()` excludes every
  `isShootout` goal from individual skater goals/assists and goalie GA — standard hockey
  convention counts a shootout winner toward the final score only, never into season
  stats. A regression that flips `isShootout` incorrectly (as the original bug did)
  doesn't just mislabel a badge, it silently corrupts season stats and game
  outcome/points.

## The protocol-parsing libs are a manual fork, not a shared package

`electron/lib/parseProtocol.mjs`, `buildWpPayload.mjs`, and `resolveRoster.mjs` are
byte-identical (as of `243caff`) manually-maintained copies of the same-named files in
the sibling repo `lach-hockey-app`'s `scripts/lib/`. There is no submodule, package, or
build step keeping them in sync — a fix to column detection, goal/penalty rules, header
labels, field-code mappings, or roster-matching rules in one repo has to be **manually
ported** to the other. Each file says so in its own header comment; don't remove those
comments, and when touching parsing/payload logic here, check whether the same fix is
needed in `lach-hockey-app` (and vice versa — check that repo's own `CLAUDE.md`/
`PROJECT-NOTES.md` when working there).

One deliberate divergence: only this repo's `parseProtocol.mjs` has `findBestPlayers()`
— a feature this app's UI needs (fuzzy-matching a scanned name to a WP roster) that
`lach-hockey-app`'s `game-events.json` pipeline has no use for. Don't try to force full
identity between the two files; just port everything *except* that function.

## PDF column layout is derived per-file, never hardcoded

`parseProtocol.mjs`'s `deriveColumns()` reads each PDF's own header row to get column
x-positions, because the table auto-sizes per file (confirmed: "Nr" column appears at
different x-coordinates in different files, apparently based on the longest player name
in that game's roster). If a future protocol has renamed/reordered header labels,
`deriveColumns()` throws loudly (`Unrecognized protocol header layout`) rather than
silently mis-mapping columns — don't relax that check to "best effort" matching; a
silent mis-map is worse than a hard failure here, since the output feeds directly into
season stats and league points.

Related: a goal row is considered real if it has a scorer jersey (`VG`) — a *missing*
`Laiks` (clock time) alone must NOT disqualify it, because a shootout-deciding goal
genuinely has no clock time by the format's own convention (this was the root cause of
several games' QA checks wrongly flagging "1 goal not itemized" when the goal actually
was itemized). What's still correctly excluded is a row with only `V`/`S` and no scorer
jersey at all — that's a genuine gap in the source protocol.

Penalty-row detection keys off a real alphabetic infraction code, not `Min`/`Nr` — a
stray `"0"` text fragment leaking in from a neighboring PDF cell is JS-truthy as a
string and was briefly a false-positive source.

Names from lhl.lv's own player database sometimes carry a hand-typed stale/duplicate
marker directly in the name field (`"(Arhīvs, nelietot)"`, `"!!!ARHIVS NELIETOT!!!"`,
etc., inconsistent formatting across at least three seasons) which leaks straight into
the printed PDF. `stripArchiveNote()` strips this at the single shared roster-name
extraction point — don't reimplement name-cleanup logic elsewhere; route any new
name-cleaning need through that function so it stays centralized.

## Two independent goal/penalty parsers, two independent bug histories

A game's data can still come from two genuinely different sources, even though they now
share one editor screen (GameEditor.jsx, see above):

1. **PDF upload** → `parseProtocol.mjs` parses the file → `matchGame.mjs` matches it to
   an existing WP game by date + team names → GameEditor prefilled via `rowsFromParsed()`.
2. **Manual/blank entry** — for handwritten/photographed protocols that can't be parsed,
   or a brand-new result typed from scratch — builds the same shape of parsed data by
   hand, in GameEditor's own `buildParsed()`, independent of `parseProtocol.mjs`.

Because manual entry re-derives goal/penalty/situation logic itself rather than
reusing `parseProtocol.mjs`, a bug fixed in one path (see the PS/shootout section above)
does not automatically apply to the other, and a future fix to one needs to be checked
against the other explicitly.

GameEditor additionally has multiple save modes, chosen via a picker for a blank/new
entry (added in `9c5df04` after a real duplicate-game incident), or set automatically
when prefilled from a parsed PDF: `'matched'` (`game:save`/game-autofill, a PDF already
resolved to an existing game), **attach to an already-scheduled WP game** (`'existing'`,
`finish-scheduled-game.php`, updates that game's row in place — score, outcome, stats)
vs. **create a brand-new game post** (`'new'`, `create-finished-game.php`). The "always
create new" behavior used to be the only option and silently duplicated EAHF's
pre-scheduled group-stage game 1216 as a new, wrongly-slotted post 1243. Default for an
*old* persisted draft (saved before the picker existed) is `'new'`, specifically so a
draft in flight from an older version resumes exactly where it left off rather than
being reinterpreted. Don't collapse these save paths into one "smart" auto-detect — the
explicit picker exists because silent auto-creation is what caused the incident.

## Large-roster auto-prefill asks first, on purpose

Picking a team in manual entry prefills that side's roster from WP. `LARGE_ROSTER_THRESHOLD = 20`
in `GameEditor.jsx` gates this: an EAHF-only/tournament team is small and safe to
autoload, but an established LHL club (e.g. HK Jenoti) accumulates a much bigger roster
across real seasons, most of whom are irrelevant to one specific game — autoloading all
of it meant deleting a dozen rows by hand before starting. Past the threshold, it asks
via the shared `askConfirm` modal, and "No" starts that side's roster empty (not "do
nothing" — the admin still needs *a* roster to build). The `20` cutoff is a heuristic
("a real EAHF-format roster tops out around 20 dressed players"), not a hard rule from
any spec — don't treat it as more precise than that if it needs tuning later.

## Autosave: first run after mount must never persist

`GameEditor.jsx`'s debounced autosave used to run once unconditionally on mount,
which for a *resumed, already-published* history entry silently flipped its status back
to draft (`saveState` starts fresh `'idle'` on every mount, so that first write always
wrote `status: 'draft'`) — just from opening and closing the entry, with zero real
edits. Fixed in `841967a`: the first autosave effect run after mount skips persisting
**entirely** (not just skipping the dirty-flag), and status only changes once a real
edit actually happens. If this effect is ever refactored, keep that "first run is a
no-op, not merely non-dirty" distinction — it's the whole fix.

## No API key, by design — and it depends on the repo staying public

Per the README: the in-app "Pārbaudīt atjauninājumus" (check for updates) feature and
the auto-updater both need to reach this repo's GitHub Releases without any embedded
token. Concretely:

- `package.json`'s `build.publish` block (`provider: "github"`, `owner: "kikis118"`,
  `repo: "lach-protocol-tool"`) is what `electron-updater` (`electron/main.mjs`) reads
  at runtime to check/download the latest release — this is GitHub's public,
  unauthenticated releases API path, which only works if the repo is public.
- **If this repo is ever made private, the update check silently breaks** (or needs a
  `GH_TOKEN` embedded into every installed client, which defeats the entire "no secrets
  to manage per install" design). There is no fallback path coded for a private repo.
- This is a deliberate tradeoff, not an oversight — don't "fix" it by adding a token env
  var or a build-time secret unless the user explicitly decides the repo needs to go
  private and accepts redesigning the update mechanism.

WordPress credentials are a separate, per-machine concern and are unrelated to the
above: each install's own `WP_USERNAME`/`WP_APP_PASSWORD` live in a plain JSON file
under Electron's per-user `userData` folder (`electron/main.mjs`'s `credentialsPath()`),
entered once per machine via `src/components/Setup.jsx`, never bundled into the app and
never committed.

## Cross-repo relationship with `lach-hockey-app`

This repo is a sibling to `lach-hockey-app` (the WordPress site's own repo, with
`wp-snippets/*.php` providing the REST endpoints this tool calls at `https://lach.lv/wp-json/lach/v1`).
Relevant endpoints referenced from `electron/main.mjs`: `create-finished-game.php` (new
game + stats), `finish-scheduled-game.php` (update an existing scheduled game in place),
`update-game-schedule.php` (schedule correction), `create-players.php` (roster add/
replace — note `_sl_position` is create-only, never overwritten for an existing player,
see `update-player-name.php` below for why), `team-logo.php`, `update-team-name.php`,
`update-player-name.php`, `mini-tournament-games.php` (+ its `/resolve` route),
`bulk-import-games.php`, `lach-diagnostics.php`, and `protocol-tool-link.php` (adds a
`lachprotocol://` deep link in wp-admin — not otherwise handled in this repo, check
`lach-hockey-app` for that protocol-handler registration if it needs changing). When a
change here touches field shapes sent to WP (`buildWpPayload.mjs`'s stat codes,
`_sl_players_home`/`_sl_players_away` format, etc.), verify against the matching PHP
endpoint in `lach-hockey-app`, not just against this repo's own code — the field shapes
were reverse-engineered from a real filled-in WP admin page's hidden inputs, not from
any documented WP schema, so there's no spec to fall back on if the two repos drift.

### Pending FTP deployment (as of 2026-09-13)

The following `lach-hockey-app/wp-snippets/*.php` files are written and committed to
git, but **not yet deployed** to the live server's `wp-content/mu-plugins/` (the actual
runtime location — see "How code actually gets deployed" in
`PROTOCOL-TOOL-EXPANSION-PLAN.md`). Calling them from this app will 404 until deployed:

- `update-team-name.php` — new endpoint (rename an `sl_team` post).
- `update-player-name.php` — new endpoint (rename an `sl_player` post in place, used by
  `RosterManagement.jsx`'s inline player-name edit).
- `finish-scheduled-game.php`, `create-finished-game.php` — extended to accept
  `_lach_baltichockey_url`, `_lach_best_players`, `_lach_youtube_url`,
  `_lach_protocol_scan_url` (previously only `game-autofill.php` accepted the first two).
- `game-autofill.php` — extended to also accept `_lach_youtube_url`,
  `_lach_protocol_scan_url`.
- `full-data-v2.php` — extended to read back `youtube_url`/`protocol_scan_url` per game.
- `lach-helper-pin-auth.php` — new file, the PIN-based helper auth mechanism
  (see `lach-hockey-app/CLAUDE.md`'s own `admin-app/` section). Without this
  deployed, BOTH apps' PIN login mode fails outright (the `/lach/v1/whoami`
  and `/lach/v1/helper-pin` routes don't exist yet), and every endpoint below
  still works in Application-Password mode only (their `lach_permission_pin_or()`
  wrapper falls through to the exact same real-auth check they had before -
  this file just hasn't landed yet to give that wrapper a definition).
- `update-team-name.php`, `update-player-name.php`, `update-game-schedule.php`,
  `team-logo.php`, `bulk-import-games.php`, `mini-tournament-games.php`,
  `finish-scheduled-game.php`, `create-finished-game.php`, `game-autofill.php`
  — each had its `permission_callback` wrapped with `lach_permission_pin_or()`
  to accept the PIN as an alternative credential. `lach-diagnostics.php` was
  deliberately left untouched - stays Application-Password-only, kikis-only
  tool, no PIN bypass.

Deploying means FTP-ing the changed files to the live server. **This requires exiting
Auto Mode first** — uploading/deleting a file on that host is hard-blocked by the Auto
Mode classifier regardless of `permissions.allow` rules (confirmed: adding
`Bash(curl *)` didn't help, a plain delete worked fine under the same rule, so it's a
different, stricter check specifically for writing new code to a flagged remote host).
FTP credentials: ask the user fresh each session rather than assuming a stored copy is
still current — never commit them to either repo, gitignored `.env` or otherwise.

## Building the Windows installer (`npm run dist`) — known gotcha

`electron-builder`'s Windows packaging step can fail with
`EPERM: operation not permitted, rename '...\release\win-unpacked.tmp' -> '...\win-unpacked'`
even though the `.tmp` extraction itself completes successfully (confirmed by manually
listing its contents — every file present). Root-caused 2026-09-13: **a running dev
process watching the project tree** (confirmed specifically: Vite's dev server /
chokidar, started via `npm run dev:vite`) holds a directory-watch handle on the newly
created `release/` folder, and Windows refuses to rename a directory with an open handle
on it — deleting/renaming individual *files* inside it still works fine, which is the
tell that it's a directory-handle lock, not antivirus or a permissions issue. A Windows
Defender folder exclusion did **not** fix it in the session that found this; stopping
the Vite dev server (and, to be safe, any running Electron dev instance) before running
`npm run dist` did. **Always stop `npm run dev:vite`/`npm run dev:electron` before
packaging a release build.**

## Local environment setup checklist (for a fresh machine/session)

- `npm install` (Node + npm already assumed present).
- `gh` CLI authenticated as a user with push/release rights on this repo, if creating
  GitHub Releases from here.
- Windows Defender exclusion for this project folder is a reasonable precaution before
  running `npm run dist` for the first time on a new machine, though the actual fix for
  the EPERM issue above was stopping the dev server, not the exclusion — see above.
- WordPress Application Password: entered once per machine via the app's own Setup
  screen on first launch (see README.md) — nothing to pre-configure in the repo for this.
- FTP access for deploying `lach-hockey-app` PHP changes: see "Pending FTP deployment"
  above — get fresh credentials from the user, don't assume a prior session's copy is
  still valid, and never write them into a committed file.
