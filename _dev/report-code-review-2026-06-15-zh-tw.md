# 程式碼審查報告 — 2026-06-15

## 專案概覽

```
shioaji-pro-app — 台股 / 期權專業交易終端 (Trading Terminal)
React 19 + TypeScript 5.9 + Vite 8 ・ 純前端，零後端碼

版本: v0.1.23        提交數: 117 (2026-06-10 ~ 06-14)
程式碼: ~19,237 行 (src .ts/.tsx)
元件: 30 個 .tsx    lib 模組: 35    css.ts: 27    hooks: 4    utils: 5
規格文件 (openspec): 無    單元測試: 0    E2E 測試: 0
授權: AGPL-3.0-only (強 copyleft)
```

本專案是一個「介面 100% 開源」的桌面/Web 交易終端：UI、行情串流、下單鏈路
全在本 repo；桌面外殼 (Tauri shell) 與 AI Agent 為**閉源模組**，build 時透過
`@modules` alias 注入（開源版 fallback 到空的 stub）。前端不直接連券商，而是
透過本機的 `shioaji server` (HTTP + SSE) 通訊。

### 整體評估: 良好 (架構與型別品質優秀；主要缺口為測試覆蓋與 lint enforcement)

這是一份成熟度遠高於「117 commits 新專案」平均水準的程式碼庫。型別紀律近乎
完美 (0 個 `any`)、分層清晰、領域安全控制 (kill switch / 斷線擋單 / 模擬預設)
設計周到、CI/Release 流程處理了多個 race condition。最大的單一風險是**完全
沒有自動化測試**——對一個會送出真實委託的交易系統而言，這是首要待補項。

### 專案結構總覽

```
shioaji-pro-app/
+-- src/
|   +-- main.tsx              入口: initTheme -> startTriggerEngine -> bootstrap -> render
|   +-- App.tsx              (829) 殼層: 動態面板 grid + popout 多視窗 + 輪詢協調
|   +-- theme.css.ts          design tokens: 3 模式 x 紅綠慣例 = 6 主題
|   +-- components/           30 個交易面板 (UI 層)
|   |   +-- *.tsx             元件邏輯
|   |   +-- *.css.ts          vanilla-extract 樣式 (zero-runtime)
|   +-- hooks/                use-stream / use-poll / use-watchlist / use-hotkeys
|   +-- lib/                  領域邏輯 + 資料存取 (35 模組)
|   |   +-- runtime.ts        環境偵測 (isTauri / getApiBase) — 零相依葉節點
|   |   +-- api.ts            fetch wrapper (Tauri HTTP 繞過 CORS)
|   |   +-- shioaji.ts        型別化 API 表面 (REST endpoints)
|   |   +-- stream.ts         單一 SSE 連線 + 行情 store
|   |   +-- trade.ts          下單入口 + 通知頻道 + 安全閘
|   |   +-- risk.ts           kill switch 風控
|   |   +-- trigger-engine.ts 客戶端停損/停利/到價觸發
|   |   +-- bracket.ts        括號單 (成交後自動掛 OCO)
|   |   +-- features.ts       feature flags + 分級 entitlement
|   |   +-- workspace.ts      面板 block 定義 + 版面預設 + 持久化
|   |   +-- tauri.ts         (498) desktop bridge: sidecar/popout/updater/tray
|   |   +-- types/           領域型別 (contract/order/market/portfolio/tick/health)
|   |   +-- utils/           純函式 (date/format/ticksize/kbars/transformers)
|   +-- modules-stub/index.ts 開源版 @modules 空殼
+-- .github/workflows/
|   +-- web-build.yml         OSS build 保證 (不含私有模組也能 build)
|   +-- release.yml           桌面版多平台簽章 release + 自動更新
+-- scripts/                  Python: landing 截圖 / 修 updater latest.json
+-- docs/                     landing page + 截圖
```

---

## 架構設計

### 分層架構與依賴規則

