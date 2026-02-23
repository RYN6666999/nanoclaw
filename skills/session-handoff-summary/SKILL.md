# session-handoff-summary Skill

簡短說明：對話交接與里程碑檢測的輕量 Skill。支援觸發詞偵測、簡易摘要、以及是否建議自動 git commit。

使用方式（快速測試）：

1. 以 Node.js 執行範例輸入（目錄：`skills/session-handoff-summary/`）：

```bash
node skill.js <<'JSON'
{
  "title": "實作 session-handoff",
  "messages": [
    "開始：新增 session-handoff 框架",
    "下一步：實作 trigger 匹配與 commit 建議",
    "備註：額度快沒了，請儲存進度"
  ],
  "meta": { "changedFiles": 6, "percentComplete": 92 }
}
JSON
```

輸出為 JSON 格式，範例字段：
- `title`：摘要標題
- `summary`：自動產生的簡短交接重點
- `triggers`：偵測到的觸發詞
- `priority`：里程碑優先度（high/medium/low）
- `commitSuggestion`：是否建議 commit 及建議訊息

設計要點：
- 觸發詞採模糊字串包含（fuzzy includes），支援多語別名
- 里程碑規則為簡化版本，可依專案需求擴充
- TypeScript 源碼位於 `skills/session-handoff-summary/skill.ts`，本目錄提供 `skill.js` 作為快速 Node 執行範例

變更檔案支援：
- 當 handoff 被觸發時，系統會嘗試讀取 `git status --porcelain`，並把變更檔列表（若在 group folder 下）加入生成的 summary（欄位：`changedFilesList`）。
- summary 會在 `logs/handoff_suggestions.json` 中儲存，包含 `changedFilesList` 以及 `commitSuggestion`（若偵測為里程碑且優先度高則可能建議 commit）。

自動 commit 與安全：
- `AUTO_COMMIT_ENABLED`（在 `.env` 設定）預設為 `false`。系統提供 `scripts/auto-commit-sim.ts` 作為 dry-run。要真正套用 commit，請先在 `.env` 或環境中設 `AUTO_COMMIT_ENABLED=true`，然後執行：

```bash
npx tsx scripts/auto-commit-sim.ts --apply
```

注意：自動 commit 會用簡單 heuristic (`git add -A <group>` 再 commit)，請在使用前確認 staging/工作樹與 commit 訊息是否合適。

下一步：我會把觸發詞測試與里程碑自動 commit 建議整合到服務呼叫點（例如 `src/host-agent.ts` 或 `model-router` 的 LLM 協作流程）。如要我現在做整合，請允許我修改對應檔案。
