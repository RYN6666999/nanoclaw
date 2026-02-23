# 任務：拆分 telegram.ts（1321 行 → 4 個模組）

## 先前脈絡
telegram.ts 混合了 5 種職責。P4（型別安全）和 P5（handoff 抽取）必須先完成。

## 前置條件
- P4 已合併（`(global as any)` 已消除）
- P5 已合併（handoff 邏輯已抽到 `handoff-service.ts`）

## 拆分計劃

### 模組 1：`src/telegram-markdown.ts`（純函式，零依賴）
從 telegram.ts 提取：
- `markdownToTelegramHtml(md: string): string` — Markdown→Telegram HTML 轉換
- `escapeHtml(text: string): string`
- 所有相關的 regex 常數

預估行數：~120 行

### 模組 2：`src/telegram-stream.ts`（streaming 控制器）
從 telegram.ts 提取：
- `StreamController` class 或相關函式
- emoji cycling 邏輯
- 分段發送 / 編輯訊息邏輯
- 依賴：grammy Bot type, telegram-markdown

預估行數：~250 行

### 模組 3：`src/prompt-enrichment.ts`（AI 提示詞豐富化）
從 telegram.ts L27-92 提取：
- `enrichPrompt()` — 圖片描述 + 上下文注入
- 不應屬於 Telegram channel 層
- 依賴：config, host-agent

預估行數：~80 行

### 模組 4：`src/telegram.ts`（瘦身後主檔）
保留：
- Bot 初始化 + middleware
- 指令路由（/start, /status, /restart, /handoff 等）
- callback_query handler
- import 上述 3 個模組

預估行數：~600 行（從 1321 降至 ~45%）

## 關鍵約束
1. **每次只拆一個模組**，拆完跑 `npx tsc --noEmit` + 啟動測試
2. 先拆 telegram-markdown（零依賴最安全）→ telegram-stream → prompt-enrichment
3. 所有 export 保持原始函式簽名不變
4. 如果 telegram.ts 中有 circular import（如 host-agent ↔ telegram），
   用動態 `await import()` 保持現有模式

## 驗證
```bash
npx tsc --noEmit  # 零錯誤
npx tsx src/index.ts  # 啟動正常
# Telegram 端測試：發送文字訊息、圖片、/status、/handoff
wc -l src/telegram*.ts  # telegram.ts < 700 行
```

## 量化指標
- telegram.ts 行數 ≤ 650 行（降幅 ≥ 50%）
- 新模組各自 ≤ 300 行
- 零功能回歸（所有指令、streaming、markdown 轉換行為不變）
