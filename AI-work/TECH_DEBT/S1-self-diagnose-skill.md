# 任務：自我偵錯 Skill

## 目標
建立 `self-diagnose` skill，讓 AI agent 在每次對話開始時（或用戶觸發時）自動執行健康檢查，發現問題主動修復或報告。

## 觸發條件
- 用戶說「診斷」「debug」「檢查」「怎麼壞了」
- 對話開始時自動執行（靜默，只在有問題時報告）
- PM2 restart count 異常增加時

## 檢查項目（依序執行，fail-fast）

### 1. TypeScript 編譯
```bash
npx tsc --noEmit 2>&1 | head -20
```
- 0 errors → ✅
- >0 errors → 🔴 列出前 5 個，嘗試自動修復

### 2. 測試
```bash
npx jest --runInBand 2>&1 | tail -10
```
- 全過 → ✅
- 有失敗 → 🔴 列出失敗測試名

### 3. PM2 狀態
```bash
pm2 jlist | python3 -c "
import sys, json
for p in json.load(sys.stdin):
    if 'nanoclaw' in p['name']:
        s = p['pm2_env']['status']
        r = p['pm2_env']['restart_time']
        print(f\"{p['name']}: {s} (restarts: {r})\")
"
```
- 全部 online + restarts < 5 → ✅
- errored 或 restarts ≥ 5 → 🔴

### 4. Git 狀態
```bash
git status --porcelain | wc -l
git log --oneline -1
```
- 未 commit 檔案 > 10 → ⚠️ 提醒

### 5. any 殘留
```bash
grep -rn "as any\|: any" src/ --include="*.ts" | grep -v node_modules | grep -v "\.d\.ts" | wc -l
```
- 0 → ✅
- >0 → ⚠️ 列出數量

### 6. 死檔偵測
```bash
# 找 src/ 下無人 import 的 .ts 檔
for f in src/*.ts; do
  base=$(basename "$f" .ts)
  count=$(grep -rl "$base" src/ --include="*.ts" | grep -v "$f" | wc -l)
  [[ $count -eq 0 ]] && echo "ORPHAN: $f"
done
```

## 輸出格式
```
🔍 NanoClaw 自我診斷
├ tsc:     ✅ 0 errors
├ jest:    ✅ 7/7 suites, 60/60 tests
├ PM2:     ✅ semeow(online,r:1) hermes(online,r:1)
├ git:     ⚠️ 3 uncommitted files
├ any:     ✅ 0 remaining
└ orphans: ⚠️ src/telegram.ts (dead file)

建議：刪除 src/telegram.ts、commit 未追蹤檔案
```

## 自動修復能力（有把握時直接修，否則只報告）
- `catch (err: any)` → 自動改 `catch (err: unknown)`
- PM2 errored → `pm2 restart <name>`
- 死檔 → 提示刪除（不自動刪）

## 檔案位置
`skills/self-diagnose/SKILL.md`

## 實作注意
- 所有 shell 指令用 timeout 保護（≤ 30s）
- 靜默模式：只在有 🔴 或 ⚠️ 時輸出
- 結果寫入 `AI-work/DIAGNOSTICS/latest.md`（覆寫，不累積）