```
                         +-----------------------------+
   入口 / 協調           |  main.tsx  ->  boot.ts       |
                         |  App.tsx (面板 grid 殼層)    |
                         +--------------+--------------+
                                        | uses
                         +--------------v--------------+
   UI 層                 |  components/ (30 panels)     |
                         |  hooks/ (use-stream/poll...) |
                         +------+----------------+------+
                                | subscribe      | call
              +-----------------v---+       +-----v----------------+
   狀態 store (leaf)     | stream / risk /     |   領域邏輯         |
   useSyncExternalStore  | trigger / account / |   trade / bracket  |
                         | features / theme    |   indicators       |
                         +-----------------+---+       +-----+------+
                                           |                 | call
                                  +--------v-----------------v---+
   資料存取              |        shioaji.ts (typed API)        |
                         +------------------+-------------------+
                                            | http
                         +------------------v-------------------+
                         |  api.ts (fetch / Tauri HTTP)         |
                         +------------------+-------------------+
                                            | base url
                         +------------------v-------------------+
                         |  runtime.ts (isTauri / getApiBase)   |  <- 零相依
                         +-------------------------------------+

依賴方向 (上 -> 下) 一律單向，未發現循環相依:
  components -> shioaji -> api -> runtime        OK
  stream / risk / trigger (store) 為葉節點        OK
  runtime.ts 不 import 任何專案模組               OK (可被任意處安全 import)
```

分層乾淨、單向相依。狀態管理採「module-level store + `useSyncExternalStore`」
的輕量自製模式 (見 `stream.ts:215`、`risk.ts:63`、`account-store.ts:107`)，
不依賴 Redux/Zustand，避免 prop drilling 又能精準觸發訂閱者重繪，對高頻行情
場景是合適的選擇。

### 下單生命週期 (order lifecycle)

```
  使用者點擊下單
        |
        v
  trade.ts:89  placeQuickOrder(contract, action, price, qty)
        |
        +--> assertTradingLive()          trade.ts:83   行情非 LIVE 即 throw (擋誤單, issue #2)
        +--> checkOrderAllowed(qty)        risk.ts:74    風控鎖/單筆上限/日虧上限
        |
        v
  sendOrder() -> placeStock/FuturesOrder   shioaji.ts:202/209
        |        +--> orderableKey()        shioaji.ts:181  R1/R2 連續月 alias -> 真實合約
        |        +--> account 注入          account-store.ts:100  accountFor('S'|'F')
        v
  api.ts:48  apiPost('/api/v1/order/place_order')
        |
        v
  shioaji server -> 永豐主機
        |
        v
  回應 -> ensureAccepted()                  shioaji.ts:193  status==='Failed' 即 throw (顯示真正原因)
        |
        v
  SSE order_event -> stream.ts:163 -> App.tsx:483 防抖 500ms -> refreshTrading() 全面板更新
```

下單路徑的**防呆設計是本專案最大亮點**：行情未連線一律擋單、風控前置檢查、
HTTP 200 但 `status: Failed` 也轉成 throw，讓每一條既有 error 處理都能浮出
真正原因 (CA 問題、未簽署、價格不合法…)。

### 行情串流 (single SSE)

```
  shioaji server  ==(單一 SSE)==>  stream.ts:146 EventSource '/api/v1/stream/data'
        |
        +-- tick_stk / tick_fop      -> handleTick   -> ingestTick  -> quotes Map
        +-- bidask_stk / bidask_fop  -> handleBidAsk -> ingestBidAsk-> quotes Map
        +-- order_event              -> orderEventListeners
        +-- heartbeat                -> lastHeartbeat / status=live
        |
        v
   emitQuote(code) -> useSyncExternalStore (use-stream.ts) -> 對應面板重繪

  斷線自愈:
    onerror -> 指數退避重連 (1s -> 15s 上限)            stream.ts:172
    重連成功 -> resubscribeAll() 重放所有訂閱            stream.ts:124
    每 60s watchMaintenance() 偵測伺服器維護後自動重訂   stream.ts:188
```

單一連線 + store fan-out 是正確選擇 (避免 N 條連線)、斷線自愈與維護時段
重訂閱考慮周全，是 production 級的串流設計。

### 開源 / 閉源邊界

```
  vite.config.ts:12   modules/index.ts 存在?
        |                   |
       是 (桌面 build)     否 (OSS build)
        |                   |
        v                   v
   私有 @modules        src/modules-stub/index.ts (空 manifest)
   (AI Agent 等)             |
        |                   v
        +----> features.ts: featureState() -> <FeatureGate> 顯示「桌面版專屬」鎖屏
```

開源/閉源切分透過建置期 alias (`@modules`) 完成，UI 閘門 (`feature-gate.tsx`)
是公開的、被閘的實作才閉源。`web-build.yml` 在 CI 強制驗證「不含私有模組也能
build 出可用 Web 版」，是很乾淨的雙軌做法。

---

