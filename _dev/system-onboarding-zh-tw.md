# Shioaji Pro 系統導覽 (第一次接觸必讀)

> 目標讀者：第一次打開這個 repo 的開發者。讀完這份你會知道「這是什麼、
> 怎麼跑起來、程式碼長在哪、資料怎麼流、要改東西該從哪下手」。
> 搭配閱讀：`_dev/report-code-review-2026-06-15-zh-tw.md` (健康度報告)。

---

## 1. 一句話總結

這是一個**台股 / 期貨 / 選擇權的專業交易終端 (前端)**。用 React 19 + TypeScript
+ Vite 8 寫成，**自己沒有後端**——它透過 HTTP + SSE 跟你電腦上跑的
`shioaji server` 對話，由那個 server 去連永豐金證券下單與收行情。

```
  你 (瀏覽器 / 桌面 App)
        |
        |  本機 HTTP + SSE  (預設 http://127.0.0.1:8080)
        v
  shioaji server  (永豐官方 CLI, 你自己啟動 / 桌面版內建 sidecar)
        |
        |  永豐專屬協定
        v
  永豐金證券主機 (TWSE / TPEX / TAIFEX 行情與委託)
```

**重點心智模型：這個 repo = 上面那層「你」。** 它不碰你的 API 金鑰、不直接連
券商；金鑰與 CA 憑證都在 `shioaji server` 那一層。

---

## 2. 開源 / 閉源邊界 (一定要先懂)

這個 repo 是「介面 100% 開源」，但**桌面外殼與 AI Agent 是閉源的**，理解這條
界線能省下大量困惑 (例如「為什麼找不到 src-tauri？」)。

```
  本 repo (開源)                          私有 repo: shioaji-pro-desktop (閉源)
  +-------------------------------+       +--------------------------------+
  | src/  所有 UI / 行情 / 下單   |       | src-tauri/  Tauri Rust 外殼     |
  | 可 build 出完整 Web 版終端    |       | modules/    AI Agent 等付費模組 |
  +---------------+---------------+       +----------------+---------------+
                  |                                        |
                  |   build 時 vite.config.ts 看 ./modules/index.ts 在不在
                  |                                        |
        OSS build / 沒有 modules                  桌面 build / 有 modules
                  |                                        |
                  v                                        v
        @modules -> src/modules-stub/index.ts     @modules -> 真實私有模組
        (空 manifest, 付費功能顯示鎖屏)            (完整功能)
```

- `@modules` 是一個 **build 期 alias** (見 `vite.config.ts:12`)。
- 開源版會 fallback 到 `src/modules-stub/index.ts` (空殼)。
- 被閘的功能用 `<FeatureGate feature='...'>` 包起來 (`src/components/feature-gate.tsx`)，
  在開源版顯示「桌面版專屬 / VIP 專屬」鎖屏。
- 所以：**你在本 repo 看到的就是全部開源碼**；`src-tauri/` 與 `modules/` 不在這裡。

---

## 3. 三分鐘跑起來 (Web 版)

```sh
# 1. 啟動行情/交易伺服器 (預設模擬環境, 不會動到真錢)
uv tool install shioaji        # 或下載 standalone binary
cp .env.example .env           # 填入 SJ_API_KEY / SJ_SEC_KEY
shioaji server start           # 跑在 http://127.0.0.1:8080
shioaji server check           # 確認狀態

# 2. 啟動前端
pnpm install
pnpm dev                       # http://localhost:5173 (/api 代理到 :8080)
```

- 預設 **simulation 模式**，下單為紙上交易。
- 正式環境：`shioaji server start --production` (需先設好 CA 憑證，務必先在模擬
  環境完整測試)。
- 桌面版 (Tauri) 不用自己跑 server——它內建 sidecar；但桌面外殼閉源，要用就到
  Releases 下載安裝檔。

> 註：本 repo 只能 build/run **Web 版**。`pnpm build` = `tsc -b && vite build`。

---

## 4. 原始碼地圖

