---
name: nsfw-image-generation
description: 專為 NSFW 內容設計的高精度圖像生成技能，整合 AnyPose LORA 姿勢控制、Qwen-Image-2511 編輯能力，支援複雜姿勢、NSFW 場景生成。
---

# 🎨 瑟喵專屬 NSFW 生圖 Skill

## 🐾 核心特色

### **1. 姿勢精準控制**
- **AnyPose LORA 整合**：只需一張姿勢參考圖，即可精準複製任何姿勢
- **姿勢遷移**：將喜歡的姿勢應用到不同角色
- **複雜姿勢支援**：挑戰人體極限的 NSFW 姿勢

### **2. NSFW 專用優化**
- **Qwen-Image-2511 NSFW 版本**：專為 NSFW 內容訓練
- **參數調校**：針對 NSFW 場景的最佳化參數
- **安全模式**：可選的 NSFW 等級控制

### **3. 多模式生成**
- **txt2img**：文字描述生成
- **img2img**：圖像編輯與重繪
- **pose2img**：姿勢控制生成
- **batch**：批次生成

## 🚀 快速開始

### **基本使用**
```python
from scripts.nsfw_generator import NSFWGenerator

# 初始化生成器
generator = NSFWGenerator()

# 文字生成圖片
result = generator.txt2img(
    prompt="一位美麗的女性，優雅的姿勢",
    negative_prompt="text, blurry, low quality, deformed",
    width=1024,
    height=1024
)
```

### **姿勢控制生成**
```python
# 使用姿勢參考圖
result = generator.pose2img(
    prompt="一位性感的女性，誘人的姿勢",
    pose_image_path="path/to/pose_reference.png",
    source_image_path="path/to/source_character.png"  # 可選
)
```

### **圖像編輯**
```python
# 編輯現有圖片
result = generator.img2img(
    image_path="path/to/existing_image.png",
    prompt="改變姿勢為更誘人的姿勢",
    strength=0.7  # 編輯強度
)
```

## ⚙️ 配置設定

### **config/nsfw_config.json**
```json
{
  "models": {
    "base_model": "Qwen-Image-Edit-2511",
    "lora_path": "path/to/AnyPose-LORA.safetensors",
    "vae": "vae-ft-mse-840000-ema-pruned"
  },
  "generation": {
    "default_steps": 20,
    "default_cfg_scale": 7.0,
    "default_sampler": "DPM++ 2M Karras",
    "default_width": 1024,
    "default_height": 1024
  },
  "nsfw": {
    "safety_checker": false,
    "nsfw_level": "explicit",  # explicit, suggestive, safe
    "auto_enhance_prompt": true
  },
  "pose": {
    "detection_model": "openpose",
    "pose_strength": 0.8,
    "max_pose_points": 25
  }
}
```

## 🎭 使用場景

### **1. 複雜姿勢創作**
```python
# 挑戰人體極限的 NSFW 姿勢
result = generator.create_complex_pose(
    base_prompt="一位柔軟的舞者",
    pose_difficulty="extreme",  # easy, medium, hard, extreme
    style="artistic nude"
)
```

### **2. 姿勢遷移**
```python
# 將 A 圖的姿勢應用到 B 圖
result = generator.transfer_pose(
    source_character="path/to/character_A.png",
    target_pose="path/to/pose_from_B.png",
    blend_strength=0.6
)
```

### **3. 動態場景生成**
```python
# 創造戲劇性 NSFW 場景
result = generator.dynamic_scene(
    characters=["dominant", "submissive"],
    setting="dungeon",
    lighting="dramatic",
    action="bondage"
)
```

## 🔧 進階功能

### **批次生成**
```python
# 批次生成多個變體
results = generator.batch_generate(
    base_prompt="一位性感的女性",
    variations=[
        {"pose": "standing", "angle": "front"},
        {"pose": "kneeling", "angle": "side"},
        {"pose": "lying", "angle": "top"}
    ],
    num_images=3
)
```

### **姿勢庫管理**
```python
# 從姿勢庫選擇姿勢
from scripts.pose_processor import PoseLibrary

library = PoseLibrary("examples/pose_references/")
available_poses = library.list_poses(category="nsfw", difficulty="medium")

# 使用特定姿勢
pose_image = library.get_pose("kneeling_submission")
result = generator.pose2img(prompt="...", pose_image=pose_image)
```