## 程式碼品質

### 品質掃描結果

| 檢查項目 | 狀態 | 說明 |
|----------|------|------|
| TypeScript 嚴格模式 | PASS | `strict` + `noUncheckedIndexedAccess` + `isolatedModules` 全開 (tsconfig.app.json) |
| `any` 使用 | PASS | 全專案 0 個 `: any` / `as any` — 型別紀律極佳 |
| Debug 殘留 (console) | PASS | 0 個 `console.*` / `debugger`；改用 in-app 通知中心 + `activity.ts` 觀察日誌 |
| TODO / FIXME / HACK | PASS | 0 個遺留標記 |
| CSS `!important` | PASS | 0 個 |
| 依賴規則 / 分層 | PASS | 單向相依，無循環；`runtime.ts` 為零相依葉節點 |
| 領域型別模型 | PASS | `lib/types/` 完整切分 contract/order/market/portfolio/tick/health |
| 錯誤處理一致性 | PASS | API 錯誤統一 `throwApiError` (api.ts:21) + `ensureAccepted` (shioaji.ts:193) |
| React Hooks deps | WARN | 21 處 `eslint-disable react-hooks/exhaustive-deps` (見下) |
| 行內樣式 inline style | WARN | 86 處；多數合理 (動態值 / icon 對齊)，少數靜態可抽 class |
| 硬編碼顏色 | WARN | `theme.css.ts` 已完整 token 化；元件 css.ts 18 處、tsx inline 24 處 (多為 `var(--x, #fallback)`) |
| Lint / Format 設定 | WARN | repo 內**無** eslint/prettier 設定；OSS CI 只 `pnpm build` 未跑 lint |
| 測試覆蓋 | FAIL | 0 測試檔、0 測試框架設定 |

### React Hooks `exhaustive-deps` (21 處)

集中於 chart / option / combo / watchlist 等高互動元件。這是 React 常見但有
風險的模式 (刻意省略 deps 以避免重複執行 effect)。逐一檢視，符合下列其一者
應重構：

```
src/App.tsx:562                  selected?.code 觀察 — 可接受 (只追單一欄位)
src/components/candle-chart.tsx  325/339/403/511/559/699 (6 處) — 重點檢視對象
src/components/combo-ticket.tsx  208/231/304/311 (4 處)
src/components/option-chain.tsx  120/145/167 (3 處)
src/hooks/use-watchlist.ts:321
... 其餘 6 處分散於 opt-payoff/vol-profile/replay/grid/bottom-dock
```

> 注意：本 repo **沒有** eslint 設定檔，因此這些 `eslint-disable` 在開源 CI
> 中並未實際生效 (lint 規則沒被執行)。它們反映私有桌面 repo 可能有跑 lint，
> 但開源版的 hook deps 規則目前是「未強制」狀態。

### 行內樣式分類 (86 處)

```
合理 (應保留):
  - icon 微調   style={{ verticalAlign: '-1px' }}     (lucide icon 對齊, ~25 處)
  - 動態數值    style={{ width: `${pct}%` }}            (flash-order/vol-profile/depth-ladder)
  - 動態顏色    style={{ background: tileColor(pct) }}  (sector-heatmap)
  - token+fallback  style={{ color: 'var(--danger, #f23645)' }}

可改進 (抽成 vanilla-extract class):
  - 靜態 layout style={{ flex: 1 }} / {{ textAlign: 'right' }} / {{ fontSize: '0.7rem' }}
  - feature-gate.tsx:22-55 整段靜態 style 物件 (最值得重構的單點)
```

vanilla-extract 是 zero-runtime/靜態方案，動態值本來就只能走 inline 或
CSS 變數，因此多數 inline 屬合理取捨；建議僅針對「靜態且可重用」者收斂。

---

## 安全性 (OWASP)

