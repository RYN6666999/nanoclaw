# NanoClaw - Agent Quick Reference

## Token 原則

只回核心內容。禁止寒暄、重述、解釋、舉例。最短句式 / 關鍵詞 / 編號列表。

## 架構

```
Telegram (long polling) → Model Router → Backend APIs → Response
```

## Commands

| 前綴    | 模型                    | 用途          |
| ------- | ----------------------- | ------------- |
| (無)    | gemini-2.5-flash-lite   | 日常對話      |
| /flash  | gemini-2.5-flash        | 一般 Coding   |
| /pro    | gemini-3.1-pro-preview  | 複雜推理      |
| /codex  | openai/gpt-5.3-codex    | 極致 Coding   |
| /x      | x-ai/grok-2-1212        | 搜尋 + 無審查 |
| /gemini | gemini-2.0-flash        | Vision/長文   |
| /rp     | sao10k/l3.3-euryale-70b | 深度 RP       |
| /mini   | x-ai/grok-3-mini        | 強制 Grok     |
| /draw   | FLUX.1-schnell          | 圖片生成      |

## Tools (12)

1. **generate_image** — /draw 或「畫」時觸發
2. **web_search** — 即時資訊/新聞
3. **obsidian_note** — 筆記/記憶
4. **bash** — 命令執行
5. **read_file** — 檔案讀取
6. **write_file** — 檔案寫入
7. **edit_file** — 檔案編輯
8. **list_files** — 目錄列表
9. **grep** — 內容搜尋
10. **analyze_image** — 圖片分析 (Vision)
11. **qmd_search** — 知識庫搜尋
12. **tune_local** — 本地模型調教 (凍結)

## 關鍵檔案

| 檔案                  | 用途                            |
| --------------------- | ------------------------------- |
| `src/index.ts`        | 主程式：Telegram 連線、訊息路由 |
| `src/host-agent.ts`   | LLM 呼叫 + 工具路由             |
| `src/model-router.ts` | 模型路由決策                    |
| `src/config.ts`       | 設定載入                        |
| `src/telegram.ts`     | Telegram 通道 + /draw           |

## 自動路由邏輯

1. **前綴優先** — `/flash`, `/pro`, `/codex`, `/x`, `/rp`, `/mini`, `/gemini`, `/draw`
2. **長文 (>50KB)** → Gemini (1M context)
3. **RP 關鍵字** → Euryale 70B
4. **預設** → gemini-2.5-flash-lite (赫爾密斯) / grok-3-mini (瑟喵)

## Fallback 鏈

gemini-flash-lite → glm-5-free → gemini-2.0-flash

## System Prompt 注入

`src/host-agent.ts` 的 `getSystemPrompt()` 自動注入：

1. **Identity Block** (最高優先) — 名稱、群組、記憶路徑、工具列表
2. **Group CLAUDE.md** — 群組人設 + 規則
3. **WAKE.md** — 啟動記憶
4. **Current Context** — 工作狀態
5. **Behavior Anchor** — 強制行為規則

## 重要行為規則

- **我是誰**：系統身份已注入 prompt，勿詢問用戶
- **工具使用**：直接呼叫，勿在回覆中描述
- **記憶查詢**：不確定時先用 `qmd_search`
- **完成工作**：呼叫 `obsidian_note` 更新 CURRENT.md

## 啟動命令

```bash
export PATH="/opt/homebrew/bin:$PATH"
npx tsx src/index.ts
tail -f /tmp/nanoclaw-live.log
```

## 記憶庫 (Obsidian)

真理源：`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/Nano_Memories/`

- `WAKE.md` — 啟動文件
- `CURRENT.md` — 工作狀態
- `Conversations/` — 對話日誌 (qmd 索引)
