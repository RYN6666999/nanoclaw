# NanoClaw

## Token 原則
只回核心內容。禁止寒暄、重述、解釋、舉例。最短句式 / 關鍵詞 / 編號列表。

## 互動原則
- **模擬流式輸出**：長任務過程中主動輸出中間進度（例如「正在搜尋…」「找到 3 個檔案，開始修改…」），不要讓用戶乾等無回應。
- **結尾成本報告**：每次任務完成後附上一行摘要：`[消耗: 低/中/高 | 模式: <agent/chat> | 模型: <model-id>]`。若能取得精確 token 數則優先顯示。

## Quick Context

Node.js → Telegram Bot (grammY) → 多 backend 路由 (DeepSeek/Gemini/Local/Claude)。每群組獨立 filesystem + history。Obsidian 為外部記憶。

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | 主程式：Telegram 連線、訊息路由、IPC |
| `src/telegram.ts` | Telegram channel (grammY) |
| `src/host-agent.ts` | 多 backend LLM 呼叫 |
| `src/model-router.ts` | 路由決策：前綴/關鍵字/自動選模型 |
| `src/config.ts` | 設定載入 + 熱載入 |
| `src/db.ts` | SQLite |
| `src/task-scheduler.ts` | 排程任務 |
| `groups/{name}/CLAUDE.md` | 群組記憶 |

## Always-On Skills

每次對話開始時自動載入：
1. `agent-soul` — 精實 PDCA 分級 + 複製成功 + 斷言驗證
2. `superpowers:using-superpowers` — 所有任務先檢查是否有匹配 skill
3. `planning-with-files` — 複雜任務（>5 tool calls）先建 task_plan.md

## Skills

| Skill | 觸發 |
|-------|------|
| `/setup` | 首次安裝、認證 |
| `/customize` | 加 channel、改行為 |
| `/debug` | 容器/日誌/除錯 |
| `/find-skills` | 搜尋可安裝的 skill |

## Obsidian 記憶

路徑：`~/Obsidian/Vault/Nano_Memories/`
- `router-config.json` — 路由設定（熱載入）
- `SYSTEM_PRINCIPLES.md` — 系統原則
- `TOKEN_OPTIMIZATION.md` — Token 規則

## Development

直接跑，不要叫用戶跑。

```bash
npm run dev          # 熱載入開發
npm run build        # 編譯
```