```
src/
  main.tsx          入口。順序: initTheme() -> startTriggerEngine() -> bootstrap() -> render(<App/>)
  App.tsx           殼層 (829 行)。動態面板 grid、popout 視窗、帳務輪詢協調
  index.css         全域基底樣式
  theme.css.ts      design tokens (見第 6 節「主題」)

  components/        30 個交易面板 (每個 .tsx 通常配一個同名 .css.ts)
    watchlist / quote-board / candle-chart / depth-ladder / order-ticket /
    flash-order / grid-ticket / combo-ticket / option-chain / opt-payoff /
    scanner-panel / sector-heatmap / vol-profile / depth-map / tick-tape /
    chips-card / pnl-panel / bottom-dock / hud-header / command-palette /
    notice-center / replay-panel / server-manager / tray-panel / feature-gate ...

  hooks/
    use-stream.ts     綁定 SSE 行情 store (useQuote / useStreamStatus / useTradingLive)
    use-poll.ts       通用輪詢 (interval + 手動 refresh)
    use-watchlist.ts  自選清單 (server-backed CRUD)
    use-hotkeys.ts    全域快捷鍵 (B/S 買賣、Esc x2 全刪單、Cmd+K 搜尋)

  lib/                領域邏輯 + 資料存取 (35 模組)
    runtime.ts        環境偵測: isTauri / getApiBase / API port (零相依, 可任意 import)
    api.ts            fetch 封裝: GET/POST/PUT/DELETE + 統一錯誤訊息 (Tauri 走 Rust fetch 繞 CORS)
    shioaji.ts        型別化 API 表面: 把每個 REST endpoint 包成 function
    stream.ts         單一 SSE 連線 + 行情 store + 斷線自愈
    trade.ts          下單入口 placeQuickOrder + 安全閘 + 通知頻道 + 全刪單
    risk.ts           kill switch 風控 (鎖單 / 單筆上限 / 日虧上限)
    trigger-engine.ts 客戶端停損/停利/到價單 (盯 tick, 觸價送市價單, OCO)
    bracket.ts        括號單 (進場成交後自動掛 OCO 停損停利)
    features.ts       feature flags + 分級 entitlement + 閉源模組存取點
    workspace.ts      面板 block 型別 / BLOCK_META / 內建版面預設 / localStorage 持久化
    account-store.ts  交易帳戶: 載入 + 選擇股票/期貨帳戶 (餵給每筆委託)
    contracts-cache.ts 合約快取 (釘選面板用)
    indicators.ts     技術指標計算 (MA/EMA/BBands/VWAP)
    privacy.ts        隱私模式 (遮蔽帳號與金額)
    sounds.ts         WebAudio 音效回報
    theme-store.ts    主題設定 (模式 + 紅綠慣例)
    activity.ts       操作觀察日誌 (取代 console.log 的 in-app 記錄)
    tauri.ts          desktop bridge (498 行): sidecar 管理 / popout / 自動更新 / 系統匣
    types/            領域型別: contract / order / market / portfolio / tick / health
    utils/            純函式: date / format / ticksize / kbars / transformers/tick

  modules-stub/index.ts   開源版 @modules 空 manifest
```

---

## 5. 狀態管理模式 (本專案的靈魂, 務必理解)

這個專案**不用 Redux/Zustand**，而是一套自製的輕量 store：
「**module-level 變數 + listener Set + `useSyncExternalStore`**」。
幾乎每個 `lib/*.ts` store 都是同一個骨架：

```ts
// 通用骨架 (以 risk.ts 為例)
let settings = load();                       // 1. 模組層狀態
const listeners = new Set<() => void>();     // 2. 訂閱者
function emit() { listeners.forEach(l => l()); }   // 3. 通知
export function setRiskSettings(next) {      // 4. 寫入 -> 持久化 -> emit
  settings = { ...settings, ...next };
  localStorage.setItem(KEY, JSON.stringify(settings));
  emit();
}
export function useRiskSettings() {           // 5. React 綁定
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => settings,
  );
}
```

採用這個骨架的有：`stream.ts` (行情)、`risk.ts`、`trigger-engine.ts`、
`account-store.ts`、`features.ts`、`theme-store.ts`、`trade.ts` (通知 log) 等。

**好處**：行情高頻更新時只重繪有訂閱該商品的元件 (見 `stream.ts:215`
`subscribeQuoteStore(code, listener)`)，避免 prop drilling 與全樹重繪。

**看 code 的訣竅**：看到 `useXxx()` 找不到 `useState`，就往對應 `lib/*.ts`
找那個 module-level 變數 + `emit()`，那才是真正的狀態來源。

---

## 6. 核心概念速覽

### 行情串流 (stream.ts)

