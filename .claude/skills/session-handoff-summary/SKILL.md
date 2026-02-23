---
name: session-handoff-summary
description: |
  當對話額度即將用完或用戶開啟新窗口時，自動總結當前進度、提取關鍵決策、生成下一個視窗的系統提示詞。
  自動保存交接記錄到 Obsidian，讓 AI 甦醒時不會茫然無知。
  觸發詞：「開新對話」「新視窗」「下一個視窗」「保存進度」「交接」
---

# 對話交接總結 (Session Handoff Summary)

## 概述

當 Claude 對話中途中斷（token 用完、手動切換新視窗）時，此 Skill 自動：

1. **總結核心方向** — 當前任務的 2-3 個關鍵方向
2. **提取進度日誌** — 已完成項目 + 待辦事項
3. **記錄重要決策** — 架構決策、選型理由、已排除方案
4. **生成交接提示詞** — 可直接複製到新對話開頭
5. **保存到 Obsidian** — HANDOFF-YYYYMMDD-HHMM.md

**輸出結構：**
```
🎯 核心方向（3 條）
✅ 已完成（日期 + 簡述）
📋 待辦（優先度排序）
⚙️ 決策記錄（決定 + 理由）
📌 下一個視窗提示詞（可直接複製）
```

---

## 應用場景

### 場景 A：對話視窗切換（傳統用法）
```
[對話窗 1] 規劃 + 實現
  → token 用完
  ↓
session-handoff-summary 生成摘要
  ↓
[對話窗 2] 讀取摘要 → 無縫繼續
```

### 場景 B：LLM 決策大腦 ↔ 本地執行 Agent（新增用法）
```
[雲端 LLM] Claude / GPT
  ├─ 分析需求
  ├─ 做架構決策
  └─ 規劃執行步驟
       ↓
  生成交接摘要（含決策 + 步驟 + 參數）
       ↓
[本地 Agent] NanoClaw Container
  ├─ 讀取摘要（決策 + 步驟）
  ├─ 執行任務（代碼編修、CLI 操作等）
  └─ 記錄執行結果 + 遇到的問題
       ↓
  總結結果交接給 LLM
       ↓
[雲端 LLM] 
  ├─ 讀取執行結果
  ├─ 判斷成功 / 失敗
  └─ 決定下一步（修正 / 繼續 / 新任務）
```

**優勢：**
- 🧠 LLM 專注決策 & 規劃（token 高效）
- 🤖 Agent 專注執行 & 記錄（資源高效）
- 📌 交接記錄完整（Obsidian 永久保存）
- 🔄 決策與執行解耦（可並行、可分佈式）

---

## 自動觸發條件

以下任何情況都會自動啟動此 Skill：

### 場景 A：對話視窗切換 & 存檔

| 觸發詞 | 別名 | 場景 |
|-------|------|------|
| 「開新對話」 | 開新、新對話、開新視窗 | 用戶主動切窗（場景 A） |
| 「新窗」 | 新視窗、下一個視窗、切換 | 用戶主動切窗（場景 A） |
| 「保存進度」 | 存檔、Save、存盤、存磁盤 | 用戶要求存檔 |
| 「備份」 | 備份狀態、State Backup | 用戶要求備份當前狀態 |
| 「交接」 | 交接進度、Handoff | 用戶要求交接 |
| 「復盤」 | 回顧、Review、複盤、檢討 | 用戶要求總結當前進度 |
| 「總結」 | 摘要、Summary、縮小 | 用戶要求簡化並保存 |
| token 即將用完 | 額度快沒了、Token 沒多少、即將超限 | 系統自動檢測（剩餘 < 20%） |

### 場景 B：LLM-Agent 協作 & 決策執行

| 觸發詞 | 別名 | 場景 |
|-------|------|------|
| 「Agent 準備執行」 | Agent 開始、執行、Run Agent | LLM 要求 Agent 開始工作 |
| 「Agent 執行完成」 | 完成、Done、執行結束 | Agent 回報結果（場景 B） |
| 「協作」 | 同步、Sync、配合 | LLM-Agent 同步交接（場景 B） |
| 「加載進度」 | Load、載入、讀取狀態 | 用戶要求讀取上次保存的狀態 |
| 「恢復」 | Recover、Resume、接續 | 用戶要求從上次中斷點繼續 |
| 「比對」 | 對比、Diff、檢查變化 | 比較預期 vs 實際執行結果 |

