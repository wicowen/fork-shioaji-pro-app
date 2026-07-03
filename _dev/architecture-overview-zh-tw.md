# fork-shioaji-pro-app 架構導覽

> 目的：幫助快速理解這個程式怎麼運作、各部分職責、資料如何流動。
> 適合在「決定要把哪些好料抽出來重用」之前先讀一遍。
> 文中程式碼/技術詞用英文，路徑相對於 repo 根目錄。

---

## 0. 三十秒摘要

- 它是永豐官方 `Sinotrade/shioaji-pro-app` 的 fork：一套**專業手動交易終端**（駕駛艙）。
- 技術：**React 19 + TypeScript + Vite**，UI 用 vanilla-extract，圖表用 lightweight-charts，
  版面用 react-grid-layout；可跑成網頁，也可用 Tauri 打包成桌面 App。
- **它本身沒有引擎**：自己不碰 Shioaji SDK。所有行情與下單都透過 HTTP/SSE 打給一個
  另外跑的 `shioaji server`（永豐官方的 Python 服務，預設 `localhost:8080`），由它去接券商。
- 一句比喻：這個 repo 是**駕駛艙**（儀表板＋方向盤），`shioaji server` 是**引擎**，券商是**輪子**。
  駕駛艙自己不會動，要插上引擎才會跑。

```
  [ 這個 repo：React 前端 ]   <--- HTTP REST (pull) ---->   [ shioaji server ]   <-->  [ 永豐券商 ]
   瀏覽器 或 Tauri 桌面視窗    <--- SSE 即時推送 (push) ---     官方 Python 服務          下單/行情
                                                            (localhost:8080)
```

---

## 1. 兩種執行形態

同一份前端碼，兩種跑法：

| 形態 | 怎麼跑 | 後端引擎來源 | 認證 | 特色 |
|------|--------|--------------|------|------|
| **Web** | `pnpm dev` / build 後丟靜態站 | 使用者自己先開 `shioaji server start` | 無（信任 localhost） | 開發、自架 |
| **Tauri 桌面** | 打包 `.dmg`/`.msi`/`.AppImage` | App 自動把 shioaji server 當 **sidecar** 啟動 | 金鑰存桌面 store | 一鍵啟動、自動更新、tray、多視窗、AI Agent |

判斷方式：`src/lib/runtime.ts` 的 `isTauri`（看 `window.__TAURI_INTERNALS__`）。
桌面相關的所有進入點都集中在 `src/lib/tauri.ts`，在瀏覽器一律是 no-op。

---

## 2. 啟動流程（開機做了什麼）

```
index.html
   |
   v
src/main.tsx
   |-- initTheme()            // 套用佈景（dark / 紅漲綠跌 等）
   |-- startTriggerEngine()   // 啟動客戶端觸價引擎，掛上 onAnyTick
   |-- bootstrap()            // 見下
   |-- createRoot().render(<StrictMode><App/></StrictMode>)
```

`src/lib/boot.ts` 的 `bootstrap()` 負責「確保引擎在線才讓畫面正常載入」：

```
bootstrap()
   |-- agentModule?.ensureScheduler()     // 桌面閉源 AI 排程（開源版為 undefined）
   |-- onOrderEvent(...)                   // 每筆委託/成交回報寫進「通知中心」log
   |-- run():
         if Tauri 且設定了金鑰且 autoStart:
             查 serverStatus() -> 健康就沿用（可能換 port 後 reload）
                                -> 不健康/模式不符就 serverStart() 重起，輪詢 health 後 reload
         然後不論平台:
             fetchHealth() 成功 -> （正式環境）subscribeProductionTradeEvents()，正常載入
             fetchHealth() 失敗 -> 顯示「等待 shioaji server」，每 4s 輪詢，一通就 reload
```

重點：**開機時引擎沒上線不會白畫面**，而是輪詢等它起來再自動重載。
（開機後才斷線的情況，交給第 8 節的 SSE 自癒處理，不走 reload。）

---

## 3. 資料流總圖（兩條主動脈）

整個 App 的資料只有兩條路：一條 push、一條 pull。

