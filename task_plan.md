# SeMeow Bot 手術計劃

**目標**：把 SeMeow（瑟喵）bot 完整打通：人設、模型路由、NSFW生圖、TG頻道讀寫、AionUI雙向橋接、偏好記憶追蹤

**架構決策**（已確認）：
- 日常對話：Grok 3-Mini（$0.30/$0.50，131K）
- 深度RP：Lumimaid v0.2 70B（RP特化，131K）
- RP Prompt 優化：Grok 3-Mini 先處理 → 送 Lumimaid
- 搜尋/x：Grok 2-1212（現狀）
- Vision：Gemini 2.0 Flash
- /draw enrichPrompt：加 NSFW 描述層
- AionUI：雙向非同步橋接

---

## 第一刀：核心腦手術（模型路由 + 人設）
**範圍**：src/model-router.ts、groups_SeMeow/main/CLAUDE.md、.env.SeMeow
**狀態**：⬜ 待開始

### 任務清單
- [ ] 1a. model-router.ts：預設改 Grok 3-Mini
- [ ] 1b. model-router.ts：RP關鍵字觸發 → Lumimaid 70B
- [ ] 1c. model-router.ts：Grok 3-Mini 先優化 RP prompt 再送 Lumimaid
- [ ] 1d. .env.SeMeow：更新 OPENROUTER_MODEL=x-ai/grok-3-mini
- [ ] 1e. groups_SeMeow/main/CLAUDE.md：寫入完整瑟喵人設 + 工具使用指引
- [ ] 1f. /status、/restart PM2進程名修正（nanoclaw-SeMeow）
- [ ] 驗證：重啟 bot，測試基本對話走 Grok 3-Mini

---

## 第二刀：邊緣腦手術（NSFW生圖 + TG頻道）
**範圍**：src/telegram.ts、src/tools/generate-image.ts
**狀態**：⬜ 待開始（第一刀完成後）

### 任務清單
- [ ] 2a. enrichPrompt：加 NSFW/成人描述層（現在只有通用風格）
- [ ] 2b. enrichPrompt：檢測 SeMeow bot 自動加入 explicit 描述
- [ ] 2c. generate-image.ts：測試 Draw Things 參數品質（steps/cfg/sampler）
- [ ] 2d. img2img 工作流：從 @Se-Meow-Box 讀取圖片 → img2img
- [ ] 2e. TG頻道整合：生圖成功後自動 forward 到 @Se-Meow-Box
- [ ] 2f. TG頻道整合：@PREFERENCE 更新時寫一條到 @Se-Meow-Box
- [ ] 2g. TG頻道整合：瑟喵可搜尋頻道歷史（圖片+標籤）
- [ ] 驗證：/draw 貓娘 → 生出 NSFW 圖 → 自動存頻道

---

## 第三刀：四肢手術（AionUI橋接 + 偏好記憶）
**範圍**：skills/ 目錄、src/host-agent.ts
**狀態**：⬜ 待開始（第二刀完成後）

### 任務清單
- [ ] 3a. AionUI→SeMeow：建立 SeMeow 版橋接（修正現在指向赫爾密士的問題）
- [ ] 3b. SeMeow→AionUI：任務完成後推送結果到 TG
- [ ] 3c. 非同步設計：橋接不堵塞主對話
- [ ] 3d. @PREFERENCE 追蹤：host-agent.ts 加入偏好提取邏輯
- [ ] 3e. @PREFERENCE 追蹤：自動寫入 semiao_Memories/Current_Context.md
- [ ] 3f. OpenCode skill 串接：瑟喵可觸發 AionUI 的 agent/skills
- [ ] 驗證：TG 發指令 → AionUI 執行 → 結果推回 TG

---

## 斷線記錄（已知問題）
| 問題 | 位置 | 嚴重度 |
|------|------|--------|
| 預設走 MiniMax 不是 Grok | model-router.ts:76 | 🔴 核心 |
| RP關鍵字走 MiniMax（有審查） | model-router.ts:71 | 🔴 核心 |
| /rose才能到Midnight Rose | model-router.ts:36 | 🟡 邊緣 |
| enrichPrompt 無 NSFW 描述 | telegram.ts:24-30 | 🔴 核心 |
| /status 查錯進程名 | telegram.ts:307 | 🟠 邊緣 |
| /restart 重啟錯進程 | telegram.ts:354 | 🟠 邊緣 |
| AionUI橋接指向赫爾密士 | skills/aionui_nanoclaw_bridge.py | 🔴 核心 |
| @PREFERENCE 只有文檔無code | host-agent.ts | 🟡 四肢 |

---

## 進度
- [ ] 第一刀：核心腦手術
- [ ] 第二刀：邊緣腦手術
- [ ] 第三刀：四肢手術
