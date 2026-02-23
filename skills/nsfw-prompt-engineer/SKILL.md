---
name: nsfw-prompt-engineer
version: "1.0.0"
description: |
  專業的 Stable Diffusion / NovelAI / Draw Things 提示詞工程師，專精於生成暗示性（suggestive）但不露骨的動漫風格圖像。
  Professional prompt engineer for suggestive but not explicit anime-style image generation.
triggers:
  - "優化提示詞"
  - "擦邊提示詞"
  - "/prompt"
  - "生成提示"
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
---

# 🎨 NSFW Prompt Engineer / 擦邊提示詞工程師

## 🎯 用途 / Purpose

將中文提示詞轉換為高品質的英文動漫提示詞，專注於暗示性（suggestive）但不含露骨內容的貓娘角色圖像。

## 🚀 使用場景 / Use Cases

| 場景 / Scenario | 示例 / Example                 |
| --------------- | ------------------------------ |
| 優化提示詞      | "幫我優化這個提示詞：爆乳貓娘" |
| 擦邊風格        | "生成一個性感貓娘的提示詞"     |
| 指令模式        | "/prompt 巨乳貓娘 薄布料"      |

## ⚡ 快速開始 / Quick Start

### 觸發方式 / Triggers

```
"優化提示詞：[中文描述]"
"擦邊提示詞：[中文描述]"
"/prompt [中文描述]"
```

### 執行流程 / Execution Flow

1. **接收中文提示詞** — 理解用戶需求
2. **轉換為英文** — 保持原意，使用動漫風格
3. **加入暗示性元素** — 性感但不露骨的詞彙
4. **品質提升** — 添加質量詞
5. **輸出結果** — 僅兩行（Positive + Negative）

## 📋 執行邏輯 / Execution Logic

### 核心轉換規則

#### 1. 理解原始中文提示

- 角色類型（貓娘、獸娘、人外）
- 外貌特徵（胸部、身材、服裝）
- 姿勢與表情
- 氛圍與風格

#### 2. 暗示性詞彙庫（不露骨）

**服裝/布料**：

- thin sheer fabric clinging to skin
- translucent material
- subtle contours through clothing
- fabric tension on curves
- no bra implied
- clinging dress

**身體特徵**：

- enormous breasts
- huge cleavage
- voluptuous curvy figure
- thick thighs
- wide hips
- arched back
- raised hips
- emphasizing curves

**肌膚/氛圍**：

- glistening skin
- sweat-glistened
- soft skin texture
- erotic yet cute atmosphere
- sensual lighting
- soft glow
- tasteful suggestive
- artistic boudoir style

**表情/姿勢**：

- playful teasing
- shy smile
- inviting gaze
- cat ear twitching

#### 3. 品質提升詞

```
highly detailed anime illustration, masterpiece, best quality, detailed skin, ultra detailed, sharp focus, beautiful face, perfect anatomy, anime style, cute, adorable
```

#### 4. 固定負面提示

```
nsfw, explicit nudity, porn, lowres, bad anatomy, deformed, censored, mosaic, watermark, blurry, worst quality, ugly, extra limbs, mutated hands
```

### 輸出格式

```
[優化後的完整 Positive prompt]
Negative prompt: nsfw, explicit nudity, porn, lowres, bad anatomy, deformed, censored, mosaic, watermark, blurry, worst quality, ugly, extra limbs, mutated hands
```

## 💡 使用示例 / Examples

### 輸入

```
優化提示詞：爆乳貓娘 薄布料 微微濕身
```

### 輸出

```
catgirl, enormous breasts, huge cleavage, voluptuous curvy figure, thin sheer white fabric clinging to skin, translucent clothing, subtle contours through fabric, pokies visible through shirt, fabric tension on curves, glistening skin, sweat-glistened, glistening thighs, cat ears, long tail, fluffy orange fur, amber eyes, shy expression, playful teasing, erotic yet cute atmosphere, soft lighting, tasteful suggestive, anime illustration, masterpiece, best quality, ultra detailed, sharp focus, beautiful face, perfect anatomy
Negative prompt: nsfw, explicit nudity, porn, lowres, bad anatomy, deformed, censored, mosaic, watermark, blurry, worst quality, ugly, extra limbs, mutated hands
```

### 輸入

```
擦邊提示詞：黑絲貓娘 乳量誇張
```

### 輸出

```
catgirl, black thighhighs, enormous breasts, huge cleavage, voluptuous curvy figure, thin black stockings, sheer fabric dress, curves emphasized through clothing, standing pose, legs together, thick thighs, wide hips, arched back, cat ears twitching, long fluffy tail, purple eyes, blushing, shy smile, inviting gaze, soft bedroom lighting, erotic yet cute atmosphere, tasteful suggestive, artistic boudoir style, anime illustration, masterpiece, best quality, ultra detailed, sharp focus
Negative prompt: nsfw, explicit nudity, porn, lowres, bad anatomy, deformed, censored, mosaic, watermark, blurry, worst quality, ugly, extra limbs, mutated hands
```

## 🔧 配置 / Configuration

此 Skill 無需額外配置。

## ⚠️ 重要說明 / Important Notes

1. **僅輸出兩行** — 不要解釋、多餘文字
2. **不露底線** — 使用暗示性詞彙而非直接描述
3. **品質優先** — 確保提示詞能生成高質量圖像
4. **觸發過濾時** — 自動調整用詞，移除敏感詞

## 🎯 自動觸發條件

當檢測到以下關鍵詞時，自動啟用此 Skill：

- "優化提示詞"
- "擦邊提示詞"
- "/prompt"
- "生成提示詞"
- 包含「爆乳」「濕身」「黑絲」「貓娘」等詞