```
                         ┌─────────────────────────── shioaji server (/api/v1) ───────────────────────────┐
                         │                                                                                  │
   ┌── PUSH (即時) ──────┤  GET /api/v1/stream/data  (Server-Sent Events, 單一長連線)                       │
   │                     │     events: tick_stk / tick_fop / bidask_stk / bidask_fop / order_event / heartbeat
   │                     │                                                                                  │
   │   src/lib/stream.ts │  收事件 -> 寫進 module-level 的 quotes Map -> 通知訂閱的元件                      │
   │        |            │                                                                                  │
   │        v            │                                                                                  │
   │   useQuote(code) ───┼──> chart / depth / tape / flash / quote-board 即時更新                            │
   │                     │                                                                                  │
   └── PULL (要求/回應) ─┤  POST/GET /api/v1/{order,data,portfolio,auth,stream}/...                         │
       src/lib/api.ts    │     apiGet/apiPost/apiPut/apiDelete  (fetch 包裝，桌面走 Rust-side fetch 繞 CORS) │
            |            │                                                                                  │
            v            │                                                                                  │
       src/lib/shioaji.ts┤  把端點包成具名函式：placeFuturesOrder / fetchKbars / fetchPositions / ...       │
                         └──────────────────────────────────────────────────────────────────────────────┘
```

- **PUSH（SSE）**：行情與委託回報。只有一條 EventSource 連線，所有商品共用。進入點 `stream.ts`。
- **PULL（REST）**：下單、改單、刪單、查持倉/損益/K 線/快照/合約。`api.ts` 是底層 fetch 包裝，
  `shioaji.ts` 是把 `/api/v1/...` 端點包成好用的具名函式。
- `api.ts` 會把 server 的錯誤 `{code,message,details}` 拆出來顯示真因（CA/未簽署/參數錯），
  不是丟一個裸的 `400`。

---

## 4. 狀態管理：一個慣例貫穿全場

這個 App **沒有用 Redux/Zustand**。它用一個很一致的土法：
**module-level store ＋ React 的 `useSyncExternalStore`**。

每個 store 檔案長這樣：

```ts
let state = ...                         // 模組層級的單例狀態
const listeners = new Set<() => void>() // 訂閱者
function emit() { listeners.forEach(l => l()) }   // 狀態變了就通知

export function useXxx() {              // 元件用這個 hook 訂閱
  return useSyncExternalStore(subscribe, getSnapshot)
}
```

好處：高頻更新（每個 tick）只重繪「真的有訂閱該商品」的元件，不會整頁重畫，也不用 props 一層層傳。

採用這個模式的 store：

| Store 檔 | 管什麼 | 持久化 |
|----------|--------|--------|
| `lib/stream.ts` | 即時報價 `quotes`、連線狀態、SSE 事件分流 | 否（即時） |
| `lib/contracts-cache.ts` | 代碼 -> ContractInfo 快取、訂閱去重 | 否 |
| `lib/account-store.ts` | 交易帳號清單與選定的股/期帳號 | localStorage |
| `lib/risk.ts` | 風控設定（鎖、單筆上限、當日虧損上限）＋當日損益 | localStorage |
| `lib/trigger-engine.ts` | 客戶端觸價單（停損/停利/警示） | localStorage |
| `lib/price-sync.ts` | 被點選的價格（點價填單用） | 否 |
| `lib/option-pick.ts` | T 字選到的選擇權腳、跨視窗選股 | 否（BroadcastChannel） |
| `lib/features.ts` | 使用者 tier（free/vip）、功能旗標 | localStorage 快取 |
| `lib/theme-store.ts` | 佈景設定 | localStorage |
| `lib/trade.ts` | 通知 toast ＋「通知中心」log | 否 |

React 端的綁定 hook 在 `src/hooks/`（如 `use-stream.ts` 的 `useQuote` / `useStreamStatus`，
`use-poll.ts` 的通用輪詢）。

---

## 5. 分層地圖（哪種東西放哪）

