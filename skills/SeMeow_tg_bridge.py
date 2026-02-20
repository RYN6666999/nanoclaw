#!/usr/bin/env python3
import os
import sys
import sqlite3
import json
import requests
from datetime import datetime

# Configuration
NANOCLAW_ROOT = "/Users/ryan/nanoclaw"
DB_PATH = os.path.join(NANOCLAW_ROOT, "store", "messages.db")
BOT_TOKEN = "8376821082:AAGwxVnqh-sx8bMuoLQ81suIjUDvtyEBXq0"
CHAT_ID = "1469326872"

def send_to_tg(message: str) -> dict:
    """Sends a message to the Telegram bot chat."""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": message,
        "parse_mode": "Markdown"
    }
    try:
        response = requests.post(url, json=payload, timeout=10)
        return response.json()
    except Exception as e:
        return {"ok": False, "description": str(e)}

def get_tg_history(limit: int = 5) -> list:
    """Fetches recent history from the shared SQLite database."""
    if not os.path.exists(DB_PATH):
        return []
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # We look for messages in the specific chat
        # chat_jid is stored as 'tg:CHAT_ID' in NanoClaw
        jid = f"tg:{CHAT_ID}"
        
        cursor.execute("""
            SELECT sender_name, content, timestamp, is_from_me 
            FROM messages 
            WHERE chat_jid = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        """, (jid, limit))
        
        rows = cursor.fetchall()
        conn.close()
        
        history = []
        for row in rows:
            history.append({
                "sender": row[0],
                "content": row[1],
                "time": row[2],
                "is_bot": bool(row[3])
            })
        return history
    except Exception as e:
        print(f"Error reading DB: {e}")
        return []

def format_history_for_ui(history: list) -> str:
    """Formats history into a nice string for AionUI display."""
    if not history:
        return "📭 目前暫無 Telegram 訊息記錄。"
    
    lines = ["📱 **Telegram 最近通訊紀錄:**"]
    # Show in chronological order (database returned DESC, so we reverse)
    for msg in reversed(history):
        prefix = "🤖" if msg["is_bot"] else "👤"
        name = msg["sender"]
        content = msg["content"]
        # Format time to HH:MM
        try:
            dt = datetime.fromisoformat(msg["time"].replace('Z', '+00:00'))
            timestr = dt.strftime("%H:%M")
        except:
            timestr = msg["time"]
            
        lines.append(f"[{timestr}] {prefix} {name}: {content}")
        
    return "\n".join(lines)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python SeMeow_tg_bridge.py [send|history|sync]")
        sys.exit(1)
        
    cmd = sys.argv[1]
    
    if cmd == "send":
        msg = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else "Hello from AionUI!"
        res = send_to_tg(msg)
        print(json.dumps(res, indent=2, ensure_ascii=False))
        
    elif cmd == "history":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        history = get_tg_history(limit)
        print(json.dumps(history, indent=2, ensure_ascii=False))
        
    elif cmd == "sync":
        history = get_tg_history(10)
        print(format_history_for_ui(history))
    
    else:
        print(f"Unknown command: {cmd}")