- **一條** SSE 連線 (`/api/v1/stream/data`) 收所有商品的 tick / 五檔 / 委託回報。
- 收到後寫進 `quotes` Map，再 `emitQuote(code)` 通知訂閱者。
- 元件用 `useQuote(code)` (hooks/use-stream.ts) 取得即時報價。
- 斷線自愈：指數退避重連 (1s→15s)、重連後 `resubscribeAll()` 重放訂閱、
  每 60s 偵測伺服器維護時段後重訂。

### 下單鏈路 (trade.ts -> shioaji.ts -> api.ts)

```
placeQuickOrder()  trade.ts:89
  -> assertTradingLive()    行情非 LIVE 直接 throw (擋誤單)
  -> checkOrderAllowed()    風控檢查 (除非 bypassRisk)
  -> sendOrder() -> placeStockOrder / placeFuturesOrder  shioaji.ts
  -> apiPost('/api/v1/order/place_order')
  -> ensureAccepted()       回應 status==='Failed' 也轉成 throw
```

安全設計：行情死線擋單、風控三道閘 (鎖單/單筆上限/日虧)、HTTP 200 但被拒
也會浮出真正原因。**改下單相關邏輯時務必保留這些閘門。**

### 面板系統 (workspace.ts + App.tsx)

- 整個畫面是 `react-grid-layout` 上的一堆「block」。
- 每種 block 在 `workspace.ts:45 BLOCK_META` 宣告 (label / 可否釘選 / 是否
  單例 / 預設尺寸)；目前有 **21 種** block type。
- `App.tsx:119 BlockBody` 的 switch 決定每種 type 渲染哪個元件。
- block 的 `pin`：`null` = 跟著全域選取的商品連動；字串 = 鎖定某代碼。
- 內建 **10 組版面預設** (`workspace.ts:204 LAYOUT_PRESETS`：標準看盤 / 當沖 /
  雙圖對照 / 選擇權 / 鋪單 / 閃電矩陣 / 熱力選股 / AI 副駕 / 分析研究)。
- 版面 + 自訂 profiles 存在 localStorage (`sj-pro-workspace-v2` / `sj-pro-profiles-v1`)。
- 面板可彈出成獨立視窗 (popout)：`App.tsx:291 PopoutView`，桌面版用原生視窗多螢幕。

### 環境偵測 (runtime.ts)

- `isTauri` 判斷跑在桌面殼還是純瀏覽器。
- `getApiBase()`：桌面版指向 `http://127.0.0.1:<port>`；Web 版走相對路徑 (dev proxy)。
- 同樣的前端碼，兩種環境都能跑。

---

## 7. 啟動序列 (boot.ts)

```
main.tsx
  |
  +-- initTheme()            套用上次的主題 class
  +-- startTriggerEngine()   開始盯 tick 跑客戶端停損/停利
  +-- bootstrap()            boot.ts:21
  |     +-- agentModule?.ensureScheduler()   (閉源 agent 才有)
  |     +-- onOrderEvent(...) 每筆委託回報寫進通知中心
  |     +-- run():
  |           桌面版: 視設定自動啟動內建 shioaji server (sidecar)
  |           偵測 server 健康; 還沒起來就掛 watchdog, 等 server 就緒自動 reload
  |
  +-- render(<App/>)
```

第一次讀 code 建議從 `main.tsx` -> `boot.ts` -> `App.tsx` 這條線進去。

---

## 8. 「我要改 X，該看哪？」對照表

| 你想做的事 | 從這裡開始 |
|------------|-----------|
| 新增一種面板 (block) | `workspace.ts` (加 BlockType + BLOCK_META) -> `App.tsx:119 BlockBody` switch -> 新元件 `components/xxx.tsx` |
| 改下單邏輯 / 加單種 | `lib/trade.ts` (入口閘) -> `lib/shioaji.ts` (API) ；保留 `assertTradingLive` / `checkOrderAllowed` |
| 改風控規則 | `lib/risk.ts` (純邏輯在 `checkOrderAllowed`) + `components/hud-header.tsx` (UI) |
| 加 / 改技術指標 | `lib/indicators.ts` + `components/candle-chart.tsx` |
| 改行情訂閱 / 串流 | `lib/stream.ts` + `lib/shioaji.ts` (subscribeQuote) + `hooks/use-stream.ts` |
| 加一個 REST endpoint | `lib/shioaji.ts` (照既有 function 風格) ；底層用 `lib/api.ts` |
| 改主題 / 顏色 | `src/theme.css.ts` (改 token, 勿硬編碼) + `lib/theme-store.ts` |
| 改版面預設 | `lib/workspace.ts:204 LAYOUT_PRESETS` |
| 改快捷鍵 | `hooks/use-hotkeys.ts` |
| 加一個分級 / 付費功能閘 | `lib/features.ts` (FEATURES 加一筆) + `<FeatureGate feature='key'>` 包 UI |
| 桌面版特有功能 (sidecar/更新/匣) | `lib/tauri.ts` (但 Tauri Rust 端在閉源 repo) |

