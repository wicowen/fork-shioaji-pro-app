## v0.1.17 — Codex 訂閱、模型選單、全新通知

### AI Agent：Codex 訂閱直接用
- 新增第三個 Provider「**Codex 訂閱**」：直接使用 Codex CLI 的 ChatGPT 登入（`~/.codex/auth.json`），不用 API Key，額度計入訂閱方案
- Token 過期自動刷新並寫回，Codex CLI 登入不受影響；設定頁顯示登入帳號狀態（桌面版限定）
- **模型改為動態選單**：從各家 API 取得可用模型清單（Anthropic／OpenAI／Codex），不再手填模型名

### 全新通知 Toast
- 依類型設計的醒目卡片：**成交回報**（琥珀）、**委託成功／取消／改價**（綠）、**委託被拒**（紅、加強光暈、停留更久）、訊息（藍）
- 委託回報格式化為乾淨易讀的內容（代碼、買賣方向上色、量與價格），不再出現原始事件文字
- 主題選單新增「**通知大小**」（小／標準／大）

### Agent 自我學習（Hermes 式）
- Agent 完成多步驟任務後會主動把流程存成技能（save_skill），下次直接調用並持續改進；存技能時會通知你，技能分頁可隨時編輯

### 介面
- 伺服器面板按鈕加上 icon（啟動／重啟／停止／檢查更新）；全 App icon 已全面採用 Lucide，無 emoji 圖示

---

⚠ AI 分析僅供參考；自動下單模式請自行評估風險，盈虧自負。Codex 訂閱通道為非官方文件化端點，可能隨 OpenAI 調整而變動。

Shioaji Pro 桌面版 — 內建 shioaji server（sidecar）、伺服器管理介面、系統匣、自動更新。

下載：macOS `.dmg` ｜ Windows `.msi` / `.exe` ｜ Linux `.AppImage` / `.deb` / `.rpm`
