# 技術債清理專案

> NanoClaw 技術債追蹤與清理，Session 1–5 累計

## 狀態總覽

| 編號 | 任務 | 狀態 | Session | Commit |
|------|------|------|---------|--------|
| P4 | 型別安全（消除 15 個 `any`） | ✅ 完成 | 4 | `be82e67` |
| P5 | handoff-service 抽取 | ✅ 完成 | 4 | `be82e67` |
| P6 | 清除舊 telegram.ts（1318L 死檔） | ✅ 完成 | 4 | `be82e67` |
| P7 | 補測試（60→90 tests, 10 suites） | ✅ 完成 | 4 | `be82e67` |
| S1 | self-diagnose skill | 🔲 下一輪 | 5 | — |
| S2 | ai-work-cleanup skill | 🔲 下一輪 | 5 | — |

## 最終指標（Session 4 結束）

- **tsc**: 0 errors
- **jest**: 10 suites / 90 tests
- **`any` 殘留**: 0
- **git**: `8d668a8` (main)

## 檔案索引

### 已完成提示詞（歸檔，僅供回顧）
- [P4-型別安全.md](P4-型別安全.md)
- [P5-handoff-service.md](P5-handoff-service.md)
- [P6-清除舊telegram.md](P6-清除舊telegram.md)
- [P7-補測試.md](P7-補測試.md)

### 待實作提示詞（下一輪使用）
- [S1-self-diagnose-skill.md](S1-self-diagnose-skill.md)
- [S2-ai-work-cleanup-skill.md](S2-ai-work-cleanup-skill.md)

## Session 歷程

| Session | Commit | 重點 |
|---------|--------|------|
| 1 | `b98152f` | 型別修復 22→0 errors, telegram.ts 拆分 6 子模組, ARCHITECTURE.md |
| 2 | `6035e4c` | Git 歷史清理, 測試 2→7 suites (60 tests), Scripts 修復 |
| 3 | `4ab7709` `c1d2016` | API key rotation, PM2 .config.cjs, handlers 拆分 4 檔 |
| 4 | `be82e67` | P4–P7 全部完成, 0 any, 90 tests, handoff-service 抽取 |

## 踩坑清單

| # | 問題 | 根因 | 解法 |
|---|------|------|------|
| 1 | PM2 無法辨識 ecosystem-semeow.cjs | PM2 6.x 只認 `.config.cjs` | 重命名 |
| 2 | `msg.text` 在 `in` guard 後仍報 TS error | grammy Message union | 加 null guard + const |
| 3 | ts-jest 下 `import.meta.url` 不可用 | CJS transform 無 ESM import.meta | jest.mock + dynamic import |
| 4 | `.env` 被 git 追蹤 | 早期 commit | filter-repo 清除歷史 |
| 5 | HANDOFF 時間戳不準 | AI 幻覺 | 以 `date` 指令為準 |
