<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="NanoClaw" width="400">
</p>

<p align="center">
  個人 Telegram AI 助手。極簡架構、雙 backend 路由、圖片生成 + 視覺辨識。
</p>

## 為什麼是 NanoClaw

專為單一用戶設計的精簡 AI 助手。相比複雜框架：

- **可讀** — 3997 行程式碼（清理後 -28%），8 分鐘內理解全貌
- **安全隔離** — Telegram 直連，代理模型選擇（DeepSeek/Grok/Gemini）
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
- **雙 backend 路由** — DeepSeek V3（預設）+ Grok 4.1 Fast（`/x` 無審查）
- **圖片生成** — `/draw` 支援中文，自動翻譯 + DeepSeek 豐富化，FLUX.1-schnell 高質量
- **視覺辨識** — Telegram 圖片 → Gemini 2.0 Flash 自動分析
- **智能搜尋** — web_search 三源融合（Grok + Brave + DuckDuckGo）+ 交叉驗證 + 置信度徽章（✅⚡📌）+ 搜尋連結
- **10 工具** — bash, file ops, web_search, obsidian, grep, image gen, tune_local
- **Fallback 鏈** — deepseek → openrouter → gemini → local
- **流式輸出** — SSE streaming 實時編輯 Telegram 訊息

## 架構

```
Telegram (grammY) → Model Router → Backend APIs → Response
├─ DeepSeek V3 (api.deepseek.com)
├─ Grok 4.1 Fast (OpenRouter, /x prefix)
├─ Gemini 2.0 Flash (Vision only)
└─ Ollama Local (fallback)
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
一般問題 (DeepSeek V3)
/x 敏感問題 (Grok，無審查)
/draw 一隻貓咪 (中文自動轉英文 + 豐富)
/gemini 長文檔分析
發圖片 (自動 Vision)
```

### 指令前綴
- **預設** — DeepSeek V3
- `/x` — Grok 4.1 Fast (無審查 + X 搜尋)
- `/gemini` — Gemini 2.0 Flash (長文/vision)
- `/deepseek` — 強制 DeepSeek
- `/local` — Llama 3.2 3B (本地離線)
- `/draw` — 直接生圖（中文 → 英文 + 豐富）

### /draw 工作流
```
用戶: /draw 一隻坐在窗邊的可愛貓咪
     ↓ enrichPrompt (DeepSeek 翻譯 + 豐富)
系統: 📝 原始: 一隻坐在窗邊的可愛貓咪
     ✨ 豐富後: A fluffy tabby cat sitting gracefully on a sunlit windowsill...
     ↓ generate_image
Bot:  [IMAGE] 生成完成 (Draw Things 本地 / HF FLUX.1-schnell)
```

## 設定

環境變數（.env）：
```bash
TELEGRAM_BOT_TOKEN=<from BotFather>
DEEPSEEK_API_KEY=<from deepseek.com>
OPENROUTER_API_KEY=<from openrouter.io>
GEMINI_API_KEY=<from Google Cloud>
HF_TOKEN=<from huggingface.co>
```

## 常見問題

**Q: 為什麼是 Telegram 而不是 WhatsApp？**
A: 個人喜好。Fork 後改就行。

**Q: 如何新增功能？**
A: 直接改 src/ 裡的程式碼。小到可以安全修改。

**Q: 如何除錯？**
A: 監聽日誌：`tail -f /tmp/nanoclaw-live.log | grep -i "<keyword>"`

**Q: 支援 Windows 嗎？**
A: WSL2 + Docker 應該行。未測試。

## 主要改進（2026-02-10）

### Gemini Vision
- system instruction 改用正確 API 字段
- 圖片優先級調整（提升辨識品質）
- 詳細視覺提示詞

### /draw 豐富化
- 中文 → 英文自動翻譯
- DeepSeek 提示詞豐富（風格/構圖/光線）
- 顯示原始 + 最終提示詞
- FLUX.1-schnell 敏感度提升

### 架構清理
- 程式碼 5539 → 3997 行 (-28%)
- 刪除 WhatsApp/容器/mount 死碼
- 雙 backend 凍結其餘

## 文件

- `CLAUDE.md` — NanoClaw 系統指令 (Token 原則、互動規則、架構)
- `groups/main/CLAUDE.md` — 群組記憶 + 系統指令
- `Obsidian/Nano_Memories/` — 外部記憶庫 (CHANGELOG/SYSTEM_PRINCIPLES/COMMANDS)

## License

MIT