| 風險等級 | 類別 | 位置 | 說明 |
|----------|------|------|------|
| LOW | A03 Injection | (全域) | 0 個 `eval` / `innerHTML` / `dangerouslySetInnerHTML`；`react-markdown` 未用 `rehype-raw` (不渲染原始 HTML)；查詢字串皆 `encodeURIComponent` (shioaji.ts:71/94) |
| LOW | A02 Crypto Failures | api.ts / runtime.ts | 前端不持有任何券商金鑰；`SJ_API_KEY/SEC_KEY`、CA 憑證皆在 `shioaji server` 端 (.env / Tauri store)；`STATSIG_CLIENT_KEY` 為可公開金鑰 |
| LOW-MED | A02 本機金鑰儲存 | tauri.ts:295 `loadDesktopSettings` | 桌面版 API 金鑰存於 Tauri store (本機 App 資料夾)，為明文；屬使用者自有裝置，風險可接受但可文件化提醒 |
| LOW | A01 Access Control | features.ts:111 | feature gate 為**客戶端**判斷，可被繞過；但被閘的程式碼本身不在 OSS bundle，故無「解鎖」可言，實質存取控制在 server + CA |
| LOW | A05 Misconfiguration | api.ts:10 | Tauri HTTP 刻意繞過 CORS、dev proxy `/api -> :8080`；皆限本機，符合 shioaji 的本機信任模型 |
| INFO | 供應鏈 | release.yml:59 | 私有模組以**唯讀 deploy key** 拉取，用後即刪 `~/.ssh/agent_key`；`pnpm install --frozen-lockfile`；updater 用 Tauri 簽章 + macOS 公證 |

### 安全性正面評價 (領域安全控制)

對交易系統而言，下列「業務安全」設計比一般 web 安全更關鍵，且實作到位：

```
  trade.ts:83    assertTradingLive()  — 行情死線時拒絕送單，避免「以為送出其實沒送」
  risk.ts:74     checkOrderAllowed()  — 風控鎖 / 單筆上限 / 日虧上限三道閘
  README/UI      模擬環境為預設、正式環境紅色徽章、閃電下單預設鎖定、兩段式確認
  trigger-engine.ts:117  保護性出場 bypassRisk — 停損單不被風控鎖卡住 (合理例外)
```

無發現高/中危資安漏洞。

---

## 效能

```
輪詢策略 (App.tsx:440-470):
  positions  10s   trades 8s   margin 30s   balance 60s
  popout 視窗額外加 0~6s jitter (App.tsx:305) 避開上游限流 (25 req/5s) 同步尖峰

行情串流:
  單一 SSE 連線 + store fan-out (useSyncExternalStore) — 重繪範圍最小化   GOOD
  指數退避重連 (stream.ts:172) 1s -> 15s 上限                              GOOD

計時器 / 監聽器:
  setInterval(15) == clearInterval(15)            平衡, use-poll.ts:28 確實清理
  addEventListener(16) vs removeEventListener(13) 3 處可能未解除 (建議稽核)
```

| 等級 | 項目 | 位置 | 說明 |
|------|------|------|------|
| LOW | popout 多開輪詢 | App.tsx:306-331 | 閃電全開可同時 8+ 視窗，各自輪詢；已用 jitter + 較長間隔緩解，但商品數放大時仍需留意上游限流 |
| LOW | 事件監聽未解除 | (待稽核) | add/remove 數量差 3，建議逐一確認 cleanup |
| INFO | 串流設計 | stream.ts | 單連線 + store 為高頻行情的最佳實務 |

效能設計整體良好，且程式碼註解顯示作者對限流、重繪、重連都有意識。

---

## 測試覆蓋

```
原始碼檔案 (非測試): ~96
測試檔案:             0
測試框架設定:         無 (vitest/jest/playwright 皆未設定)
覆蓋率:               0%
```

這是本次審查的**最高優先風險**。一個會送出真實金錢委託的系統，目前所有正確性
保證都依賴人工與型別檢查。以下純函式 / 領域邏輯「易測且高價值」，應優先補測：

### 未測試的關鍵路徑 (建議測試順序)