```
src/
├── main.tsx              進入點：initTheme + startTriggerEngine + bootstrap + render
├── App.tsx               根元件：grid 版面、面板分派 (BlockBody)、全域選股、輪詢交易資料
│
├── lib/                  ★ 商業邏輯與狀態（不含 JSX，可單獨重用）
│   ├── api.ts            底層 HTTP 包裝（含 Tauri fetch）
│   ├── shioaji.ts        所有 /api/v1 端點的具名函式
│   ├── stream.ts         SSE 連線 + 報價 store（全場最核心）
│   ├── trade.ts          下單入口 + 安全閘 + 通知中心
│   ├── risk.ts           客戶端風控閘
│   ├── trigger-engine.ts 客戶端觸價引擎
│   ├── bracket.ts        成交後自動掛 OCO 停損/停利
│   ├── contracts-cache.ts 合約解析與訂閱
│   ├── workspace.ts      面板型別、版型、profile 存取
│   ├── tauri.ts          桌面橋接（sidecar、popout、更新、tray）
│   ├── features.ts       開源/閉源切割 + 分級
│   ├── boot.ts           開機編排
│   ├── runtime.ts        環境偵測 + API base 解析
│   ├── price-sync.ts / option-pick.ts   跨面板/跨視窗事件匯流排
│   ├── indicators.ts     MA/EMA/BB/VWAP 計算
│   ├── types/            領域型別（order / market / portfolio / contract / ...）
│   └── utils/            格式化、tick size、kbar 聚合、時間
│
├── components/           ★ 面板 UI（一個檔一個面板，吃 lib/ 的資料）
│   ├── order-ticket / flash-order / combo-ticket / grid-ticket   下單票
│   ├── candle-chart / quote-board / depth-ladder / depth-map / tick-tape / vol-profile  行情
│   ├── bottom-dock / pnl-panel / tray-panel    持倉/損益/帳務
│   ├── watchlist / scanner-panel / sector-heatmap / option-chain / opt-payoff  選股/選擇權
│   ├── command-palette / event-toasts / notice-center / hud-header / panel-chrome  外殼/UX
│   └── server-manager / debug-panel / feature-gate / replay-panel
│
├── hooks/                React 綁定層（把 lib/ store 接成 hook、熱鍵、輪詢）
└── modules-stub/         開源版的閉源模組替身（見第 11 節）
```

相依方向：`components/` 與 `hooks/` 依賴 `lib/`；`lib/` 內部除了 `stream/trade/tauri` 幾個樞紐外大多獨立。
**UI 與邏輯分離得相當乾淨**——這正是「好抽出來重用」的關鍵。

---

## 6. 面板 / 版面系統（這個 App 的骨架）

整個畫面是「一塊可拖拉縮放的 24 欄網格，上面擺很多面板」。

- **面板型別**：`lib/workspace.ts` 的 `BlockType`（chart / depth / ticket / flash / dock / pnl /
  optchain / replay / heatmap / ... 共 21 種）。每種在 `BLOCK_META` 宣告標籤、預設大小、
  是否可釘選 (`pinnable`)、是否單例 (`singleton`)。
- **一個面板 = 一個 Block**：`{ id, type, pin }`。
  - `pin: null` -> 跟著「全域選定的商品」連動。
  - `pin: "TXFR1"` -> 釘死在這個代碼（例如雙圖對照時鎖住一張台指期）。
- **分派**：`App.tsx` 的 `BlockBody` 是一個大 `switch (block.type)`，把每個 Block 渲染成對應元件。
- **版型 profile**：`workspace.ts` 內建 `LAYOUT_PRESETS`（標準看盤 / 當沖 / 雙圖對照 / 選擇權 /
  鋪單 / 閃電矩陣 / 熱力選股 / AI 副駕 / 分析研究）。使用者可存自己的 profile（存 localStorage）。
- **多視窗 popout**：任一面板可彈成獨立視窗。機制是同一個 SPA 帶 URL query `?popout=<type>&code=<code>`
  （`App.tsx` 開頭讀 `POPOUT_TYPE`），桌面用 Tauri `WebviewWindow`，瀏覽器用 `window.open`。

