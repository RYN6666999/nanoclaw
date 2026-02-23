# 任務：抽取 handoff-service.ts，消除重複

## 現狀（基準 commit `c1d2016`）
Handoff 格式化邏輯重複 4 處：
1. `src/telegram/commands.ts` L49-73 — handleHandoffButton
2. `src/telegram/channel-handler.ts` L41-76 — channel /handoff command
3. `src/telegram/callback-handler.ts` L30-52 — dry-run display
4. `src/host-agent.ts` L759-795 — triggerHandoffForGroup

四處都做同樣的事：呼叫 `triggerHandoffForGroup` → 組裝 lines[] → 顯示。

## 設計

### 新檔案 `src/handoff-service.ts`
```ts
import type { HandoffSummary } from './types.js';

/**
 * 格式化 HandoffSummary 為可讀文字行。
 * 統一所有 UI 呈現（Telegram text / channel / callback）。
 */
export function formatHandoffLines(
  groupName: string,
  summary: HandoffSummary,
): string[] {
  const lines: string[] = [];
  lines.push(`**Handoff 建議 - ${groupName}**`);
  lines.push(`優先度：${summary.priority}`);
  if (summary.summary) lines.push(`\n**脈絡提示詞：**\n${summary.summary}`);
  if (summary.obsidianLog) lines.push(`\n**Obsidian：**\n${summary.obsidianLog}`);
  if (summary.changedFilesList?.length) {
    lines.push('\n**變更檔案：**');
    lines.push(summary.changedFilesList.slice(0, 20).join('\n'));
  }
  if (summary.commitSuggestion?.shouldCommit) {
    lines.push(`\n**建議 commit:** ${summary.commitSuggestion.message}`);
  } else {
    lines.push('\n無自動 commit 建議');
  }
  return lines;
}
```

### 修改點
| 檔案 | 行 | 動作 |
|------|-----|------|
| `telegram/commands.ts` | L49-73 | → `formatHandoffLines(group.name, summary).join('\n')` |
| `telegram/channel-handler.ts` | L41-76 | → 同上 |
| `telegram/callback-handler.ts` | L30-52 | → `formatHandoffLines(group.name, summary)` (dry-run 版) |
| 舊 `src/telegram.ts` | 整檔 | 已在 P4 刪除 |

## 前置條件
- P4 完成（HandoffSummary 型別已確立）

## 驗證
```bash
npx tsc --noEmit
npx jest --runInBand
# Telegram 端：發送 /handoff → 輸出格式不變
grep -rn "lines.push.*Handoff" src/ | wc -l  # 應 = 1（只在 handoff-service.ts）
```
