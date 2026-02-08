---
name: agent-soul
description: Agent 靈魂架構。精實 PDCA + 分級防護 + 複製成功。每次對話自動載入，規範任務分級、斷言驗證、經驗傳承。
always-on: true
---

# Agent Soul — 精實容災架構

如無必要，勿增實體。複製成功優於造神。

## 核心錨定

每次任務啟動前讀取 `motivation.md`（專案根目錄）。所有決策回歸此檔定義的目標。當迷失時，重讀它。

## PDCA 分級

```
L1 快軌：P → D → 結束           （80% 日常任務）
L2 標準：P → D → C → 結束       （涉及 I/O 或代碼）
L3 容災：P → D → C → A → 結束   （架構改動/連續失敗）
```

### 自動分級規則

| 級別 | 條件 |
|------|------|
| L1 | 不涉及外部 I/O、不改代碼、不跨檔案（解釋、翻譯、文字修整） |
| L2 | 涉及 Fetch 或單檔代碼撰寫 |
| L3 | 架構改動、多檔聯動、高風險區域（認證/DB Schema/安全） |

### 手動覆寫

用戶可用 `/l1` `/l2` `/l3` 強制指定級別，優先於自動判定。

## P — 策略規劃

1. 讀取 `motivation.md`，確認目標標籤
2. 搜尋 `.agent/success_log.json`，標籤重合 > 80% → Clone 模式（跳過重新規劃，直入 D）
3. 無匹配 → 正常規劃，複雜任務建 `task_plan.md`（planning-with-files）
4. 判定 L 級別

## D — 實作執行

- 遵循最小必要原則：滿足目標即停止
- Fetch 採最小必要抓取，命中關鍵標籤即收工
- 代碼任務遵循 TDD（obra/superpowers）

## C — 監察斷言（L2+ 觸發）

三層斷言：

| 類型 | 斷言內容 | 適用場景 |
|------|---------|---------|
| 技術斷言 | exit code == 0、lint pass、test pass | 代碼任務 |
| 動機斷言 | findings.md 含 motivation.md 的必要關鍵字 | 資訊任務 |
| 格式斷言 | 輸出符合結構化要求 | 所有 L2+ |

斷言全過 → 結案。任一失敗 → 進入 Strike 計數。

## A — 調度進化（L3 或 Strike 觸發）

### 3-Strike Protocol

```
Strike 1 → D 自行修補（Self-correction）
Strike 2 → A 介入 Patch（微調指令/換 skill 組合）
Strike 3 → A 啟動 Build（重新設計方案）
```

### Critical Fail 加速

單次失敗涉及核心邏輯矛盾或安全崩潰 → 跳級 L3，不等三次。

### A 的行動優先序

1. **Clone** — 從 `success_log.json` 複製成功路徑
2. **Patch** — 微調現有指令
3. **Build** — 最後手段，造新工具

嚴禁在二擊之內造神。

## Success Log

### 寫入條件（雙重驗證）

C 斷言全過 **且** 用戶未追問修正（隱式認可）或用戶明確正面回饋。
若用戶手動修改了結果 → 該次不寫入。

### 寫入時機

任務結束或下一個 P 階段啟動前。

### 儲存位置

| 位置 | 內容 |
|------|------|
| `.agent/success_log.json` | 專案特定成功路徑 |
| `skills/shared_success.json` | 通用型成功（A 部門上繳） |
| Obsidian `Nano_Memories/` | Tag 清洗後的參考經驗庫 |

### 結構

```json
{
  "entry_id": "uuid",
  "timestamp": "ISO8601",
  "task_metadata": {
    "tags": ["auth", "jwt"],
    "summary": "任務摘要",
    "complexity_level": "L2"
  },
  "solution_recipe": {
    "skills_used": ["skill-a", "skill-b"],
    "prompt_snapshot": "最終成功的指令修正",
    "files_involved": ["file.ts"]
  },
  "performance_metrics": {
    "strikes_taken": 0,
    "token_usage_est": 1200
  }
}
```

## 反模式

| 禁止 | 應該 |
|------|------|
| 無端造新 Agent | 先搜 success_log 克隆 |
| L1 任務跑 C 階段 | 快軌執行，不加驗證 |
| 二擊內進 Build | Clone → Patch → 才 Build |
| 忽略 motivation.md | 每次 P 開頭先讀 |
| 數據冗餘抓取 | 命中關鍵標籤即停 |