```
 全域選定商品 = "2330"
        │  (pin: null 的面板跟著它走)
        ▼
 ┌──────────┬───────────────────────┬───────────┐
 │ watchlist│      chart (2330)      │  depth    │   <- grid: 24 欄，可拖拉縮放
 │ movers   │                       │  ticket   │
 │          ├───────────────────────┤  tape     │
 │          │   dock (持倉/委託)     │           │
 └──────────┴───────────────────────┴───────────┘
                                      ▲
                            chart(pin:"TXFR1") 不跟著走，永遠顯示台指期
```

---

## 7. 下單路徑（一筆單怎麼送出去）

以手動下單票 `components/order-ticket.tsx` 為例：

```
使用者點「買進下單」
   │  (第一下只是 arm：亮起「確認買進 N 口 @ 價」)
使用者再點一次「確認」              <- 兩段式防呆 (armed state)
   │
   ▼
checkOrderAllowed(qty)             <- lib/risk.ts：鎖? 超單筆上限? 當日虧損達標? 任一成立就擋
   │
   ▼
assertTradingLive()               <- lib/trade.ts：SSE 不是 LIVE 就拒送（避免誤以為送出其實掉單）
   │
   ▼
placeFuturesOrder / placeStockOrder  <- lib/shioaji.ts -> POST /api/v1/order/place_order
   │
   ├─ 成功：顯示狀態，並可選 registerBracket(...) 掛保護單
   └─ 失敗：把 server 的真因訊息顯示在票上
```

**成交後保護單（bracket / OCO）**——`lib/bracket.ts`：

```
進場單送出 -> registerBracket(待命)
   │  偵測成交：兩路並用
   │    (a) SSE order_event 的 Deal 事件（快）
   │    (b) 每 4s 輪詢 fetchTrades 當後備（穩）
   ▼
成交 -> activate(): 依進場方向掛一組 OCO 觸價單（停損 + 停利），其一觸發另一自動撤
```

**客戶端觸價引擎**——`lib/trigger-engine.ts`：

```
startTriggerEngine() 在開機時掛上 onAnyTick
   每個 tick 來：掃 triggers，價格穿越條件就 fire()
   fire(): 移除自己 + 撤 OCO 同組 -> 下市價單（bypassRisk，保護性出場不被風控鎖擋）
```

> 注意：觸價單與風控都是**客戶端**的。只在「分頁開著且 SSE LIVE」時才有效（見第 13 節）。

---

## 8. 即時行情路徑（報價怎麼進來）

```
1) 訂閱：watchlist 或 contracts-cache.ensureContract(code)
        - 解析代碼：STK -> FUT -> OPT -> IND 依序試 (fetchContract)
        - registerCodeAlias(target_code, code)  // 連續月別名，如 TXFF6 <-> TXFR1
        - subscribeQuote(contract, 'Tick' / 'BidAsk')  -> POST /api/v1/stream/subscribe

2) 推送：shioaji server 把該商品的 tick/bidask 透過「那條唯一的 SSE」推回來

3) 收斂：stream.ts
        - handleTick / handleBidAsk -> 寫進 quotes Map -> emitQuote(code)
        - 過濾 simtrade（試撮不閃燈）、intraday_odd（盤中零股不進主板）
        - 把 resolved code 的事件同時鏡射到 alias code

4) 顯示：元件用 useQuote(code) 訂閱，只有訂該商品的元件會重繪
```

**自癒能力（這層做得很紮實）**——全在 `stream.ts`：

- **斷線重連**：`onerror` 後指數退避重連（1s -> 2s -> ... 上限 15s）。
- **重連後重放訂閱**：連線曾斷過 (`everDown`)，`onopen` 時 `resubscribeAll()` 把這個 session
  訂過的所有商品重新訂一次（涵蓋 server 重啟把訂閱清掉的情況）。
- **盤中維護自癒**：永豐 server 每天約 08:22 維護會**靜默丟掉所有訂閱但 SSE 連線還在**。
  `watchMaintenance()` 每 60s 看 `/health` 的 `last_maintenance`，一變動就重放訂閱。

---

