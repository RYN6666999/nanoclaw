# 🧭 NanoClaw AI Compass

> 本文件為機器視覺專用羅盤。所有 AI 必須無條件遵循以下架構與約束。

---

## 🏗️ 系統邊界

### 1. 開發大腦 (IDE Agent)

- **職責**：架構重構、程式碼編寫
- **權限**：直接修改 `nanoclaw/` 檔案
- **約定**：嚴禁執行未知風險的 bash，優先用 grep

### 2. 常駐精靈 (Host Agent)

- **職責**：Telegram 即時回覆、狀態監控
- **執行**：直接執行 `npx tsx src/index.ts`，或透過 PM2

---

## 🗂️ 記憶地圖

真理源：Obsidian Nano_Memories/（同步路徑見 `.env`）

**快速檢索**：

- `qmd_search` — 搜尋知識庫
- `nanoclaw_obsidian_read` — 讀取 Obsidian 筆記

---

## 📜 交互準則

1. **禁止寒暄** — 直接呈現分析結果、方案與 diff
2. **依賴 .env** — 路徑必須從 `.env` 讀取，禁止寫死
3. **成本優化** — 搜尋用 grep，避免盲目 cat 千行檔案
4. **拒絕靜默** — 錯誤必須 logger.warn 記錄

---

## 📚 參考文檔

- **CLAUDE.md** — 精簡原則（IDE 用）
- **docs/ARCHITECTURE.md** — 詳細架構
- **docs/REQUIREMENTS.md** — 設計理念
