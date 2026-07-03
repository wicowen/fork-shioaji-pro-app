# Group Strength Monitor & "Short the Weakest" Strategy — Implementation Brief

- Date: 2026-07-03
- Author model: claude-fable-5
- Status: discussion concluded; Phase 1 scoped, NOT yet implemented
- Audience: a blank LLM session implementing Phase 1 in this repo
- Companion (human, zh-TW): `_dev/2026-0703-0020-group-strength-strategy-claude-fable-5-zh-tw.md`

## 1. Objective

User strategy: rank Taiwan-market sector/concept groups by intraday strength; within a
highly-correlated group, when strength flips to weakness ("weak-turn"), short the weakest
member (stock day-trade short or single-stock futures).

Decision from discussion: validate the signal before automating. **Phase 1 = monitoring
panel + alerts only. No order placement.** Rationale: the strategy's edge depends on three
unmeasured quantities — lead-lag window length, weak-turn signal quality, and short-side
execution cost — and the app's automation engines are client-side only (stop when the app
closes).

Defaults chosen (user did not confirm; overridable):
- Signal source: group-aggregate strength (member breadth + order-flow aggregate), leader
  optionally weighted — not per-member triggers.
- Shorting instrument (later phase): single-stock futures (STF) first, stock day-trade
  short as fallback.
- Phase 1 scope: monitor + alert only.

## 2. Repo architecture essentials

- Stack: React 19 + TypeScript + Vite; vanilla-extract CSS; lightweight-charts;
  react-grid-layout panels; optional Tauri desktop shell. Package manager: `pnpm`.
- **No backend code in this repo.** The frontend talks to a separately running official
  `shioaji server` (Python HTTP daemon, default `http://127.0.0.1:8080`) via:
  - PULL: REST `/api/v1/...` wrapped by `src/lib/api.ts` (low-level) and
    `src/lib/shioaji.ts` (named endpoint functions).
  - PUSH: one SSE connection `GET /api/v1/stream/data` handled by `src/lib/stream.ts`
    (events: `tick_stk`, `tick_fop`, `bidask_stk`, `bidask_fop`, `order_event`, `heartbeat`).
- State pattern used everywhere (no Redux/Zustand): module-level singleton store +
  `useSyncExternalStore` hook export. Follow it for all new stores.
- Panels: `BlockType` union + `BLOCK_META` in `src/lib/workspace.ts` (union at ~line 5,
  meta record at ~line 47); rendered by the `BlockBody` switch in `src/App.tsx`. A panel
  with `pin: null` follows the globally selected symbol; `onPick(code)` propagates
  selection.
- No automated tests, no lint config, no ErrorBoundary. Verification is `tsc -b` /
  `pnpm build` + manual run.

## 3. Reusable assets (do not rebuild these)

