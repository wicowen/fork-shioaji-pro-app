# TW Index Futures Strategy Development — Implementation Context

> Audience: LLM implementation session (blank context).
> Scope: research conclusions + system facts sufficient to implement Phase 0–1
> without re-deriving. No detailed code — abstract specs with verifiable
> acceptance criteria. Human-readable companion:
> `2026-0702-2353-futures-strategy-research-claude-fable-5-zh-tw.md`.

## 1. Goal & Constraints

- User: retail scalper trading TAIFEX micro TAIEX futures (TMF), currently
  manual, order-flow-driven (aggressor volume vs resting book). Wants a
  systematic strategy with positive net expectancy.
- Capital quota: **3 lots of TMF** (NT$10/point, contract value ~NT$280k at
  index ~28,000; initial margin ~NT$12–14k/lot). Total notional ~NT$840k,
  margin ~NT$40k. Suggested account NT$60–80k (margin + >=15 stop-unit buffer).
- Decision already made: strategy engine = **standalone Python daemon**
  (uv-managed), NOT in the React frontend. The app's trigger/bracket/risk
  modules are client-side only (die when tab closes) — unacceptable for live
  strategy. App becomes monitoring/manual-override cockpit.
- Status: **research phase concluded; no implementation yet.** Phase 0
  (data recorder) is the agreed first build.

## 2. Cost Model (hard numbers — use as backtest parameters)

| Item | Value |
|---|---|
| TMF multiplier | NT$10 / index point |
| Futures transaction tax | 2/100,000 of contract value per side ≈ NT$5.6 |
| Commission (retail range) | NT$15–25 per side (negotiable to ~NT$12) |
| Spread cost, market order | 1 pt per side typical; night session sometimes 2 |
| **Round-trip total** | **5–8 points** (NT$50–80 per lot) |

Consequences (structural, non-negotiable):
- Targets of 3–5 pts (classic scalp) are negative-expectancy on TMF.
- Viable shapes: target >= 15 pts (cost share < 35%), or passive limit entry.
- Backtests MUST charge >= 7 pts round-trip baseline AND produce a cost
  sensitivity curve 5→9 pts. A strategy that flips negative at +2 pts is
  rejected as too fragile.

## 3. Existing System Map (this repo)

