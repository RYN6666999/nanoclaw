#!/usr/bin/env python3
"""
AionUI ↔ NanoClaw 雙向通訊橋接
使用檔案共享方式實現雙向對話
"""

import os
import json
import time
import requests
from datetime import datetime
from pathlib import Path
import subprocess

# 添加橋接路徑
sys_path = os.path.dirname(os.path.abspath(__file__))
if sys_path not in sys.path:
    sys.path.append(sys_path)

# 配置
SHARED_FILE = "/tmp/nanoclaw_aionui_dialog.json"
TELEGRAM_TOKEN = "8545554330:AAEatMqJOQBKEBGFsCGL0SvlQk0wPbjOWvM"
TELEGRAM_CHAT_ID = "1469326872"
MAX_HISTORY = 50  # 最大對話輪次

def ensure_shared_file():
    """確保共享檔案存在"""
    if not os.path.exists(SHARED_FILE):
        with open(SHARED_FILE, 'w', encoding='utf-8') as f:
            json.dump([], f, ensure_ascii=False, indent=2)

def load_dialog():
    """載入對話歷史"""
    ensure_shared_file()
    try:
        with open(SHARED_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return []

def save_dialog(dialog):
    """儲存對話歷史"""
    ensure_shared_file()
    # 限制歷史長度
    if len(dialog) > MAX_HISTORY:
        dialog = dialog[-MAX_HISTORY:]
    
    with open(SHARED_FILE, 'w', encoding='utf-8') as f:
        json.dump(dialog, f, ensure_ascii=False, indent=2)

def add_message(sender, message, message_id=None):
    """新增訊息到對話歷史"""
    dialog = load_dialog()
    
    entry = {
        "timestamp": datetime.now().isoformat(),
        "from": sender,
        "message": message,
        "message_id": message_id
    }
    
    dialog.append(entry)
    save_dialog(dialog)
    return entry

def send_to_nanoclaw(message):
    """發送訊息到 NanoClaw (Telegram)"""
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": f"[AionUI] {message}"
    }

    # 檢查是否為繪圖指令
    if message.strip().startswith("/draw"):
        print("🖼️ 偵測到繪圖指令，執行本地橋接...")
        prompt = message.replace("/draw", "").strip()
        try:
            # 異步執行繪圖橋接，避免阻塞
            cmd = ['python3', os.path.join(os.path.dirname(__file__), 'generate_image_bridge.py'), prompt]
            # 這裡我們同步執行以獲取結果回傳給 AionUI
            process = subprocess.run(cmd, capture_output=True, text=True)
            if process.returncode == 0:
                result = json.loads(process.stdout)
                if result.get("status") == "success":
                    img_path = result.get("path")
                    add_message("nanoclaw", f"✅ 圖片已生成：{img_path}", int(time.time()))
                    return {
                        "status": "success",
                        "text": f"✅ 圖片生成成功！儲存路徑：{img_path}",
                        "image_path": img_path
                    }
        except Exception as e:
            print(f"⚠️ 繪圖橋接失敗: {str(e)}")
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            result = response.json()['result']
            msg_id = result['message_id']
            
            # 記錄發送的訊息
            add_message("aionui", message, msg_id)
            
            return {
                "status": "success",
                "message_id": msg_id,
                "text": f"✅ 已發送到 NanoClaw (訊息 ID: {msg_id})",
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "status": "error",
                "error": f"HTTP {response.status_code}",
                "text": f"❌ 發送失敗: HTTP {response.status_code}"
            }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "text": f"❌ 例外錯誤: {str(e)}"
        }

def get_latest_reply():
    """獲取 NanoClaw 的最新回覆"""
    dialog = load_dialog()
    
    # 尋找最新的 NanoClaw 回覆
    nanoclaw_replies = [msg for msg in dialog if msg.get("from") == "nanoclaw"]
    
    if not nanoclaw_replies:
        return None
    
    # 按時間戳排序，取最新
    nanoclaw_replies.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return nanoclaw_replies[0]

def get_unread_replies(last_seen_id=None):
    """獲取未讀的 NanoClaw 回覆"""
    dialog = load_dialog()
    
    # 篩選 NanoClaw 回覆
    nanoclaw_replies = [msg for msg in dialog if msg.get("from") == "nanoclaw"]
    
    if last_seen_id:
        # 只返回 message_id 大於 last_seen_id 的回覆
        nanoclaw_replies = [msg for msg in nanoclaw_replies 
                           if msg.get("message_id", 0) > last_seen_id]
    
    # 按時間戳排序
    nanoclaw_replies.sort(key=lambda x: x.get("timestamp", ""))
    return nanoclaw_replies

def check_for_replies():
    """檢查是否有新回覆 (輪詢用)"""
    dialog = load_dialog()
    
    # 統計
    total = len(dialog)
    from_aionui = len([msg for msg in dialog if msg.get("from") == "aionui"])
    from_nanoclaw = len([msg for msg in dialog if msg.get("from") == "nanoclaw"])
    
    latest = get_latest_reply()
    
    return {
        "total_messages": total,
        "from_aionui": from_aionui,
        "from_nanoclaw": from_nanoclaw,
        "latest_reply": latest,
        "has_new_reply": latest is not None
    }

def clear_dialog():
    """清空對話歷史"""
    save_dialog([])
    return {"status": "cleared", "message": "對話歷史已清空"}

def simulate_nanoclaw_reply(message, message_id=None):
    """模擬 NanoClaw 回覆 (測試用)"""
    if message_id is None:
        message_id = int(time.time() * 1000)
    
    return add_message("nanoclaw", message, message_id)

# 命令行介面
if __name__ == "__main__":
    import argparse
    import sys
    
    parser = argparse.ArgumentParser(description="AionUI ↔ NanoClaw 雙向通訊橋接")
    subparsers = parser.add_subparsers(dest="command", help="命令")
    
    # send 命令
    send_parser = subparsers.add_parser("send", help="發送訊息到 NanoClaw")
    send_parser.add_argument("message", help="要發送的訊息")
    
    # check 命令
    check_parser = subparsers.add_parser("check", help="檢查回覆狀態")
    
    # get 命令
    get_parser = subparsers.add_parser("get", help="獲取最新回覆")
    
    # history 命令
    history_parser = subparsers.add_parser("history", help="顯示對話歷史")
    history_parser.add_argument("--limit", type=int, default=10, help="顯示數量限制")
    
    # clear 命令
    clear_parser = subparsers.add_parser("clear", help="清空對話歷史")
    
    # simulate 命令 (測試用)
    sim_parser = subparsers.add_parser("simulate", help="模擬 NanoClaw 回覆")
    sim_parser.add_argument("message", help="模擬回覆內容")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    if args.command == "send":
        result = send_to_nanoclaw(args.message)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    
    elif args.command == "check":
        result = check_for_replies()
        print(json.dumps(result, ensure_ascii=False, indent=2))
    
    elif args.command == "get":
        reply = get_latest_reply()
        if reply:
            print(json.dumps(reply, ensure_ascii=False, indent=2))
        else:
            print("{\"status\": \"no_reply\"}")
    
    elif args.command == "history":
        dialog = load_dialog()
        limit = min(args.limit, len(dialog))
        print(json.dumps(dialog[-limit:], ensure_ascii=False, indent=2))
    
    elif args.command == "clear":
        result = clear_dialog()
        print(json.dumps(result, ensure_ascii=False, indent=2))
    
    elif args.command == "simulate":
        entry = simulate_nanoclaw_reply(args.message)
        print(f"✅ 已模擬 NanoClaw 回覆: {json.dumps(entry, ensure_ascii=False)}")