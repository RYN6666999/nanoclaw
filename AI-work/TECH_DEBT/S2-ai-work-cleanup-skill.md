# 任務：AI-work 資料夾定期清洗 Skill

## 目標
建立 `ai-work-cleanup` skill，確保 `AI-work/` 資料夾不會累積過期、重複、衝突的文檔。

## 觸發條件
- 用戶說「清洗」「cleanup」「整理 ai-work」
- 每 3 次對話主動檢查一次（靜默）
- 對話結束前（handoff 前）自動執行

## 清洗規則

### 1. 過期 HANDOFF 檔（>48h）
```bash
find AI-work/ Obsidian/ -name "HANDOFF-*" -mtime +2 -type f
```
- 動作：刪除，資訊已整合到最新 HANDOFF

### 2. 空目錄
```bash
find AI-work/ -type d -empty
```
- 動作：刪除

### 3. 重複/衝突檔案
偵測模式：
- 檔名含 `(1)` `(2)` `copy` `backup` `old`
- 相同目錄下內容相似度 > 80%（用 diff 行數 / 總行數）
- 動作：列出讓用戶確認

### 4. 過大檔案
```bash
find AI-work/ -type f -size +50k
```
- 文字檔 > 50KB 可能需要拆分或壓縮

### 5. TECH_DEBT 提示詞狀態同步
```bash
# 每個 P*.md / S*.md 應有明確狀態標記
for f in AI-work/TECH_DEBT/P*.md AI-work/TECH_DEBT/S*.md; do
  if ! grep -q "^## 狀態" "$f"; then
    echo "MISSING STATUS: $f"
  fi
done
```
- 確保每個 prompt 有 `## 狀態`（未開始/進行中/完成）

### 6. Obsidian 同步
確認以下對應關係：
- `AI-work/TECH_DEBT/` 的每個 task → `Obsidian/Nano_Memories/` 有對應追蹤
- 刪除 Obsidian 側的過期連結

## 清洗流程
```
1. 掃描 → 產生候選清單
2. 分類：自動刪除（空目錄、>48h handoff） vs 需確認（重複檔）
3. 執行自動刪除
4. 需確認項用列表呈現，等用戶決定
5. 更新 AI-work/CLEANUP_LOG.md（追加模式，每次一行：日期 + 刪了什麼）
```

## 輸出格式
```
🧹 AI-work 清洗報告
├ 過期 HANDOFF:  刪除 2 個
├ 空目錄:        刪除 1 個
├ 重複檔案:      0 個
├ 過大檔案:      0 個
├ TECH_DEBT 狀態: 7/7 有標記
└ Obsidian 同步:  ✅

已清理 3 項，0 項需確認
```

## 安全機制
- 絕不自動刪除含 `SKILL.md`、`ARCHITECTURE.md`、`.env` 的檔案
- 刪除前先 `git status`，確保已 commit 的才刪
- 每次最多刪 10 個檔案，超過則需用戶確認
- 刪除記錄寫入 `AI-work/CLEANUP_LOG.md`

## 檔案位置
`skills/ai-work-cleanup/SKILL.md`

## 目錄結構規範（清洗時對照）
```
AI-work/
├── TECH_DEBT/          # 技術債提示詞（P1~Pn, S1~Sn）
├── DIAGNOSTICS/        # self-diagnose 輸出
├── CLEANUP_LOG.md      # 本 skill 的清洗紀錄
└── （其他暫存文件）     # 超過 48h 未引用即可刪除
```