| Path | Provides |
|------|----------|
| `src/lib/stream.ts` | SSE connection, `onAnyTick(listener)`, per-code quote store, subscription registry + replay-on-reconnect, `getSubscriptionCount()` (display-only) |
| `src/lib/order-flow.ts` | `OrderFlowEngine` class (framework-free): CVD, `getRolling(now, windowMs)` -> `{buyVol, sellVol, net, buyRatio, priceChange}`, big-lot burst events. API: `seed()` for history, `ingest()` live, `flush()` on timer. Aggressor side from tick `tick_type`: 1=buy(outer), 2=sell(inner), 0=unknown |
| `src/lib/stock-index.ts` | All STK contracts cached: `StockMeta {code, name, category, exchange, day_trade}`; `searchStocks()`, `categoriesOf()`, `SECTOR_LABELS`, `SECTOR_INDICES` (TWSE industry index -> category), `categoryOf()` |
| `src/components/sector-heatmap.tsx` | Existing sector-strength snapshot UI: 26 TWSE sector indices sorted by %change, drill-down to members (poll `fetchSnapshots` 20s). Reference for UI conventions, not for time series |
| `src/components/scanner-panel.tsx` | Market movers leaderboard incl. a short-screening mode (loss+volume+amount intersect) |
| `src/lib/rollover-engine.ts` | **Best template for the new engine**: second `onAnyTick` engine, alert-only, derived-condition computation, hysteresis re-arm (fires once, re-arms only after condition recedes) |
| `src/lib/trigger-engine.ts` | Price-cross trigger engine template (below/above -> market order, OCO groups, localStorage persistence) |
| `src/lib/bracket.ts` | Post-fill OCO stop/take registration (for later order phases) |
| `src/lib/trade.ts` | `notify()` -> toast + notice center (use for alerts); `placeQuickOrder()` (order path, Phase 3 only); `assertTradingLive()` |
| `src/lib/shioaji.ts` | `fetchKbars(contract, start, end)` (single query capped ~30 days), `fetchHistoryTicks`, `fetchLastTicks`, `fetchSnapshots`, `fetchScanner`, `subscribeQuote`/`unsubscribeQuote`, `placeStockOrder`, `placeFuturesOrder` |
| `src/lib/contracts-cache.ts` | `ensureContract(code)`: resolve STK->FUT->OPT->IND, dedupe subscriptions |
| `src/components/chips-card.tsx` | Short-feasibility data already wired: `POST /api/v1/data/credit_enquire`, `POST /api/v1/data/short_stock_sources`, `GET /api/v1/data/regulatory_punish` |
| `src/components/sparkline.tsx` | Small inline series rendering for rank history |
| `src/hooks/use-poll.ts`, `src/hooks/use-stream.ts` | Generic polling hook; `useQuote(code)` |
| `src/lib/utils/kbars.ts`, `src/lib/indicators.ts` | Bar aggregation; sma/ema/bollinger/vwap (NO correlation/zscore — build new) |

## 4. Hard constraints & known gaps (load-bearing)

1. **Automated stock shorting is impossible today.** `daytrade_short?: boolean` exists on
   `StockOrderReq` (`src/lib/types/order.ts`) but is only wired in the manual
   `order-ticket.tsx`. The shared automated path `trade.ts sendOrder()` builds stock
   orders WITHOUT `daytrade_short`; there is no margin/short `order_cond` field anywhere.
   Phase 3 must extend this path. STF via `placeFuturesOrder` does not have this problem.
2. **Subscription budget:** Shioaji caps concurrent quote subscriptions (~200, verify
   against current docs). This app subscribes Tick + BidAsk per symbol = 2 subs/symbol
   (~100-symbol effective ceiling). No guard exists — `getSubscriptionCount()` is
   display-only. New engine MUST enforce its own budget (default: <= 20 symbols/group,
   <= 60 monitored total) and surface a warning when refusing.
3. **Client-side only:** all engines run in the renderer and only while the app is open;
   persistence is localStorage. Do not promise always-on behavior.
4. **No statistical math exists** (grep-confirmed): no correlation, beta, z-score,
   regression, or cross-sectional ranking anywhere. Build from scratch in a pure,
   framework-free module.
5. SSE Decimal fields arrive as strings — coerce with `Number()`. Filter `simtrade`
   (pre-open matching) ticks as `stream.ts` does. kbars single query <= ~30 days; loop
   date ranges if more is needed.
6. Repo conventions: English code/comments; debug logs at key checkpoints formatted
   `[GroupStrength] action: details`; match the module-store pattern; vanilla-extract for
   styles (`*.css.ts`), no inline styles.

## 5. Phase 1 functional spec

### 5.1 Group model
- `StockGroup { id, name, codes: string[], leader?: string }`, user-defined
  (concept groups like AI-server/CoWoS/shipping are the primary use case; TWSE
  `category` is only a seeding convenience). CRUD + localStorage persistence in a new
  `src/lib/group-store.ts` following the module-store pattern.

### 5.2 Strength engine (new `src/lib/group-strength.ts`, framework-free)
- Subscribe members via `ensureContract`; one `OrderFlowEngine` per member fed from the
  single shared `onAnyTick` (filter by code).
- Per-member strength score (recomputed on a ~1s cadence, not per tick):
  `score = w1 * z(intraday %change) + w2 * z(rollingBuyRatio - 0.5)` with weights
  configurable, z-scores computed cross-sectionally within the group.
- Rank time series: snapshot member ranks every 10s into a bounded ring buffer
  (session-scoped, no persistence needed).
- Group aggregate: median member score + advancing breadth (share of members with
  score > 0). Optional leader weighting.
