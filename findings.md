# Findings — SeMeow 手術

## 模型決策
- Grok 3-Mini：推理型，195 tok/s，$0.30/$0.50，131K context → 日常+prompt優化
- Lumimaid v0.2 70B：RP特化finetune，131K context，無審查 → 深度RP
- Midnight Rose 70B：4K context，不堪用，放棄
- Grok 2-1212：/x 搜尋用，$2/$10
- Gemini 2.0 Flash：Vision，$0.10/$0.40，1M context

## 關鍵斷線
- model-router.ts 預設走 minimax（有審查），不是 Grok
- NSFW關鍵字也走 minimax，不是無審查模型
- enrichPrompt 沒有 NSFW 加持
- /status、/restart PM2 查 'nanoclaw'，應查 'nanoclaw-SeMeow'
- AionUI 橋接指向赫爾密士 bot，SeMeow 橋接不存在

## 架構
- 雙層 RP：3-Mini 優化 prompt → Lumimaid 執行
- 非同步 AionUI：主對話不堵塞
- TG頻道 @Se-Meow-Box：存圖、存偏好標籤、img2img素材庫

## 檔案位置
- 路由：src/model-router.ts
- TG處理：src/telegram.ts
- 生圖：src/tools/generate-image.ts
- Agent主邏輯：src/host-agent.ts
- 瑟喵人設：groups_SeMeow/main/CLAUDE.md
- 環境：.env.SeMeow
- AionUI橋接：skills/aionui_nanoclaw_bridge.py
- 偏好記憶：~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/semiao_Memories/