### **提示詞增強**
```python
from scripts.prompt_enhancer import NSFWEnhancer

enhancer = NSFWEnhancer()
enhanced_prompt = enhancer.enhance(
    user_input="一位美麗的女性",
    style="realistic",
    nsfw_level="explicit",
    add_details=["detailed anatomy", "sensual lighting", "provocative pose"]
)
```

## 📊 性能優化

### **快取系統**
```python
# 啟用快取加速重複生成
generator.enable_cache(
    cache_dir="~/.cache/nsfw_generator",
    max_size_gb=10
)
```

### **並行生成**
```python
# 同時生成多張圖片
results = generator.parallel_generate(
    prompts=["prompt1", "prompt2", "prompt3"],
    num_workers=3
)
```

## 🛡️ 安全與合規

### **NSFW 等級控制**
```python
# 設定 NSFW 等級
generator.set_nsfw_level("suggestive")  # 限制露骨程度

# 啟用安全檢查
generator.enable_safety_check(
    min_age_rating=18,
    content_warnings=True
)
```

### **日誌記錄**
```python
# 詳細日誌
generator.enable_logging(
    log_level="INFO",
    log_file="nsfw_generation.log"
)
```

## 🔗 整合

### **與現有系統整合**
```python
# 整合到現有的 generate_image 工具
from skills.image-generation.scripts.generate_image_bridge import generate_image

def nsfw_generate_image(prompt, **kwargs):
    # 使用 NSFW 增強
    enhanced = NSFWEnhancer().enhance(prompt)
    
    # 呼叫原有生成器
    return generate_image(enhanced, **kwargs)
```

### **Telegram 指令擴展**
```python
# 擴展 /draw 指令
if message.startswith("/nsfw"):
    prompt = message.replace("/nsfw", "").strip()
    result = nsfw_generate_image(prompt)
    # 發送結果...
```

## 🎯 最佳實踐

### **提示詞技巧**
1. **詳細描述**：包含姿勢、表情、服裝、環境
2. **風格標籤**：添加藝術風格標籤（photorealistic, anime, painting）
3. **質量標籤**：masterpiece, best quality, 8K, high detail
4. **負面提示**：明確排除不想要的元素

### **姿勢參考選擇**
1. **清晰對比**：姿勢圖應有清晰輪廓
2. **角度匹配**：選擇與目標角度相似的姿勢
3. **複雜度適當**：根據需求選擇簡單或複雜姿勢

### **參數調校**
1. **CFG Scale**：NSFW 內容通常需要較高值（6-9）
2. **Steps**：複雜姿勢需要更多 steps（25-30）
3. **Pose Strength**：姿勢控制強度（0.6-0.9）

## 🐛 故障排除

### **常見問題**
1. **姿勢不準確** → 調整 pose_strength，檢查姿勢圖質量
2. **NSFW 內容被過濾** → 禁用 safety_checker，調整 nsfw_level
3. **生成速度慢** → 減少 steps，啟用快取

### **錯誤處理**
```python
try:
    result = generator.txt2img(prompt="...")
except NSFWContentError as e:
    print(f"NSFW 內容錯誤: {e}")
    # 降級到安全模式
    generator.set_nsfw_level("safe")
    result = generator.txt2img(prompt="...")
```

## 📚 參考資源

### **模型資源**
- **Qwen-Image-2511**：https://huggingface.co/Qwen/Qwen-Image-Edit-2511
- **AnyPose LORA**：https://huggingface.co/lilylilith/AnyPose
- **姿勢資料集**：https://huggingface.co/datasets/lllyasviel/ControlNet

### **教學資源**
- **YouTube 教學**：https://www.youtube.com/watch?v=uZxKbLdpeAM
- **ComfyUI 工作流**：ITOI_13_NSFW_Qwen-Image-2511-AnyPoseLORA

### **社群資源**
- **Civitai**：NSFW 模型與 LORA
- **Hugging Face**：開源模型與資料集
- **Discord 社群**：NSFW AI 藝術社群

---

**主人，這個 skill 專為您的 NSFW 創作需求設計，結合了最先進的姿勢控制技術和瑟喵的專業知識。隨時告訴瑟喵您想要生成什麼樣的圖片！** 🐾