- Weak-turn rule (default, tunable): group aggregate was "strong" (e.g. median score in
  top tercile of its own session range, or breadth >= 60%) and within M minutes (default
  10) decays below neutral (breadth <= 40% or median below session median). Implement
  with hysteresis re-arm like `rollover-engine.ts` — one alert per episode.
- Alert action: identify current weakest member (lowest score); emit via `notify()`
  (title includes group, weakest code, rank move) and log to a panel-visible event list.
  **No orders.**

### 5.3 Correlation validation (new `src/lib/correlation.ts`)
- Purpose: validate that a user-built group is actually co-moving; NOT auto-clustering.
- Method: `fetchKbars` 1-min bars for ~20 trading sessions (respect 30-day cap), resample
  to 5-min log returns, pairwise Pearson matrix. Handle missing/misaligned bars by inner
  join on timestamps; NaN-guard.
- Surface in the group editor as a member-pair matrix or min/median pairwise value.

### 5.4 Panel (new `src/components/group-strength-panel.tsx`)
- Group selector + editor (member search via `searchStocks`); member table sorted by
  score; per-member rank sparkline; weakest highlighted; alert log; click ->
  `onPick(code)`.
- Register `'groupstrength'` in `workspace.ts` (`BlockType` + `BLOCK_META`, suggest
  pinnable: false, singleton: false) and add the `BlockBody` case in `App.tsx`.

## 6. Roadmap context (do not build now)

- Phase 2 — offline event study (script, likely Python or a repl page): measure (a)
  lead-lag: cross-correlation of leader/aggregate returns vs weakest-member returns at
  1-min resolution — the tradable window; (b) post-signal return distribution of the
  weakest member at +5/+15/+30 min; (c) whipsaw rate of the weak-turn rule. Strategy is
  GO only if median post-signal return < 0 beyond costs and lag >= ~2 bars.
- Phase 3 — semi-auto orders: extend `trade.ts sendOrder()` to pass `daytrade_short`
  (and/or route to STF via `placeFuturesOrder`), gate on `StockMeta.day_trade`
  eligibility + chips-card feasibility endpoints (short sources, punished list), reuse
  `bracket.ts` for protective exit and `risk.ts` gates. One-click confirm before full
  auto.

## 7. Acceptance criteria — Phase 1 (verifiable)

Engineering:
1. `pnpm build` (tsc -b + vite) passes; app boots with panel available in the add-panel
   menu and in `BlockBody`.
2. Group CRUD persists across reload (localStorage inspectable).
3. Subscribing a group of N members raises subscription count by exactly 2N (visible in
   debug-panel); attempting to exceed the budget (20/group, 60 total) is refused with a
   visible warning, not a silent drop.
4. Member scores update while SSE is live; rank snapshots appear every 10s (+/- timer
   jitter); ring buffer stays bounded for a full session.
5. Weak-turn alert: with thresholds lowered for testing, alert fires once per episode
   (hysteresis verified: no repeat alert until re-arm condition), appears in notice
   center, and is logged in the panel with `[GroupStrength] weak-turn signal: ...` on
   console.
6. Correlation matrix: symmetric, diagonal = 1, values within [-1, 1], NaN-guarded when
   a member lacks bars; visible in group editor.
7. Grep-verifiable: no call into `placeQuickOrder` / `placeStockOrder` /
   `placeFuturesOrder` from any Phase 1 file.
8. Per-tick work is O(group members) with no React re-render outside subscribed
   components (module-store pattern, no new global state libs).

Strategy-level (Phase 2, spec only): lead-lag >= 2 one-minute bars; median post-signal
15-min return of weakest < -(fees + expected slippage); whipsaw (signal reversed within
5 min) < 40%. These numbers gate any order-placing phase.

## 8. Runbook

- Dev: `pnpm dev` with a locally running `shioaji server start` (official CLI; simulation
  mode works for data). App polls `/api/v1/health` until the server is up.
- Manual test group example (shipping): 2603, 2609, 2615, 2606, 2637.
- Off-hours: use `fetchLastTicks`/`fetchHistoryTicks` seeding (as `order-flow.tsx` does)
  so the panel is inspectable without live ticks; the replay panel can also feed ticks.
