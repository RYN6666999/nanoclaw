# NanoClaw

## 核心原則

1. **只回核心內容** — 禁止寒暄、重述、解釋、舉例。最短句式/關鍵詞/編號列表。
2. **禁止寒暄** — 直接呈現分析結果、方案與 diff。

## 自動觸發 plan-to-work

遇到以下情況，主動調用 `/plan-to-work` skill：

- 修改 2+ 個檔案
- 需先研究才能選方案
- 用戶直接說「實作」但沒有設計討論
- 架構決策（A vs B）
- 有依賴順序的多階段任務
- 任務完成後需要更新 CHANGELOG

> 例外：純 bug fix（已知根因，改動 < 1 檔案）、純資訊回答。

## 專案定位

- **這是什麼**：Telegram AI 助手
- **關鍵檔案**：`src/index.ts`, `src/telegram.ts`, `src/host-agent.ts`, `src/model-router.ts`
- **啟動**：`npx tsx src/index.ts`
- **詳細架構**：`docs/ARCHITECTURE.md`