## 9. 跨面板 / 跨視窗通訊

面板之間不直接互相呼叫，而是透過幾個小型「事件匯流排」store：

| 匯流排 | 檔案 | 用途 | 跨視窗 |
|--------|------|------|--------|
| 點價填單 | `lib/price-sync.ts` | 在 K 線/五檔點一個價 -> 同商品的下單票自動帶入 | 否 |
| 選擇權腳 | `lib/option-pick.ts` | T 字點一個合約 -> 組合單面板放進一條腿 | 是（`BroadcastChannel 'sj-opt-pick'`） |
| 全域選股 | `lib/option-pick.ts` | popout 視窗點代碼 -> 通知主視窗切換選定商品 | 是（`BroadcastChannel 'sj-select-code'`） |
| 買賣熱鍵 | `hooks/use-hotkeys.ts` | B/S 切買賣、Esc 全刪、Cmd+K | 否（`window` CustomEvent） |

> popout 視窗各自釘死自己的代碼，所以它「選股」不能改自己，而是廣播請**主視窗**切換，
> 主視窗的下單票/五檔/K 線再跟著連動。這是 `option-pick.ts` 後半段在做的事。

---

## 10. 桌面整合（Tauri，`lib/tauri.ts`）

桌面版多了「自己管引擎」的能力，全部集中在這支檔：

- **Sidecar shioaji server**：把官方 CLI 當子程序 (`Command.sidecar('binaries/shioaji', ...)`)。
  - `shioaji server start` 是**前景**程序、永不退出，所以用 `spawn`（不 await 到結束）＋
    輪詢 `/api/v1/info` 最多 ~45s 判斷是否真的起來；起不來才把擷取的 log 顯示出來。
  - `serverStart` 的智慧：已有健康、模式正確、（正式環境）**CA 已啟用**的 daemon 就直接沿用；
    否則停掉重起。8080 被占用就用 `find_free_port` 換 port，把新 port 寫進 localStorage。
  - `caActive()`：正式下單沒 CA 會 400，所以正式環境會先驗 CA 才肯沿用既有 daemon。
- **金鑰存放**：`DesktopSettings`（apiKey/secretKey/production/autoStart/caPath/caPasswd）
  存在 Tauri `LazyStore('settings.json')`，**不在 repo 裡**。`pickCaFile()` 用原生檔案選擇器挑 .pfx。
- **繞 CORS**：桌面 webview 有 CORS、但 shioaji server 不答 preflight，所以 `api.ts` 在 Tauri 下
  改走 Rust 端的 `@tauri-apps/plugin-http` fetch。
- **多視窗**：`openPopout`（單面板）、`openFlashTiles`（閃電矩陣，一商品一個閃電視窗鋪滿螢幕）。
- **自動更新 / tray**：`checkForUpdates`（下載安裝後 relaunch）、`listenTrayEvents`。

---

## 11. 開源 / 閉源與分級（`lib/features.ts` + vite alias）

這個 fork 是「開源核心 ＋ 閉源桌面加值」的結構：

```
import { closedModules } from '@modules'
        │
   vite.config.ts 的 alias 決定 @modules 指向誰：
     有 ./modules/index.ts  (私有 repo，桌面 build) ─┐
     否則 ./src/modules-stub/index.ts (開源版空殼)  ─┴─> 開源 build 自動降級
```

- `features.ts`：每個加值功能宣告所需 `tier`（free/vip）；目前 `FEATURES` 只有 `agent`（AI Agent，
  vip + closed）。`<FeatureGate>` 包住 UI，沒權限就顯示鎖定畫面。
- tier 由閉源 `closedModules.resolveTier()` 決定，開源版恆為 `free`；結果快取在 localStorage 避免閃爍。
- 另有 **Statsig** 功能旗標（`@statsig/js-client`），client key 在 build 時由 `vite.config.ts`
  的 `__STATSIG_CLIENT_KEY__` 注入。

---

## 12. 關鍵檔案速查表（要看 X 去哪個檔）

