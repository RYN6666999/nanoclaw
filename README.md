# NanoClaw

<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="NanoClaw" width="400">
</p>

<p align="center">
  個人 Telegram AI 助手。v2.0 四層 Gemini 智力梯隊、圖片生成 + 視覺辨識。
</p>

## 為什麼是 NanoClaw

專為單一用戶設計的精簡 AI 助手。相比複雜框架：

- **可讀** — 3997 行程式碼（清理後 -28%），8 分鐘內理解全貌
- **安全隔離** — Telegram 直連，代理模型選擇（Gemini/Grok/Euryale）
- **無配置** — 直接改 code，不要亂七八糟的 .env 堆積
- **AI 原生** — 不裝 GUI，直接問 Claude 實況狀態

## 快速開始

```bash
git clone https://github.com/gavrielc/nanoclaw.git
cd nanoclaw
export PATH="/opt/homebrew/bin:$PATH"
npx tsx src/index.ts
```

然後在 Telegram 發訊息到 `@ryanplus_bot`。

## 功能

- **Telegram I/O** — grammY 長輪詢，穩定接收訊息
- **v2.0 四層智力梯隊** — gemini-2.5-flash-lite (預設) / flash / pro / codex
- **圖片生成** — `/draw` 支援中文，自動翻譯 + Gemini 豐富化，FLUX.1-schnell 高質量
- **視覺辨識** — Telegram 圖片 → Gemini 2.0 Flash 自動分析
- **智能搜尋** — web_search 三源融合（Brave + DuckDuckGo）+ 交叉驗證
- **12 工具** — bash, file ops, web_search, obsidian, grep, image gen, vision, qmd_search
- **Fallback 鏈** — gemini-flash-lite → glm-5-free → gemini-2.0-flash
- **流式輸出** — SSE streaming 實時編輯 Telegram 訊息

## 架構

```
Telegram (grammY) → Model Router → Backend APIs → Response
├─ Gemini 2.5 Flash Lite (赫爾密斯預設, Tier 1)
├─ Gemini 2.5 Flash (/flash, Tier 2)
├─ Gemini 3.1 Pro (/pro, Tier 3)
├─ GPT-5.3 Codex (/codex, Tier 4)
├─ Grok-3-Mini (瑟喵預設)
├─ Grok-2-1212 (/x, 無審查)
├─ Euryale 70B (/rp, 深度RP)
└─ Gemini 2.0 Flash (Vision/長文)
```

**關鍵檔案**
| File | 用途 |
|------|------|
| `src/index.ts` | 主程式：Telegram 連線、狀態管理 |
| `src/telegram.ts` | Telegram 通道 + `/draw` 指令 |
| `src/host-agent.ts` | LLM 呼叫 + Vision + 工具路由 |
| `src/model-router.ts` | 前綴/關鍵字 → 模型決策 |
| `src/config.ts` | 配置載入 + API 檢查 |
| `src/db.ts` | SQLite 訊息存儲 |
| `groups/{name}/CLAUDE.md` | 群組記憶 + 系統指令 |

## 使用

### 基本指令

```
一般問題 (gemini-2.5-flash-lite)
/flash 一般Coding
/pro 複雜問題
/codex 極致Coding
/x 敏感問題 (Grok，無審查)
/rp 深度RP
/draw 一隻貓咪 (中文自動轉英文 + 豐富)
/gemini 長文檔分析
發圖片 (自動 Vision)
```

### 指令前綴

- **預設** — gemini-2.5-flash-lite (Tier 1)
- `/flash` — Gemini 2.5 Flash (Tier 2)
- `/pro` — Gemini 3.1 Pro (Tier 3)
- `/codex` — GPT-5.3 Codex (Tier 4)
- `/x` — Grok-2 (無審查 + X 搜尋)
- `/gemini` — Gemini 2.0 Flash (長文/vision)
- `/rp` — Euryale 70B (深度RP)
- `/mini` — Grok-3-Mini (強制)
- `/draw` — 直接生圖（中文 → 英文 + 豐富）

### /draw 工作流

```
用戶: /draw 一隻坐在窗邊的可愛貓咪
     ↓ enrichPrompt (Gemini 翻譯 + 豐富)
系統: 📝 原始: 一隻坐在窗邊的可愛貓咪
     ✨ 豐富後: A fluffy tabby cat sitting gracefully on a sunlit windowsill...
     ↓ generate_image
Bot:  [IMAGE] 生成完成 (Draw Things 本地 / HF FLUX.1-schnell)
```

## 設定

環境變數（.env）：

```bash
TELEGRAM_BOT_TOKEN=<from BotFather>
GEMINI_API_KEY=<from Google Cloud>
OPENROUTER_API_KEY=<from openrouter.io>
HF_TOKEN=<from huggingface.co>
```

自動交接與自動 commit（選用）:

- `AUTO_COMMIT_ENABLED`：設為 `true` 可允許系統在偵測到里程碑時自動執行 `git commit`（預設 `false`）。建議先使用 dry-run 測試：

```bash
npx tsx scripts/auto-commit-sim.ts
```

要實際套用 commit：

```bash
export AUTO_COMMIT_ENABLED=true
npx tsx scripts/auto-commit-sim.ts --apply
```

此功能會在 `logs/handoff_suggestions.json` 儲存 handoff 建議，summary 會包含 `changedFilesList`（由 `git status --porcelain` 取得，若可用）。


## 常見問題

**Q: 為什麼是 Telegram 而不是 WhatsApp？**
A: 個人喜好。Fork 後改就行。

**Q: 如何新增功能？**
A: 直接改 src/ 裡的程式碼。小到可以安全修改。

**Q: 如何除錯？**
A: 監聽日誌：`tail -f /tmp/nanoclaw-live.log | grep -i "<keyword>"`

**Q: 支援 Windows 嗎？**
A: WSL2 + Docker 應該行。未測試。

## v2.0 更新（2026-02-22）

### 四層智力梯隊

- Tier 1: gemini-2.5-flash-lite (58分) — 日常對話
- Tier 2: gemini-2.5-flash (72分) — 一般 Coding
- Tier 3: gemini-3.1-pro-preview (97分) — 複雜推理
- Tier 4: openai/gpt-5.3-codex (94分) — 極致 Coding

### 工具擴展

- 新增 `analyze_image` (Vision)
- 新增 `qmd_search` (知識庫搜尋)

## 文件

- `CLAUDE.md` — NanoClaw 系統指令 (Token 原則、互動規則、架構)
- `groups/main/CLAUDE.md` — 群組記憶 + 系統指令
- `Obsidian/AI-work/Nano_Memories/` — 外部記憶庫 (CHANGELOG/SYSTEM_PRINCIPLES/COMMANDS)

## License

MIT
