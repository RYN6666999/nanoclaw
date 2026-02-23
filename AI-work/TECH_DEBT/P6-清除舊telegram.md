# 任務：刪除舊 telegram.ts + 清理遺留

## 現狀（基準 commit `c1d2016`）
- `src/telegram.ts`（1318L）仍存在，但 `src/index.ts` 已 import `./telegram/index.js`
- 舊檔案是 **死檔**，無任何 import 引用
- 但仍佔 repo 空間、混淆搜尋結果、包含過時的 `any` 用法

## 步驟

### 1. 刪除死檔
```bash
rm src/telegram.ts
```

### 2. 確認無斷裂引用
```bash
grep -rn "from.*['\"]\.\/telegram['\"]" src/ --include="*.ts"
# 預期：0 結果（所有 import 都指向 ./telegram/index.js 或 ./telegram/*.js）
```

### 3. ARCHITECTURE.md 更新
更新 `src/telegram/` 子模組表，反映 handlers.ts 拆分後的 9 檔結構：
- index.ts, handlers.ts, commands.ts, channel-handler.ts, callback-handler.ts
- stream.ts, utils.ts, types.ts, state.ts

## 前置條件
- 無（可獨立執行，但建議在 P4 之後，避免重複修 any）

## 驗證
```bash
npx tsc --noEmit
npx jest --runInBand
ls src/telegram.ts  # 應 not found
```
