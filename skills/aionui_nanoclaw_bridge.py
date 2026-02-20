#!/usr/bin/env python3
"""
Aionui → NanoClaw Telegram Bridge
將 Aionui 的訊息透過 Telegram 發送到 NanoClaw Bot (asis)
"""

import os
import sys
import requests
import json
from dotenv import load_dotenv

# 載入環境變數
load_dotenv("/Users/ryan/nanoclaw/skills/universal-api-router/.env")

# Telegram Bot 配置
ASIS_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN_ASIS")
ASIS_CHAT_ID = os.getenv("ASIS_CHAT_ID", "1469326872")  # 您的 Chat ID

def send_to_nanoclaw(message: str, wait_for_response: bool = True) -> str:
    """
    發送訊息到 NanoClaw (透過 Telegram Bot asis)
    
    Args:
        message: 要發送的訊息
        wait_for_response: 是否等待回覆 (目前版本不支援，僅發送)
        
    Returns:
        發送狀態訊息
    """
    if not ASIS_BOT_TOKEN:
        return "Error: TELEGRAM_BOT_TOKEN_ASIS not configured in .env"
    
    url = f"https://api.telegram.org/bot{ASIS_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": ASIS_CHAT_ID,
        "text": f"[From Aionui]\n{message}"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            result = response.json()
            if result.get("ok"):
                msg_id = result["result"]["message_id"]
                return f"✅ Message sent to NanoClaw (Message ID: {msg_id})\n\nNote: Check Telegram for NanoClaw's response."
            else:
                return f"❌ Telegram API error: {result.get('description', 'Unknown error')}"
        else:
            return f"❌ HTTP {response.status_code}: {response.text}"
    except Exception as e:
        return f"❌ Exception: {str(e)}"


def get_nanoclaw_status() -> str:
    """
    獲取 NanoClaw 系統狀態 (透過 /status 指令)
    """
    status_msg = "/status"
    return send_to_nanoclaw(status_msg, wait_for_response=False)


# CLI 介面
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python aionui_nanoclaw_bridge.py send <message>")
        print("  python aionui_nanoclaw_bridge.py status")
        print("\nExamples:")
        print("  python aionui_nanoclaw_bridge.py send '請幫我搜尋最新的 AI 新聞'")
        print("  python aionui_nanoclaw_bridge.py status")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "send":
        if len(sys.argv) < 3:
            print("Error: Message required")
            sys.exit(1)
        message = " ".join(sys.argv[2:])
        result = send_to_nanoclaw(message)
        print(result)
    elif command == "status":
        result = get_nanoclaw_status()
        print(result)
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
