#!/usr/bin/env python3
import requests
import json
import base64
import os
import sys
from datetime import datetime

# 手動讀取 .env 如果存在，避免依賴 python-dotenv
def load_env_manual(env_path):
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value

load_env_manual("/Users/ryan/nanoclaw/.env")

# 配置
DRAWTHINGS_URL = "http://localhost:7860"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
OUTPUT_DIR = "/Users/ryan/nanoclaw/output/images"

def enhance_prompt(user_prompt):
    """使用 Groq 將中文轉換為高品質英文 Prompt"""
    if not GROQ_API_KEY:
        print("⚠️ 未設置 GROQ_API_KEY，跳過增強邏輯")
        return user_prompt

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    system_prompt = (
        "You are a professional AI image prompt engineer. "
        "Convert user input (could be Chinese) into a detailed English prompt. "
        "Add artistic style, lighting, and quality tags (masterpiece, 8K, high detail). "
        "Output ONLY the final prompt without explanation."
    )
    
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Enhance this: {user_prompt}"}
        ],
        "temperature": 0.7
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        if response.status_code == 200:
            return response.json()['choices'][0]['message']['content'].strip()
    except Exception as e:
        print(f"⚠️ Prompt 增強失敗: {str(e)}")
    
    return user_prompt

def generate_image(prompt, negative_prompt="text, blurry, low quality", steps=4, width=1024, height=1014):
    """呼叫 DrawThings API 生成圖片"""
    print(f"🚀 正在生成圖片: {prompt[:50]}...")
    
    payload = {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "steps": steps,
        "width": width,
        "height": height,
        "sampler_name": "Euler a",
        "cfg_scale": 2.0,
        "override_settings": {
            "sd_model_checkpoint": "Qwen-Image-Edit-2511"
        }
    }
    
    try:
        response = requests.post(f"{DRAWTHINGS_URL}/sdapi/v1/txt2img", json=payload, timeout=120)
        if response.status_code == 200:
            img_data = response.json()['images'][0]
            
            os.makedirs(OUTPUT_DIR, exist_ok=True)
            filename = f"gen_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            filepath = os.path.join(OUTPUT_DIR, filename)
            
            with open(filepath, "wb") as f:
                f.write(base64.b64decode(img_data))
            
            return {
                "status": "success",
                "path": filepath,
                "url": f"file://{filepath}",
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {"status": "error", "message": f"HTTP {response.status_code}: {response.text}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python3 generate_image_bridge.py \"提示詞\"")
        sys.exit(0)
    
    user_input = sys.argv[1]
    enhanced = enhance_prompt(user_input)
    print(f"✨ 增強後的 Prompt: {enhanced}")
    
    result = generate_image(enhanced)
    print(json.dumps(result, ensure_ascii=False, indent=2))
