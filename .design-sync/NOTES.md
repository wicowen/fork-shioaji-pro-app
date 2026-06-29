# design-sync notes — shioaji-pro-app

Off-script **package** shape: this repo is a Tauri trading app, not a component
library, so the importable bundle is produced by a dedicated vite library build
(not the converter's synth-entry — vanilla-extract `.css.ts` needs the real VE
toolchain). 12 curated presentational panels are synced; their live data layer
is swapped for canned mocks at build time.

## Build pipeline (re-sync = run both, in order)

1. **Library build** (reuses the app's vite + vanilla-extract):
   `pnpm exec vite build --config .design-sync/build/vite.config.ts`
   → `ds-dist/entry.js` (ESM, react external) + `ds-dist/shioaji-pro-app.css`.
2. **Converter / driver**:
   `node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./ds-dist/entry.js --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json`
   (first sync omits `--remote`). Plain build:
   `node .ds-sync/package-build.mjs … --entry ./ds-dist/entry.js --out ./ds-bundle`.

`PKG_DIR` resolves to the repo root (entry walks up to the root package.json),
so `cssEntry`, `componentSrcMap`, `extraFonts` are all repo-root-relative.

## The data-layer mocks (`.design-sync/build/`)

`vite.config.ts` has a `resolveId` plugin that redirects, by path suffix (so it
catches both `../lib/x` and `@/lib/x`): `hooks/use-stream`, `lib/api`,
`lib/shioaji`, `lib/stream`, `lib/price-sync`, `lib/sector-sync`,
`lib/contracts-cache`, `lib/stock-index` → `mocks/*`. **Kept real**:
`theme-store`, `order-flow` (the engine), `runtime`, `utils/*`, `theme.css`.
Canned data lives in `mocks/_data.ts` (deterministic, no `Math.random`/`Date.now`
so renders+grades are stable). Standard codes: `TMFR1`/`TXFR1` up, `MXFR1` down,
`2330` stock; tick-stream panels (OrderFlow/TickTape/VolProfile) all use `TMFR1`
because `onAnyTick` replays that code.

## Fonts

`[FONT_MISSING]` (Inter, JetBrains Mono — the app loads them from Google at
runtime). Resolved by shipping woff2 via `cfg.extraFonts`:
`.design-sync/build/fonts/` + `fonts.css` were fetched from Google Fonts (latin
+ latin-ext) — re-fetch with the same UA trick if `fonts/` is ever missing.

## Tooling

- **Use pnpm, not npm**, even for the isolated `.ds-sync` staging install
  (user preference, overrides the skill's `npm i` default):
  `cd .ds-sync && pnpm add esbuild ts-morph @types/react playwright`.
- pnpm **skips build scripts** by default → run `pnpm exec playwright install
  chromium` explicitly; esbuild's binary still works (ships as an optional dep).

## Known render warns

None — render check is fully clean (12/12), no triaged warns to record.

## Re-sync risks (watch-list)

- `ds-dist/` and `ds-bundle/` are gitignored — a fresh clone must rebuild
  (library build → converter) before uploading; nothing ships pre-built.
- Mock data is **canned and hand-written**. If an upstream component changes the
  shape it reads (e.g. a new `useQuote` field, a renamed API path), its mock in
  `mocks/_data.ts` / `mocks/*.ts` may need updating or the panel renders empty.
- `cssEntry` is `ds-dist/shioaji-pro-app.css` — vite lib names the CSS after the
  package; if `package.json` `name` changes, update `cfg.cssEntry`.
- Fonts are network-fetched (Google). Committed under `.design-sync/build/fonts/`
  so a clone has them; only re-fetch if deleted.
- 3 components use `cardMode: column` (DepthLadder, PanelChrome, QuoteBoard) —
  their multi-cell previews overflow a grid cell otherwise.
- The pinned `projectId` can vanish (it did once — old `bdfee56a-…` 404'd after
  deletion). If `get_project`/`list_files` returns 404 (not 401), the OAuth token
  is fine — the *project* is gone: create a fresh one, re-pin `projectId`, re-run
  the driver, upload. Do NOT reuse the unrelated "lab.wico.dev Design System".

## Sync state (2026-06-29, completed)

**Upload COMPLETE.** 83 files / 12 components live in project **"Shioaji Pro
Design System"** (`70f5823e-f935-4fcc-8291-c081dce9a7cf`). Render check clean
(12/12 good), fonts shipped, conventions header in the README, `_ds_sync.json`
anchored on the project — the next sync is incremental (fetch its anchor to
`.design-sync/.cache/remote-sync.json`, run the driver with `--remote`).

The earlier OAuth-401 blocker cleared on restart, **but the previously-pinned
project (`bdfee56a-…`) had vanished** (`get_project` -> HTTP 404; deleted or
never persisted). Recovery: created a fresh project, re-pinned `projectId` in
config, re-ran the library build + driver for a clean receipt, uploaded all 83
files (atomic-style single push into the empty project).
