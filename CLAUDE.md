# NanoClaw

## Token 原則
只回核心內容。禁止寒暄、重述、解釋、舉例。最短句式 / 關鍵詞 / 編號列表。

## 自動觸發 plan-to-work 技能

**遇到以下情況，不等用戶提醒，主動調用 `/plan-to-work` skill：**

| 條件 | 典型範例 |
|------|----------|
| 修改 2+ 個檔案 | "實作 X 功能" |
| 需先研究才能選方案 | "用哪個模型/API 比較好" |
| 收到 todo 清單 / 缺口分析 | 用戶列出 3+ 項待辦 |
| 用戶直接說「實作」但沒有設計討論 | 裸 "實作" 指令 |
| 架構決策（A vs B） | "要不要加 SQL？" |
| 有依賴順序的多階段任務 | 步驟 1 完成才能做步驟 2 |

**捷徑判斷**：任務完成後我需要更新 CHANGELOG 嗎？→ 是 → 先 plan-to-work。

> 例外：純 bug fix（已知根因，改動 < 1 個檔案）、純資訊回答、純閱讀分析，不需要。

## 互動原則
- **模擬流式輸出**：長任務過程中主動輸出中間進度（例如「正在搜尋…」「找到 3 個檔案，開始修改…」），不要讓用戶乾等無回應。
- **結尾成本報告**：每次任務完成後附上一行摘要：`[消耗: 低/中/高 | 模式: <agent/chat> | 模型: <model-id>]`。若能取得精確 token 數則優先顯示。

## Quick Context

Telegram Bot (grammY) → 雙 backend 路由 (DeepSeek V3 主 / Grok 4.1 Fast 無審查)。
圖片生成：中文 → 英文自動翻譯 + DeepSeek 豐富化 → FLUX.1-schnell
圖片辨識：TG photo → Gemini 2.0 Flash Vision
Obsidian 為外部永久記憶庫。

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | 主程式：Telegram 連線、訊息路由、狀態管理 |
| `src/telegram.ts` | Telegram channel (grammY) + /draw 指令 |
| `src/host-agent.ts` | 多 backend LLM 呼叫 + Vision + 工具路由 |
| `src/model-router.ts` | 路由決策：前綴/關鍵字/自動選模型 |
| `src/config.ts` | 設定載入 + API key 檢查 + 熱載入 |
| `src/db.ts` | SQLite 訊息存儲 |
| `src/task-scheduler.ts` | 排程任務（暫未用） |
| `groups/{name}/CLAUDE.md` | 群組記憶 + 系統指令 |
| `Obsidian/AI-work/Nano_Memories/` | 外部記憶庫（真理源） |

## 系統架構

```
Telegram (long polling)
    ↓
Telegram Handler
├─ /draw <prompt> → enrichPrompt (DeepSeek) → generate_image → [IMAGE]
├─ /x <query> → Grok (OpenRouter)
├─ /gemini <query> → Gemini 2.0 Flash
├─ [photo] → Gemini Vision (auto-route)
└─ <text> → Model Router → Backend Selection
    ├─ search_kw → DeepSeek
    ├─ >50KB → Gemini
    ├─ complex_kw → DeepSeek
    └─ default → DeepSeek
                ↓
            Fallback chain: deepseek → openrouter → gemini → local
                ↓
            Response + Stream (SSE)
```

## Available Backends

| Backend | Model | 用途 | 狀態 |
|---------|-------|------|------|
| DeepSeek | deepseek-chat | 預設一切 | ✅ 啟用 |
| OpenRouter | grok-4.1-fast | `/x` 無審查 | ✅ 啟用 |
| Gemini | gemini-2.0-flash | Vision/長文 | ✅ 啟用 |
| Local | llama-3.2-3b | 離線備用 | ❌ 已凍結 |

## Tools (10)

自動觸發（via function calling）：
1. **generate_image** — `/draw` 或要求「畫」時觸發
2. **web_search** — 即時資訊/新聞時觸發
3. **obsidian_note** — 筆記/記憶操作時觸發
4. **bash** — 命令執行時觸發
5. **read_file / write_file / edit_file** — 檔案操作時觸發
6. **list_files** — 目錄列表時觸發
7. **grep** — 內容搜尋時觸發
8. **tune_local** — 本地模型調教（凍結）
9. **vision** — 圖片分析（自動偵測 photo message）

## Commands

### Prefix Routes
- (預設) → DeepSeek V3
- `/x` → Grok 4.1 Fast (no filter + X search)
- `/gemini` → Gemini 2.0 Flash (長文/vision)
- `/deepseek` → 強制 DeepSeek
- `/local` → Llama 3.2 3B (offline)
- `/draw` → 直接生圖（中文自動轉英文 + 豐富）

### /draw Workflow
```
Input:  /draw 一隻貓咪
        ↓ enrichPrompt (DeepSeek)
Output: 📝 原始: 一隻貓咪
        ✨ 豐富後: A fluffy tabby cat...
        ↓ generate_image (Draw Things or HF FLUX.1-schnell)
Result: [IMAGE] seed: 12345...
```

## Known Issues & Workarounds

- **DeepSeek 不主動 call generate_image** — 改用 `/draw` 前綴指令
- **FLUX.1-schnell 對中文不敏感** — enrichPrompt 自動翻譯 + 豐富化
- **Gemini 429 rate limit** — API quota 控制，後續會復原
- **OpenRouter 405** — deepseek/grok 已加入 NO_TOOLS_MODELS 清單
- **conversation history 會讓模型堅持錯誤** — 重啟 bot 清空歷史

## Obsidian 記憶

**真理源**：`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/Nano_Memories/`

必須同步檔案：
- `SYSTEM_PRINCIPLES.md` — 架構 + 路由決策 + 工具配置
- `CHANGELOG.md` — 每日改進記錄
- `COMMANDS.md` — 指令手冊 + skills 清單

**同步規則**
1. 代碼改動 → 立即更新 Obsidian
2. 每次對話結束 → 驗證 Obsidian 同步狀態
3. CHANGELOG 滾動覆蓋（只保留最新 + 上一次）

## Development

直接跑，不要叫用戶跑。

```bash
export PATH="/opt/homebrew/bin:$PATH"
npx tsx src/index.ts          # 直接啟動（自動編譯）
tail -f /tmp/nanoclaw-live.log # 監聽日誌
```

## 最近改進 (2026-02-10)

- Gemini Vision: system instruction 改用 API 正確字段
- /draw: 中文 → 英文翻譯 + DeepSeek 豐富化 + 顯示最終提示詞
- 程式碼清理：5539 → 3997 行 (-28%)
