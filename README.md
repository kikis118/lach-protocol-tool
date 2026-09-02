# LACH Protokolu Rīks

Local-only admin tool: upload a game protocol PDF, see it parsed and matched
against the live [lach.lv](https://lach.lv) game it belongs to, review the
computed box score/goals/penalties, then either save it straight to
WordPress or jump to that game's WP-Admin edit page to fix it by hand.

Deliberately a separate repo from `lach-hockey-app` - this never gets
deployed anywhere, it only ever runs on the admin's own machine, and it
holds a WordPress Application Password that must never end up in a
public bundle.

## Setup

```bash
npm install
cp server/.env.example server/.env   # fill in WP_USERNAME / WP_APP_PASSWORD
```

## Running

Two processes, both required:

```bash
npm run server   # Express API on :8787 (parsing, WP reads/writes)
npm run dev       # Vite dev server on :5173, proxies /api to :8787
```

Open the Vite URL, upload a protocol PDF, follow the flow.

## How matching works

The protocol itself has no game_id - the tool reads its printed date and
both team names, and matches those against the live site's own game list
(same team-name normalization rules as `lach-hockey-app`'s
`wp-autofill.mjs`). An exact single match proceeds straight to the
preview; anything else (0 or 2+ matches) shows a picker to confirm by
hand.

## Editing

No inline editing yet - if the parsed preview is wrong, "Rediģēt
WP-Admin" jumps straight to that game's real WP-Admin edit screen. The
parser has been reliable in practice (see `lach-hockey-app`'s own
protocol-autofill work), so this has been the right tradeoff so far:
build for the common case (parser gets it right, just confirm and save),
keep the escape hatch for the rare case rather than a full inline editor.
