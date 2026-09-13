# LACH Protokolu Rīks — notes for future Claude sessions

See `README.md` (Latvian, written for club admins) for what this does and how to
install/run it. This file is operational context that isn't obvious from reading the
code cold — mostly hockey domain rules encoded in the parsing/save logic, and repo-level
constraints that are easy to accidentally break.

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

## Two independent entry paths, two independent bug histories

There are two ways a game gets into this tool, and they do **not** share a code path
end to end:

1. **PDF upload** → `parseProtocol.mjs` parses the file → `matchGame.mjs` matches it to
   an existing WP game by date + team names → preview → save.
2. **Manual entry** (`ManualProtocol.jsx`) — for handwritten/photographed protocols that
   can't be parsed — builds the same shape of parsed data by hand, in its own
   `buildParsed()`, independent of `parseProtocol.mjs`.

Because manual entry re-derives goal/penalty/situation logic itself rather than
reusing `parseProtocol.mjs`, a bug fixed in one path (see the PS/shootout section above)
does not automatically apply to the other, and a future fix to one needs to be checked
against the other explicitly.

Manual entry additionally has two save modes, chosen up front via a picker (added in
`9c5df04` after a real duplicate-game incident): **attach to an already-scheduled WP
game** (`finish-scheduled-game.php`, updates that game's row in place — score, outcome,
stats) vs. **create a brand-new game post** (`create-finished-game.php`). The "always
create new" behavior used to be the only option and silently duplicated EAHF's
pre-scheduled group-stage game 1216 as a new, wrongly-slotted post 1243. Default for an
*old* persisted draft (saved before this picker existed) is `'new'`, specifically so a
draft in flight from an older version resumes exactly where it left off rather than
being reinterpreted. Don't collapse these two save paths into one "smart" auto-detect —
the explicit picker exists because silent auto-creation is what caused the incident.

## Large-roster auto-prefill asks first, on purpose

Picking a team in manual entry prefills that side's roster from WP. `LARGE_ROSTER_THRESHOLD = 20`
in `ManualProtocol.jsx` gates this: an EAHF-only/tournament team is small and safe to
autoload, but an established LHL club (e.g. HK Jenoti) accumulates a much bigger roster
across real seasons, most of whom are irrelevant to one specific game — autoloading all
of it meant deleting a dozen rows by hand before starting. Past the threshold, it asks
via the shared `askConfirm` modal, and "No" starts that side's roster empty (not "do
nothing" — the admin still needs *a* roster to build). The `20` cutoff is a heuristic
("a real EAHF-format roster tops out around 20 dressed players"), not a hard rule from
any spec — don't treat it as more precise than that if it needs tuning later.

## Autosave: first run after mount must never persist

`ManualProtocol.jsx`'s debounced autosave used to run once unconditionally on mount,
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
and `protocol-tool-link.php` (adds a `lachprotocol://` deep link in wp-admin — not
otherwise handled in this repo, check `lach-hockey-app` for that protocol-handler
registration if it needs changing). When a change here touches field shapes sent to WP
(`buildWpPayload.mjs`'s stat codes, `_sl_players_home`/`_sl_players_away` format, etc.),
verify against the matching PHP endpoint in `lach-hockey-app`, not just against this
repo's own code — the field shapes were reverse-engineered from a real filled-in WP
admin page's hidden inputs, not from any documented WP schema, so there's no spec to
fall back on if the two repos drift.