| 想了解 / 修改 | 看這個檔 |
|----------------|----------|
| 行情怎麼進來、斷線重連、盤中自癒 | `lib/stream.ts` |
| 有哪些後端端點、request/response 形狀 | `lib/shioaji.ts` + `lib/types/` |
| HTTP 錯誤怎麼處理、CORS | `lib/api.ts` |
| 下單流程與安全閘 | `lib/trade.ts` + `components/order-ticket.tsx` |
| 停損/停利、OCO 保護單 | `lib/bracket.ts` + `lib/trigger-engine.ts` |
| 風控（鎖、上限、當日虧損） | `lib/risk.ts` |
| 面板有哪些、版型、預設配置 | `lib/workspace.ts` |
| 面板怎麼被擺上畫面、全域連動 | `App.tsx`（`BlockBody`） |
| 點價填單 | `lib/price-sync.ts` + `components/order-ticket.tsx` |
| K 線圖、指標、圖上下單 | `components/candle-chart.tsx` + `lib/indicators.ts` |
| 桌面 sidecar / 自動更新 / 多視窗 | `lib/tauri.ts` |
| 開機編排、等 server | `lib/boot.ts` + `main.tsx` |
| 環境偵測、API base/port | `lib/runtime.ts` |
| 開源/閉源切割、分級 | `lib/features.ts` + `vite.config.ts` |

---

## 13. 架構脆弱點（理解設計取捨，抽料時要避開）

讀架構時也要知道它的邊界與風險（細節見另一份 code review）：

- **安全只在客戶端、且是「軟」的**：`trigger-engine.ts`（停損/停利）與 `risk.ts`（鎖/上限/當日虧損）
  只在**分頁開著且 SSE LIVE** 時有效。闔上筆電，停損等於不存在。這正是後端下單機要補的那塊。
- **沒有 React ErrorBoundary**：`main.tsx` 裸渲染 `<App/>`。`candle-chart.tsx` 自己註解就寫
  「餵錯 bar 會 throw -> unmount 整個 app（issue #1）」。一個面板崩潰會拖垮整個終端。
- **零自動化測試、無 lint/prettier**：交易核心（trade/bracket/trigger/risk）沒有測試覆蓋。
- **網路邊界零 schema 驗證**：回應一律 `as T` 硬轉；SSE frame 是裸 `JSON.parse`。上游一改就脆。
- **SSE 無法帶認證 header**（EventSource 限制）：所以這套天生綁「本機、不認證」的 server。
- **大檔複雜度**：`bottom-dock` 970L、`candle-chart` 885L、`App.tsx` 829L 等，在零測試下改動風險高。

> 抽料原則：值得抽的是做得最好的呈現層（`stream.ts` 模式、圖表、下單票 UX、store 架構、台股期 utils）；
> 客戶端 risk/trigger/bracket、Statsig、閉源/分級機制屬於「該換或該丟」的部分。

---

## 附錄：一頁全景圖

```
                         ┌─────────────────────────── React 前端 (這個 repo) ───────────────────────────┐
                         │                                                                                │
  使用者操作 ──────────► │  components/  (面板 UI)                                                          │
                         │      │  訂閱 (useSyncExternalStore)                                              │
                         │      ▼                                                                          │
                         │  lib/ stores   stream.ts / risk / account / contracts-cache / trigger / ...     │
                         │      │                    ▲                                                      │
                         │      │ 下單 (REST)         │ 行情/回報 (SSE push)                                 │
                         │      ▼                    │                                                      │
                         │  lib/api.ts -> shioaji.ts │                                                      │
                         └──────────┬────────────────┴──────────────────────────────────────────────────┘
                                    │ HTTP /api/v1/*  +  GET /stream/data (SSE)
                                    ▼
                         ┌──────────────────────────┐
                         │  shioaji server (官方)    │  ← Tauri 桌面版會把它當 sidecar 自動啟動 (lib/tauri.ts)
                         │  Python HTTP/SSE daemon   │
                         └──────────┬───────────────┘
                                    │ Shioaji SDK
                                    ▼
                         ┌──────────────────────────┐
                         │   永豐金證券 (券商)       │
                         └──────────────────────────┘
```
