---
name: anime-img2img-workflow
version: "1.0.0"
description: |
  從 Danbooru/Pixabay 搜尋動漫風格圖片作為參考，調用 Draw Things img2img 生成新圖像。
  Search anime-style reference images from Danbooru/Pixabay, then use Draw Things img2img to generate new images.
triggers:
  - "搜圖生圖"
  - "參考圖"
  - "/img2img"
  - "search and generate"
category: tool
author: nanoclaw
compatible-agents:
  - opencode
  - claude-code
  - cursor
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - WebFetch
  - WebSearch
---

# 🎨 Anime img2img Workflow / 搜圖生圖工作流

## 🎯 用途 / Purpose

1. 根據用戶描述搜尋動漫風格參考圖
2. 下載候選圖片
3. 調用 Draw Things img2img 生成新圖像

## 🚀 使用場景 / Use Cases

| 場景 / Scenario | 示例 / Example                 |
| --------------- | ------------------------------ |
| 搜圖生圖        | "搜尋貓娘的參考圖然後生成"     |
| 參考圖生圖      | "找一張巨乳貓娘的圖做參考生成" |
| 指令模式        | "/img2img 銀髮蘿莉"            |

## ⚡ 快速開始 / Quick Start

### 觸發方式 / Triggers

```
"搜圖生圖：[描述]"
"參考圖生成：[描述]"
"/img2img [描述]"
"search and generate [description]"
```

### 執行流程 / Execution Flow

```
1. 解析用戶描述 → 提取關鍵詞
2. 搜尋 Danbooru/Pixabay → 獲取候選圖 URL
3. 展示候選圖 → 用戶選擇 或 自動選擇第一張
4. 下載參考圖 → 轉 base64
5. 調用 Draw Things img2img → 生成新圖
6. 輸出結果
```

## 📋 執行邏輯 / Execution Logic

### Step 1: 解析關鍵詞

從用戶描述提取搜尋關鍵詞：

- "貓娘" → catgirl
- "巨乳" → large breasts
- "黑絲" → black thighhighs

### Step 2: 搜尋圖片

**優先順序**：

1. Danbooru — 動漫圖庫，關鍵詞精準
2. Pixabay — 備用，商業可用

**搜尋 API**：

```bash
# Danbooru 搜尋範例
curl "https://danbooru.donmai.us/posts.json?tags=catgirl&limit=10"
```

**提取圖片 URL**：

- 從 JSON response 提取 `file_url` 或 `source`

### Step 3: 下載圖片

處理防盗链：

```bash
# 加入 Referer header
curl -H "Referer: https://danbooru.donmai.us/" -o ref_image.jpg <image_url>
```

### Step 4: Draw Things img2img

**API Endpoint**: `http://127.0.0.1:7860/sdapi/v1/img2img`

**Request Body**:

```json
{
  "init_images": ["<base64_image>"],
  "prompt": "<enhance_prompt>",
  "denoising_strength": 0.4,
  "seed": -1,
  "steps": 28,
  "cfg_scale": 7,
  "width": 1024,
  "height": 1024,
  "sampler_name": "DPM++ 2M Karras"
}
```

### Step 5: 輸出結果

返回生成的圖片路徑，格式：

```
[IMAGE:/tmp/nanoclaw-images/gen-xxx.png]
生成完成 (Draw Things img2img)
```

## 💡 使用示例 / Examples

### 輸入

```
搜圖生圖：銀髮貓娘 巨乳
```

### 執行過程

```
1. 關鍵詞：catgirl, silver hair, large breasts
2. 搜尋 Danbooru...
3. 找到候選圖：https://danbooru.donmai.us/posts/12345678
4. 下載參考圖...
5. Draw Things img2img 生成中...
6. 完成！
```

### 輸出

```
[IMAGE:/tmp/nanoclaw-images/gen-1700000000.png]
生成完成 (Draw Things img2img, seed: 1234567890)
```

## 🔧 技術細節 / Technical Details

### Danbooru API

```bash
# 搜尋貼文
GET https://danbooru.donmai.us/posts.json?tags=<keywords>&limit=10

# 響應處理
- file_url: 完整圖片 URL
- source: 原始來源
- tag_string: 標籤列表
```

### Draw Things img2img

```typescript
const response = await fetch("http://127.0.0.1:7860/sdapi/v1/img2img", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    init_images: [base64Image],
    prompt: enhancedPrompt,
    denoising_strength: 0.4, // 0-1, 越低越接近原圖
    seed: -1,
    steps: 28,
    cfg_scale: 7,
    width: 1024,
    height: 1024,
  }),
});
```

### 圖片保存位置

```
/tmp/nanoclaw-images/
├── ref-<timestamp>.jpg   # 參考圖
└── gen-<timestamp>.png    # 生成圖
```

## ⚠️ 注意事項 / Notes

1. **Danbooru 可能有 NSFW 內容** — 需過濾\_safe 的圖
2. **防盗链** — 下載時需加入正確的 Referer
3. **Draw Things 需開啟** — 確保 app 在運行且 API server 已啟用
4. **img2img 需要時間** — 通常比 txt2img 慢

## 🎯 自動觸發條件

當檢測到以下關鍵詞時，自動啟用此 Skill：

- "搜圖生圖"
- "參考圖"
- "img2img"
- "search and generate"
- 包含「搜尋」+「生成」的組合