### 系統自動觸發

| 條件 | 說明 |
|------|------|
| token 即將用完（< 20%） | 自動生成交接摘要，避免信息丟失 |
| 檢測到 LLM ↔ Agent 轉換 | 自動記錄決策 + 執行結果 |

---

## 工作流程

### 場景 A：對話視窗切換

#### Phase 1: 分析當前對話（自動）

```
從對話歷史中提取：
├─ 主題 & 目標
│  └─ 理解用戶最初的需求是什麼
│
├─ 已完成項目
│  └─ 列舉已做好的東西（日期精確到分鐘）
│
├─ 待辦項目
│  └─ 按優先度排序（HIGH/MID/LOW）
│
├─ 技術決策
│  └─ 為什麼選這個方案，排除了什麼
│
└─ 風險 & 注意事項
   └─ 下一個視窗要特別留意的事
```

#### Phase 2-4（同下）

---

### 場景 B：LLM 決策大腦 ↔ Agent 執行協作

#### Phase 1: LLM 做決策 & 規劃

```
LLM 分析：
├─ 解析用戶需求
├─ 做架構決策（A vs B 方案）
├─ 規劃執行步驟（Step 1, 2, 3...）
├─ 預估資源 & 風險
└─ 準備傳給 Agent 的命令
```

#### Phase 2: 生成 Agent 交接摘要

```
結構化交接（給本地 Agent）：
├─ 目標（Agent 要達成什麼）
├─ 決策背景（為什麼這樣做）
├─ 執行步驟（具體命令 + 參數）
├─ 成功標準（如何判定成功）
├─ 失敗回滾（萬一失敗要怎辦）
└─ 約束條件（時間、資源、權限限制）
```

#### Phase 3: Agent 執行並記錄

```
本地 Agent：
├─ 讀取交接摘要（理解決策）
├─ 執行命令 / 運行代碼
├─ 記錄每步的結果（成功 / 失敗 + 原因）
├─ 截圖 + 日誌（重要中間狀態）
└─ 生成執行結果交接摘要
```

#### Phase 4: 結果交接給 LLM

```
Agent 交接摘要（給 LLM）：
├─ 執行狀態（Success / Partial / Failed）
├─ 實際結果（vs 預期）
├─ 遇到的問題（Error message + context）
├─ 自動修復嘗試（如果有）
└─ 建議下一步（等待 LLM 決策）
```

#### Phase 5: LLM 繼續決策

```
LLM 收到結果：
├─ 判斷成功 / 失敗
├─ 分析偏差（實際 vs 預期）
├─ 決定下一步（修正 / 重試 / 新任務）
└─ 迴圈到 Phase 1（或結束）
```

### Phase 3: 保存到 Obsidian（自動）

**檔案位置：** `/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/_GUIDE/HANDOFF-YYYYMMDD-HHMM.md`

**場景 A（視窗切換）檔案格式：**
```markdown
# 對話交接 — [日期時間]

## 🎯 核心方向
- [方向 1]
- [方向 2]
- [方向 3]

## ✅ 已完成
- [時間] - [做了什麼]
- [時間] - [做了什麼]

## 📋 待辦
- [ ] [優先度] - [任務]
- [ ] [優先度] - [任務]

## ⚙️ 技術決策
- **決策**：[決定什麼]
  **理由**：[為什麼]
  **排除方案**：[考慮過但沒用的]

## 📌 下一個視窗提示詞
[生成的提示詞文本]

---
原對話於 YYYY-MM-DD HH:MM 中斷
```

**場景 B（LLM-Agent 協作）檔案格式：**
```markdown
# LLM-Agent 交接記錄 — [日期時間]

## 🧠 LLM 決策
**目標**：[Agent 要實現什麼]
**決策**：[選了哪個方案 + 為什麼]
**步驟**：
  1. [Step 1 描述]
  2. [Step 2 描述]
  3. [Step 3 描述]

## 🤖 Agent 執行結果
**狀態**：✅ Success / ⚠️ Partial / ❌ Failed
**結果摘要**：[實際產出什麼]
**問題記錄**：[遇到了什麼問題]
**耗時**：[多少秒]

## 📊 偏差分析
- 預期：[LLM 預期的結果]
- 實際：[Agent 實際產出]
- 原因：[為什麼有差異]

## 🔄 下一步
[LLM 推薦的後續行動]

---
決策於 YYYY-MM-DD HH:MM by LLM
執行於 YYYY-MM-DD HH:MM by Agent
```

