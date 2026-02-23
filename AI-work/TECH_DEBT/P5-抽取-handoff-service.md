# 任務：抽取 handoff-service.ts，消除 3 處重複

## 先前脈絡
Handoff summary 的生成、持久化、格式化邏輯重複出現在 3 個位置。

## 目標
新建 `src/handoff-service.ts`，統一呼叫介面，3 處改為單一 import。

## 最終狀態
- commit 68e21ea 為最新基準（P1-P3 已完成）

## 現有重複位置（行號已根據 P2 修改更新）
1. `host-agent.ts` L613-695：自動生成 handoff（完整 flow：呼叫 LLM → 寫檔 → 發送 Telegram）
2. `host-agent.ts` L747-795：`triggerHandoffForGroup`（手動觸發版）
3. `telegram.ts` L185-224 + L466-498：Telegram UI 展示 handoff 結果

## 設計

### 新檔案 `src/handoff-service.ts`
```ts
export interface HandoffResult {
  title: string;
  summary: string;
  nextPrompt: string;
  obsidianPath: string;
  commitMessage?: string;
}

// 核心：呼叫 LLM 生成 handoff summary
export async function generateHandoff(
  groupFolder: string,
  messages: Array<{ role: string; content: string }>,
  meta?: { changedFiles?: string[] }
): Promise<HandoffResult>

// 持久化：寫入 Obsidian + sessions.json
export async function persistHandoff(
  groupFolder: string,
  result: HandoffResult
): Promise<void>

// 格式化：產生 Telegram 顯示用的 HTML
export function formatHandoffForTelegram(
  result: HandoffResult
): string
```

### 修改 `host-agent.ts`
- L613-695 → `const result = await generateHandoff(...); await persistHandoff(...);`
- L747-795 → 同上，調用 `triggerHandoffForGroup` 改為薄包裝

### 注意
- `host-agent.ts` L653 的 `getRegisteredGroups` 已在 P2 修為直讀 JSON，新 handoff-service 同樣直讀
- `DATA_DIR` 已在 P2 加入 host-agent.ts import

### 修改 `telegram.ts`
- L185-224, L466-498 → `formatHandoffForTelegram(result)`

## 驗證
```bash
npx tsc --noEmit
# 手動測試：在 Telegram 發送 /handoff，確認輸出格式不變
grep -rn "handoff" src/host-agent.ts src/telegram.ts | wc -l  # 應大幅減少
```

## 量化指標
- handoff 相關重複程式碼行數減少 ≥ 60%
- 公開介面（export function）= 3 個
- 行為不變（輸出格式、檔案路徑、Telegram 訊息完全一致）