| 優先 | 目標 | 位置 | 為何關鍵 |
|------|------|------|----------|
| P0 | `checkOrderAllowed()` | risk.ts:74 | kill switch 是最後防線，純函式可完整窮舉 |
| P0 | `placeStockExitByShares()` | trade.ts:141 | 整股/零股拆單數學 (lots / odd) 算錯即下錯量 |
| P0 | `orderableKey()` | shioaji.ts:181 | R1/R2 alias 解析錯誤會下到錯合約 (issue #1) |
| P0 | `ensureAccepted()` | shioaji.ts:193 | Failed 偵測邏輯, 攸關錯誤是否浮出 |
| P1 | trigger 觸發 / OCO | trigger-engine.ts:90 | 條件跨越 + 互斥撤銷 + 防重複 `firing` |
| P1 | `utils/ticksize` `utils/format` `utils/date` `utils/kbars` | lib/utils/ | 純函式, 快速見效 |
| P2 | `validWorkspace()` 還原 | workspace.ts:385 | 版面持久化還原的健壯性 |

---

## 技術債

### TODO / FIXME 清單

| 標記 | 數量 | 說明 |
|------|------|------|
| TODO / FIXME / HACK / XXX | 0 | 無遺留標記 (相當乾淨) |

### 其他技術債

| 項目 | 位置 | 說明 / 建議 |
|------|------|-------------|
| 無 lint/format 設定 | (repo root) | 補 `eslint.config.*` + prettier/biome，並加入 `web-build.yml` CI；現有 21 處 disable 已預設 eslint 會跑 |
| 未使用相依 (OSS 視角) | package.json:29-30 | `react-markdown` / `remark-gfm` 在 OSS src 無使用 (屬閉源 agent)，OSS build 視角為 dead deps |
| 版本號不一致 | package.json:4 | `"version": "0.0.0"` 但實際 release v0.1.23 (版本由閉源 src-tauri 管理) — 易誤導 |
| 按鈕對比色未 token 化 | flash-order.css.ts:86,339 candle-chart.css.ts:76,154 | `#1a1304` / `#fff` 等對比文字色建議加入 theme token (如 `onUp`/`onDown`) |
| 事件監聽 cleanup 缺口 | (待稽核) | add/remove 數量差 3 |

---

## 建議改善方向

### 立即 (低風險, 高收益)

1. **導入 Vitest 並先測純領域邏輯** — `risk.ts` / `trade.ts` 拆單 / `shioaji.ts` orderableKey+ensureAccepted / `utils/*`。直接保護金錢路徑，且這些是純函式，成本低。
2. **加入 eslint + prettier 設定並進 CI** — 在 `web-build.yml` 加 `pnpm lint` 與 `tsc --noEmit` gate；現有 disable 註解已假設 eslint 存在。
3. **重構 `feature-gate.tsx:22-55` 的整段 inline style** 為 vanilla-extract class — 最值得收斂的單點。

### 近期 (需要規劃)

1. **逐一檢視 21 處 `exhaustive-deps` disable** — 凡是「以 effect 計算衍生值」者改 `useMemo`/`computed`，並明確宣告 deps；重點看 `candle-chart.tsx` 6 處。
2. **把按鈕對比色納入 theme token** — 消除元件 css.ts 的 18 處硬編碼 hex。
3. **稽核事件監聽 cleanup** — 確認 add/remove 對齊，避免長時間執行的看盤視窗記憶體累積。
4. **針對下單生命週期寫整合測試** — 以 mock shioaji server 驗證 place/cancel/Failed 路徑。

### 未來 (等待前置條件)

1. **E2E 冒煙測試 (Playwright)** — 模擬環境下 place/cancel 委託、版面載入；前置：先有上述單元/整合測試基礎。
2. **診斷面板可匯出 telemetry** — 連線/委託時間軸匯出，利於回報問題。
3. **OSS dead deps 清理或條件化** — 釐清 `react-markdown` 等是否該移到閉源 modules 的 package。

---

## 附錄: 關鍵檔案索引

| 用途 | 路徑 |
|------|------|
| 應用入口 / 啟動序列 | src/main.tsx ・ src/lib/boot.ts |
| 面板殼層 / 版面 grid | src/App.tsx ・ src/lib/workspace.ts |
| 行情串流 (SSE store) | src/lib/stream.ts ・ src/hooks/use-stream.ts |
| API 表面 / fetch 封裝 | src/lib/shioaji.ts ・ src/lib/api.ts ・ src/lib/runtime.ts |
| 下單 / 風控 / 觸價 | src/lib/trade.ts ・ src/lib/risk.ts ・ src/lib/trigger-engine.ts ・ src/lib/bracket.ts |
| 帳戶 / 持倉 | src/lib/account-store.ts ・ src/lib/types/portfolio.ts |
| 主題 / 設計 token | src/theme.css.ts ・ src/lib/theme-store.ts |
| Feature gate / 閉源邊界 | src/lib/features.ts ・ src/components/feature-gate.tsx ・ src/modules-stub/index.ts |
| Desktop bridge | src/lib/tauri.ts |
| CI / Release | .github/workflows/web-build.yml ・ .github/workflows/release.yml |

---

*本報告由 project-code-review 產出，掃描範圍為公開 OSS repo (不含私有 `@modules` 桌面模組)。所有 `file:line` 參照以審查當下版本為準。*