### Phase 4: 返回給用戶（自動）

**場景 A 返回：**
```
✅ 交接完成！

【複製下面提示詞到新對話】
─────────────────────────────
[生成的提示詞]
─────────────────────────────

📄 詳細交接記錄已保存：
   /Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/_GUIDE/HANDOFF-20260223-1430.md
```

**場景 B 返回：**
```
✅ Agent 交接完成！

【決策結果】
✅ Success / ⚠️ Partial / ❌ Failed

【執行產出】
[Agent 的結果摘要]

【Obsidian 記錄】
/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/_GUIDE/HANDOFF-20260223-1430.md

【等待 LLM 決策下一步...】
```

## 📌 下一個視窗提示詞
[生成的提示詞文本]

---
原對話於 YYYY-MM-DD HH:MM 中斷
```

### Phase 4: 返回給用戶（自動）

在當前對話中顯示：
```
✅ 交接完成！

【複製下面提示詞到新對話】
─────────────────────────────
[生成的提示詞]
─────────────────────────────

📄 詳細交接記錄已保存：
   /Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/_GUIDE/HANDOFF-20260223-1430.md
```

### Phase 5: 自動判斷 Git 提交（自動）

當交接完成時，自動分析是否達到「里程碑」，決定是否上傳 Git。

**判斷條件：**

| 優先度 | 條件 | 應該提交？ | Commit Message |
|-------|------|----------|----------------|
| 🔴 高 | 新功能完成（Milestone） | ✅ 必須提交 | `feat: [新功能名]` |
| 🔴 高 | 重大 Bug 修復 | ✅ 必須提交 | `fix: [本質修復]` |
| 🟡 中 | 架構決策完成 + 代碼改動 | ✅ 建議提交 | `refactor: [決策內容]` |
| 🟡 中 | 已完成 3+ 項待辦 | ⚠️ 視情況 | `feat: [進度檢查點]` |
| 🟢 低 | 只有對話記錄 / 筆記更新 | ❌ 不提交 | 保存到 Obsidian 即可 |
| 🟢 低 | 進度 < 30% | ❌ 不提交 | 等待里程碑 |

**自動檢測邏輯：**

```
分析交接摘要：
├─ 統計：新增/修改/刪除文件數量
├─ 檢測：是否有新功能標記（feat:, fix:, refactor:）
├─ 評估：進度 % 與預期的里程碑對齐度
├─ 判斷：是否達到「值得存檔」的閾值
└─ 決策：提交或跳過
```

**提交內容：**

✅ **應該提交的文件**
- `src/` — 核心代碼改動
- `.claude/skills/` — Skill 新增/更新
- `docs/ARCHITECTURE.md` — 架構文檔更新
- `CHANGELOG.md` — 存檔進度里程碑

❌ **不應該提交的文件**
- `Obsidian/Nano_Memories/` — 這是交接記錄，不上 Git
- `logs/` — 日誌文件
- `dist/`, `build/` — 編譯產物

**自動提交時機：**

```
交接完成
  ↓
判斷是否達到里程碑
  ├─ 是 → 提交 Git
  │       ├─ 生成 Commit Message
  │       ├─ 提交代碼
  │       └─ 返回確認訊息
  │
  └─ 否 → 跳過
          └─ 提示：「進度 60%，下次里程碑時提交」
```

**返回訊息示例：**

```
✅ 里程碑檢查通過！

【提交 Git】
Commit: feat: memory compression system with auto-distillation
Files: 3 changed, 240 insertions(+), 120 deletions(-)
Hash: ab1c2d3e4f5g6h7i

【下次里程碑】
進度：60% → 80%
預計：~3 小時後

【交接記錄】
/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/_GUIDE/HANDOFF-20260223-1430.md
```

---

## 提示詞生成邏輯

生成的提示詞會包含以下結構：

```markdown
# 對話上文（Session Handoff）

## 背景
[當前項目名稱 + 核心目標]

## 進度
- 已完成：[% 完成度]
- 耗時：[分鐘數]
- 時間戳：[YYYY-MM-DD HH:MM]

## 已完成項目
[具體清單]

## 待辦項目（優先度順序）
[具體清單]

## 當前狀態
[重要變數、配置、決策]

## 限制 & 注意事項
[下一個視窗必須知道的坑]

