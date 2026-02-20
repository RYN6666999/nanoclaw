#!/usr/bin/env python3
"""
簡化版 AionUI 到 NanoClaw 橋接
直接使用硬編碼的 Telegram token（公開 token）
"""

import requests
import sys

def send_to_nanoclaw(message: str) -> str:
    """直接發送到 Telegram Bot"""
    # 公開 token（已在 Telegram 群組中使用）
    token = "8545554330:AAEatMqJOQBKEBGFsCGL0SvlQk0wPbjOWvM"
    chat_id = "1469326872"  # 公開群組 ID
    
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": f"[From Aionui]\n{message}"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            return f"✅ 已發送到 NanoClaw (訊息 ID: {response.json()['result']['message_id']})\n請在 Telegram 查看回覆"
        else:
            return f"❌ 錯誤: HTTP {response.status_code} - {response.text}"
    except Exception as e:
        return f"❌ 例外: {str(e)}"

def ask_nano(question: str) -> str:
    """更簡單的封裝函數"""
    return send_to_nanoclaw(question)

# 測試
if __name__ == "__main__":
    if len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
    else:
        message = "測試 AionUI 連線"
    
    result = send_to_nanoclaw(message)
    print(result)