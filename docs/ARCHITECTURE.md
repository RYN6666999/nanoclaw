# NanoClaw Architecture

> 詳細架構文件。CLAUDE.md 的原則精簡版為主入口，本文件提供完整細節。

---

## 系統架構

```
Telegram (long polling)
    ↓
Telegram Handler
├─ /draw <prompt> → enrichPrompt → generate_image → [IMAGE]
├─ /x <query> → Grok-2 (OpenRouter)
├─ /flash <query> → Gemini 2.5 Flash
├─ /pro <query> → Gemini 3.1 Pro
├─ /codex <query> → GPT-5.3 Codex
├─ /gemini <query> → Gemini 2.0 Flash
├─ [photo] → Gemini Vision (auto-route)
└─ <text> → Model Router → Backend Selection
    ├─ >50KB → Gemini (長文自動路由)
    ├─ RP關鍵字 → Euryale 70B
    └─ default → gemini-2.5-flash-lite
        ↓
    Fallback chain: gemini-flash-lite → glm-5-free → gemini-2.0-flash
        ↓
    Response + Stream (SSE)
```

---

## 目錄結構

```
nanoclaw/
├── CLAUDE.md                 # 精簡原則（IDE 用）
├── AI.md                     # 系統羅盤
├── docs/
│   ├── ARCHITECTURE.md       # 本文件
│   ├── SPEC.md               # ⚠️ 過時（WhatsApp 版本）
│   └── REQUIREMENTS.md       # 設計理念
├── src/
│   ├── index.ts              # 主程式：Telegram 連線、狀態管理
│   ├── telegram.ts           # Telegram 通道 + /draw 指令
│   ├── host-agent.ts         # LLM 呼叫 + Vision + 工具路由
│   ├── model-router.ts       # 前綴/關鍵字 → 模型決策
│   ├── config.ts             # 配置載入 + API 檢查
│   ├── db.ts                 # SQLite 訊息存儲
│   ├── task-scheduler.ts     # 排程任務（暫未用）
│   └── tools/                # 工具實現
│       ├── index.ts
│       ├── generate-image.ts
│       ├── vision.ts
│       ├── web-search.ts
│       ├── obsidian-note.ts
│       ├── qmd-search.ts
│       └── ...
├── groups/
│   └── {name}/CLAUDE.md      # 群組記憶 + 系統指令
└── Obsidian/                 # 外部記憶庫
    └── Nano_Memories/
```

---

## 消息流程

```
1. User 發送 Telegram 訊息
   ↓
2. grammY 接收（long polling）
   ↓
3. Router 檢查：
   ├── 指令前綴 → 路由到對應模型
   ├── 圖片 → Gemini Vision
   └── 文字 → Model Router
   ↓
4. Model Router 決定：
   ├── 前綴匹配 → 指定模型
   ├── 關鍵字 → 專用模型
   └── default → gemini-2.5-flash-lite
   ↓
5. Host Agent 調用 LLM
   ├── 攜帶歷史訊息
   └── 攜帶可用工具
   ↓
6. LLM 處理 + 工具調用
   ↓
7. 流式輸出（SSE）→ Telegram 編輯訊息
```

---

## 指令前綴

| 前綴      | 模型                   | 用途          |
| --------- | ---------------------- | ------------- |
| (預設)    | gemini-2.5-flash-lite  | 日常對話      |
| `/flash`  | gemini-2.5-flash       | 一般 Coding   |
| `/pro`    | gemini-3.1-pro-preview | 複雜推理      |
| `/codex`  | gpt-5.3-codex          | 極致 Coding   |
| `/x`      | grok-2-1212            | 搜尋 + 無審查 |
| `/gemini` | gemini-2.0-flash       | 長文/vision   |
| `/rp`     | euryale-70b            | 深度 RP       |
| `/mini`   | grok-3-mini            | 強制小模型    |
| `/draw`   | FLUX.1-schnell         | 圖片生成      |

---

## 智力梯隊

| Tier | 模型                   | 分數 | 用途                 |
| ---- | ---------------------- | ---- | -------------------- |
| 1    | gemini-2.5-flash-lite  | 58   | 日常對話/翻譯/摘要   |
| 2    | gemini-2.5-flash       | 72   | 一般 Coding/多輪對話 |
| 3    | gemini-3.1-pro-preview | 97   | 複雜推理/長文/多模態 |
| 4    | gpt-5.3-codex          | 94   | 極致 Coding/重構     |

---

## 工具（12 個）

自動觸發（via function calling）：

1. **generate_image** — `/draw` 或要求「畫」時觸發
2. **web_search** — 即時資訊/新聞時觸發
3. **obsidian_note** — 筆記/記憶操作時觸發
4. **bash** — 命令執行時觸發
5. **read_file** — 讀取檔案時觸發
6. **write_file** — 寫入檔案時觸發
7. **edit_file** — 編輯檔案時觸發
8. **list_files** — 目錄列表時觸發
9. **grep** — 內容搜尋時觸發
10. **analyze_image** — 圖片分析（Gemini Vision，自動偵測 photo）
11. **qmd_search** — QMD 知識庫搜尋
12. **tune_local** — 本地模型調教（凍結）

---

## /draw 工作流

```
Input:  /draw 一隻貓咪
        ↓ enrichPrompt (Gemini 翻譯 + 豐富)
Output: 📝 原始: 一隻貓咪
        ✨ 豐富後: A fluffy tabby cat sitting on a windowsill...
        ↓ generate_image (FLUX.1-schnell)
Result: [IMAGE] seed: 12345...
```

**注意**：FLUX.1-schnell 對中文不敏感，需先翻譯。

---

## 流式輸出

- 使用 SSE (Server-Sent Events)
- 實時編輯 Telegram 訊息
- 每個 chunk 立即推送

---

## Vision 自動路由

- 偵測到 Telegram 圖片
- 自動調用 Gemini 2.0 Flash Vision
- 不需要前綴指令

---

## 已知問題

1. **FLUX.1-schnell 對中文不敏感** — enrichPrompt 自動翻譯 + 豐富化
2. **Gemini 429 rate limit** — API quota 控制
3. **conversation history 會讓模型堅持錯誤** — 重啟 bot 清空歷史

---

## 啟動方式

```bash
npx tsx src/index.ts
tail -f /tmp/nanoclaw-live.log
```

---

## 外部記憶庫

真理源：`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/hermes_memories/`

必須同步：

- `SYSTEM_PRINCIPLES.md` — 架構 + 路由決策
- `CHANGELOG.md` — 每日改進記錄
- `COMMANDS.md` — 指令手冊