## AI 角色 & 指示
[繼承當前 AI 的設定]

---

接下來請：
1. 讀取上述信息
2. 確認理解
3. 從 [下一步] 開始執行
```

---

## 用戶手冊

### 主動觸發
```
用戶：「我要開新對話，幫我保存進度」
AI ✨ → 自動生成交接摘要 + 提示詞
```

### 新對話開頭
```
用戶：[粘貼交接提示詞]
AI ✨ → 讀取、理解、確認進度
用戶：「接著做...」
AI ✨ → 繼續工作（無縫銜接）
```

### 檢查交接記錄
```bash
# 查看最近的交接記錄
ls -lt "/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/_GUIDE/HANDOFF-"*.md | head -5

# 查看特定交接
cat "/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/_GUIDE/HANDOFF-20260223-1430.md"
```

---

## 實現詳情

### 核心邏輯

1. **識別觸發詞**
   - 監聽用戶輸入（見觸發條件表）
   - 或系統檢測 token 即將用完

2. **上下文分析**
   - 遍歷當前對話歷史
   - 使用 NLP 提取：任務、決策、進度、風險

3. **提示詞生成**
   - 模板化輸出（見上方結構）
   - 確保 token 量精簡（< 500 tokens）

4. **Obsidian 寫入**
   - 目錄自動創建（如果不存在）
   - 檔案名格式：`HANDOFF-YYYYMMDD-HHMM.md`
   - 自動去重（同分鐘內只保存一次）

5. **用戶返回**
   - 顯示生成的提示詞
   - 提供 Obsidian 檔案位置
   - 可選：自動複製到剪貼板

### 配置項

```json
{
  "handoff_max_tokens": 500,           // 提示詞最大 token 數
  "token_threshold_percent": 20,       // token 閾值（%）
  "obsidian_dir": "/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/_GUIDE",
  "include_code_snippets": false,      // 是否包含程式碼片段
  "auto_prompt_copy": true             // 自動複製提示詞到剪貼板
}
```

---

## 限制 & 注意事項

⚠️ **已知限制**

- 如果對話歷史 > 100KB，只取最後 50 條消息
- 代碼片段默認不包含（可配置）
- Obsidian 路徑硬寫（需用戶確認）

✅ **最佳實踐**

1. 每 90 分鐘開啟一次新對話（避免 token 用完）
2. 新對話頂部貼上交接提示詞（確保無縫接續）
3. 定期檢查 Obsidian 交接記錄

---

## 失敗排查

| 問題 | 解決方案 |
|------|--------|
| Obsidian 檔案寫入失敗 | 檢查 `/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/_GUIDE` 是否存在 + 可寫 |
| 提示詞生成為空 | 檢查對話歷史是否正常（看 Recent Tasks） |
| Token 檢測不準確 | 手動觸發：說「保存進度」 |

---

## 下一步

1. 用戶說「開新對話」時自動啟動
2. 生成交接摘要 + 提示詞
3. 保存到 Obsidian
4. **同步更新 `update_present`**（見下方規則）
5. 返回可複製的提示詞
6. 用戶新窗口粘上提示詞 → 無縫繼續

🎯 目標達成：**AI 甦醒時不再茫然無知**

---

## update_present 同步規則

**每次** session-handoff-summary 觸發時，必須同步覆寫以下檔案：

```
/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/_GUIDE/update_present/NANOCLAW_STATUS.md
```

### 流程
1. 用 `date '+%Y-%m-%d %H:%M'` 取得**實際時間**（禁止從檔名或記憶推斷）
2. 採集指標：tsc errors / jest results / `any` count / git commit
3. 覆寫 `NANOCLAW_STATUS.md`（不累積，永遠只保最新）

### 模板
```markdown
# NanoClaw 最新狀態
> 自動更新於 {date 指令輸出}

## 指標
| 項目 | 數值 |
|------|------|
| tsc errors | {npx tsc --noEmit 結果} |
| jest suites | N/N |
| jest tests | N/N |
| any 殘留 | {grep 結果} |
| git commit | {git log --oneline -1} |
| git branch | {git branch --show-current} |

## 當前階段
{簡述}

## 待辦
- [ ] ...

## 最近完成
- [x] ...
```

### 注意
- 路徑含空格，shell 指令須引號包裹
- 此檔經 iCloud 同步到所有裝置
- 規則詳見 `update_present/README.md`