Frontend-only React 19 + TS + Vite cockpit for the official `shioaji server`
(SinoPac's local Python HTTP/SSE daemon, default `127.0.0.1:8080`). No Rust
backend, no Python sidecar in-repo. Verified accurate doc:
`_dev/architecture-overview-zh-tw.md`.

Transport:
- **SSE push**: `GET /api/v1/stream/data` — events `tick_stk`, `tick_fop`,
  `bidask_stk`, `bidask_fop`, `order_event`, `heartbeat`.
- **REST pull**: `POST /api/v1/stream/subscribe` (`quote_type:
  'Tick'|'BidAsk'|'Quote'`), `POST /api/v1/data/ticks`, `/data/kbars`
  (~30-day cap per query), `/data/snapshots`, `/data/scanner`,
  `POST /api/v1/order/*` (place/cancel/update, futures+stock+combo).
- Server silently drops subscriptions at daily ~08:22 maintenance; app
  pattern: poll `/health` `last_maintenance` + resubscribe (see
  `src/lib/stream.ts` `watchMaintenance`).

Reusable logic (reference for Python port, do not import):
- `src/lib/order-flow.ts` — **OrderFlowEngine**: CVD from `tick_type`,
  rolling aggressive pressure window (buy/sell vol + realized move over
  5/10/30s), big-lot burst detection (same-side prints within gap => burst;
  logs points moved and points-per-100-lots). Port this to Python for both
  backtest and live signal.
- `src/lib/trigger-engine.ts` (client stop/TP), `src/lib/bracket.ts` (OCO
  after fill via order_event + poll fallback), `src/lib/risk.ts`
  (kill-switch: per-order cap, daily-loss limit, manual lock). Logic
  reference only — daemon must own these server-side.
- `scripts/` contains dev Python already (e.g. `build-kbar-archive.py`) —
  follow its uv/style conventions.

## 4. Shioaji Data Capability Matrix

Available (docs: `_dev/shioaji-llms-full.txt`):
- **Live Tick (FOP v1)**: `code, datetime, close, volume, tick_type
  (1=buy-aggressor/outer, 2=sell-aggressor/inner, 0=unknown),
  bid_side_total_vol, ask_side_total_vol, avg_price, total_volume,
  underlying_price (spot index — free basis feed), simtrade`.
- **Live BidAsk (5-level)**: `bid_price[5], bid_volume[5], ask_price[5],
  ask_volume[5], diff_bid_vol[5], diff_ask_vol[5] (per-level deltas — wall
  add/pull detection), bid_total_vol, ask_total_vol, first_derived_*`.
- **Live Quote (v2, futures)**: merged tick+book, adds `bid_side_total_cnt /
  ask_side_total_cnt` (trade counts => average aggressor trade size).
- **Historical ticks**: `api.ticks(contract, date, ...)` from 2020-03-22
  (futures), fields `ts, close, volume, bid_price, bid_volume, ask_price,
  ask_volume (level-1 at trade time), tick_type`. Continuous contracts
  `TXFR1/R2`, `TMFR1` for expired months. Includes night session.
- **Historical kbars**: 1-min bars, ~30-day window per query.
- Flow limit: 500MB/day (no traded volume tier); tick+book recording for 2
  symbols fits, but recorder must track bytes.

NOT available (drives Phase 0 urgency):
- **No historical 5-level book.** Any book-based signal (walls, pulls,
  imbalance) is untestable until we record our own. Not recorded today =
  gone forever.
- No US market data (matters for night-session strategies — signals must
  come from TAIFEX's own prints or an external delayed source).
- Stop orders are client-side emulation only (official sample confirms);
  exchange has no native stop for this flow. Daemon must own stops.

Session facts: day 08:45–13:45, night 15:00–05:00. Pre-open auction
(simtrade) windows: 08:30–08:45, 13:40–13:45 — `simtrade` flag marks these
in live stream; **verify whether historical `api.ticks` includes simtrade
rows before trusting any open-range logic** (unconfirmed).

## 5. Strategy Candidates (ranked)

Edge-source taxonomy used: (1) behavioral herding, (2) structural/mechanism,
(3) time-horizon arbitrage (too small for institutions), (4) execution
discipline. Any strategy that can't name its source is curve-fitting.

| # | Strategy | Hold | Freq | Risk | Net-expectancy prior | Backtestable now |
|---|---|---|---|---|---|---|
| 1 | Trend-day capture | hours | 3–5/mo | med-low | positive, healthiest structure | yes (ticks) |
| 2 | Order-flow confirmed breakout | 30m–2h | 2–5/day | med | moderately positive if filters hold | partial (tick part yes, book part needs recording) |
| 3 | Opening range breakout (ORB) | 1–3h | 0–2/day | med | ~zero, decaying; use as pipeline validator | yes, easiest |
| 4 | Night-session event momentum (20:30 US data / 21:30 US open) | 30–90m | 0–2/day | med-high | plausible, needs test; no US feed caveat | yes |
| 5 | Settlement-day effects (weekly Wed) | 30m–half day | 1/wk | med | unknown, tiny sample (~52/yr) | yes |
| 6 | Pure book-scalp automation (user's manual style) | sec–min | 10+/day | HIGH | **likely negative** (cost math + latency: maker-quoters re-quote TMF off TXF faster than our SSE→HTTP loop) | no (no book history) |
| 7 | Basis extreme reversion | min–h | var | med-high | low (arb desks own it); use basis as a filter feature only | yes |

Recommended portfolio: **#1 + #2 dual-track as core, #3 first as backtest
pipeline validator, recorder started immediately.** #6 explicitly NOT
automated; instead run as shadow-signal journal to mine the user's manual
edge.

### 5.1 Strategy #1 — Trend-day capture (rule draft)

Prior: ~15–20% of sessions are one-way trend days (Market Profile «trend
day»). All four conditions are priors to validate, not settled rules:
- Day-open gap vs prior close exceeding a fraction of prior-day range, AND
  gap NOT refilled within first 30 min.
- First-60-min close located in the extreme 20% of the first-hour range.
- CVD slope same direction as price, no divergence (OrderFlowEngine port).
- First-hour range > 1.5x its 20-session average (volatility expansion).

Entry: NOT on breakout — on first shallow pullback (trend days typically
retrace < 33%). Exit: trailing stop (e.g. 30-min swing) or 13:25 close-out.
Stop: 15–20 pts. Sizing: all 3 lots (low frequency). Per-trade risk 3 x 20
pts = NT$600.

**Kill-question the backtest must answer first**: post-2022 (night session
extended to 14h, absorbing overnight US info) does the day-session trend-day
frequency drop below ~10%? If yes → redesign as night-session variant or
drop.

### 5.2 Strategy #2 — Order-flow confirmed breakout (rule draft)

Signal source: **TXF (big contract) flow; execution on TMF.** TMF's own
book is mostly market-maker mirror quotes off TXF — near-zero standalone
information.

Triple confirmation (AND) at key levels (prior-day H/L, day open, night H/L,
round numbers, opening-range edges):
1. Burst: >= X same-side aggressor lots within N seconds moving price >= P
   points (thresholds = OrderFlowEngine params, to calibrate on TXF).
2. Rolling pressure: 30s aggressor buy-ratio > ~65% (direction-adjusted).
3. Opposing wall behavior at the level: `diff_*_vol` shrinking WITH high
   traded volume = wall eaten (valid break) vs shrinking WITHOUT volume =
   wall pulled (often a trap — treat as fade/no-trade). This distinction is
   the user's manual specialty; needs recorded book data to validate.

Target 15–30 pts, stop = structure invalidation (re-cross of breakout
level), hard-capped at 12 pts. Start 1 lot.

**Critical slippage rule**: market makers see the TXF burst before our
signal→order loop completes. Backtest fills MUST use the opposing quote
**~500ms after** signal time, not signal-time price. Ignoring this inflates
expectancy by 1–2 pts/side (10–20% phantom profit at these targets).

### 5.3 Others (one-liners)

- #3 ORB: range 08:46–09:15 (spans 09:00 spot open info injection), break
  entry, stop mid-range, 2R target or 11:00 time exit. Value = simplest
  full-history validation of the backtest engine itself.
- #4 Night events: momentum windows 20:30 (US data) / 21:30 (US cash open)
  ±30min, TAIFEX-only signals (CVD+price slope), wider slippage assumption
  (night spread), data-release gap risk through stops.
- #5 Settlement Wednesday: fixed-time effects near 13:00–13:30 weekly
  settlement; tiny sample — significance test before any allocation.
- #7 Basis: `underlying_price` gives free real-time basis; use z-score as a
  regime/filter feature for #1/#2, not standalone.

## 6. Backtest Methodology Requirements (all mandatory)

1. **Simtrade filter**: verify + strip auction rows (see §4) before any
   open-range logic.
2. **Latency-adjusted fills**: +500ms opposing-quote rule (§5.2) for any
   flow-triggered entry; ORB/trend-day may use next-tick fills but must
   still charge spread.
3. **Segmented validation**: report 2020–2022 and 2023–present separately
   (regime breaks: night-session extension, TMF launch 2024-07, day-trade
   structure changes). Full-sample-only results are invalid.
4. **Cost sensitivity**: expectancy curve over 5→9 pts round-trip; reject if
   negative at 7+2.
5. **Out-of-sample lockbox**: final 12 months untouched until parameters
   frozen; evaluated exactly once; violation voids the study.

## 7. Acceptance Criteria (verifiable)

Phase 0 — Recorder (build first; TXF + TMF, Tick + BidAsk, day + night):
- Parquet (or equivalent columnar) daily files; all raw fields preserved
  incl. `simtrade`, `diff_*_vol`, `underlying_price`, exchange + arrival ts.
- Gap monitor: no silent gap > 5s during session hours (maintenance-window
  resubscribe handled, ~08:22); gaps logged, not hidden.
- Survives SSE drop (exponential backoff reconnect + resubscribe, mirror
  `stream.ts` behavior) and daily flow-limit tracking.
- Runs unattended (launchd/systemd or equivalent), disk-bounded rotation.

Phase 1 — Backtest:
- Pipeline validated by reproducing ORB on 6y of TXFR1 ticks with sane
  stats before any novel strategy is trusted.
- Strategy pass bar: net expectancy > 0 after 7-pt cost in BOTH segments;
  survives +2pt stress; min samples: >= 60 trades (#1) / >= 300 (#3);
  max drawdown <= 20 stop-units; OOS single-shot confirms sign.

Phase 2 — Shadow (2–4 weeks): daemon emits signals live, no orders; signal
latency tick→signal < 1s; live signals reproduce backtest logic 1:1 on the
same recorded day (replay determinism check); app gets a read-only signal
panel.

Phase 3 — Live: 1 lot → 3 lots; daemon-owned risk: per-trade stop, daily
loss cap 3R with forced flatten + lock (independent of UI/kill-switch),
2 consecutive losing days => halt + review. Ceiling honesty: even good
execution ≈ NT$100–150k/yr at this size; the deliverable is a trustworthy
track record to justify scaling to MXF (whose cost share is LOWER).

## 8. Open User Inputs (asked, unanswered — affects priorities)

1. Tradeable hours: day / night / both / full-auto-unattended. Night-first
   flips #4 to core and forces full automation earlier.
2. Actual TMF commission: >NT$20 kills short-hold styles; NT$10–15 reopens
   selective #2. Negotiating the rate is the highest-ROI single action.
3. Most-trusted manual signal (burst-follow / wall-eaten / pull-fade /
   price-action-first): shapes #2's confirmation design; pull-fade is the
   hardest to codify — plan is to journal it, not automate it.

## 9. Next Session Bootstrap

Suggested build order: (a) recorder daemon (uv project, SDK-direct or local
server SSE — SDK-direct avoids coupling to the app's server lifecycle but
doubles connections; server-SSE shares the app's subscription budget —
decide at build time), (b) historical downloader (TXFR1/TMFR1 `api.ticks`
day-by-day since 2020-03-22 into the same schema), (c) backtest engine with
§6 rules baked in, (d) ORB validator run. Python OrderFlowEngine port comes
with (c). Do not build order execution until Phase 2 exit criteria are met.