---

## 9. 容易踩的坑 (Gotchas)

1. **找不到 `src-tauri/` 或 `modules/`** — 正常，它們在閉源 repo。OSS 版用 stub。
2. **預設是模擬環境** — 下單不會動真錢；正式環境會有紅色徽章且每筆都是真實交易。
3. **客戶端觸價單只在頁面開著時生效** — `trigger-engine.ts` 是前端引擎，關掉
   App 就不再監控停損/停利 (UI 有提示，改相關功能時別誤解為伺服器側保證)。
4. **R1/R2 連續月合約是「資料用」代碼** — 下單必須換成真實合約
   (`shioaji.ts:181 orderableKey`，例 TXFR1 -> TXFF6)，否則交易所會拒單。
5. **狀態不在元件裡** — 多數狀態是 `lib/*.ts` 的 module-level store，不是 `useState`
   (見第 5 節)。
6. **限流意識** — 上游帳務 API 有 25 req/5s 限制，多開 popout 時靠 jitter 錯開
   (`App.tsx:305`)；新增輪詢時注意別打爆。
7. **目前沒有自動化測試** — 改到下單 / 風控 / 拆單數學時要特別小心 (見健康度
   報告的 P0 測試建議)。
8. **vanilla-extract 是 zero-runtime** — 動態樣式值要走 inline style 或 CSS 變數，
   不能寫進 `.css.ts` 的靜態定義。

---

## 10. 名詞表 (Glossary)

| 名詞 | 說明 |
|------|------|
| Shioaji | 永豐金證券的程式交易 API；本專案前端對接的是它的 HTTP/SSE server 版 |
| SSE | Server-Sent Events，伺服器單向推播；本專案用一條 SSE 收所有即時行情 |
| tick | 逐筆成交資料 (價、量、時間) |
| 五檔 / bidask | 委買委賣前五檔報價與量 |
| simtrade / 試撮 | 開盤前模擬撮合價，**非真實成交** (本專案不讓它觸發閃動) |
| ROD / IOC / FOK | 委託效期：當日有效 / 立即成交否則取消 / 全部成交否則取消 |
| octype | 期貨開平倉別 (Auto / New / Cover / DayTrade) |
| order_lot | 股票交易單位：Common (整股/張) / IntradayOdd (盤中零股) |
| CA | 憑證 (Certificate Authority)；正式環境下單必備，過期會被拒單 |
| TXFR1 / R1·R2 | 期貨「連續月」別名 (近月/次近月)；下單要換成真實月份合約 |
| combo / 組合單 | 多腳期權策略單 (價差、跨式…) |
| OCO | One-Cancels-Other，一邊成交另一邊自動撤銷 (停損停利互斥) |
| kill switch / 風控鎖 | 一鍵封鎖所有下單的安全開關 (`risk.ts`) |
| sidecar | 桌面版內建、隨 App 啟動的 `shioaji server` 子程序 |
| Tauri | 用 Rust + 系統 webview 打包桌面 App 的框架 (本專案桌面殼，閉源) |
| @modules | build 期 alias，指向私有付費模組或開源空 stub |
| FeatureGate | 包住付費/桌面專屬功能的 UI 閘門元件 |

---

## 11. 建議的閱讀順序

```
1. README.md                      產品全貌與功能清單
2. 本檔 (system-onboarding)        系統心智模型
3. src/main.tsx -> lib/boot.ts    啟動序列
4. src/App.tsx                    殼層如何組裝面板
5. lib/stream.ts + hooks/use-stream.ts   行情如何進到畫面
6. lib/trade.ts + lib/shioaji.ts  下單如何送出去 (含安全閘)
7. lib/workspace.ts               面板/版面系統
8. 挑一個 components/*.tsx 對照看  例如 order-ticket.tsx 或 candle-chart.tsx
9. _dev/report-code-review-...    健康度與待改善項
```

歡迎加入。先在**模擬環境**把整套跑起來，點幾筆單觀察「下單 -> SSE 回報 ->
面板更新」的閉環，是理解這個系統最快的方式。
