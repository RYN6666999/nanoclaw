#!/usr/bin/env python3
"""
AionUI → NanoClaw 訊息橋接工具
提供 MCP 工具介面，讓 AionUI 可以發送訊息到 NanoClaw
"""

import sys
import os
import json
import time
import requests
from datetime import datetime
from pathlib import Path

_BRIDGE_DIR = Path(__file__).parent
sys.path.insert(0, str(_BRIDGE_DIR))

from bridge_config import get_config, BRIDGE_STATE_FILE, load_env

load_env()


class NanoClawBridge:
    def __init__(self):
        self.config = get_config()
        self.state_file = BRIDGE_STATE_FILE
        self._init_state()

    def _init_state(self):
        if not os.path.exists(self.state_file):
            os.makedirs(os.path.dirname(self.state_file), exist_ok=True)
            self._save_state({"messages": [], "last_update": None})

    def _load_state(self):
        try:
            with open(self.state_file, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return {"messages": [], "last_update": None}

    def _save_state(self, state):
        with open(self.state_file, "w") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)

    def _add_message(self, sender, content, msg_id=None):
        state = self._load_state()
        entry = {
            "id": msg_id or int(time.time() * 1000),
            "sender": sender,
            "content": content,
            "timestamp": datetime.now().isoformat(),
        }
        state["messages"].append(entry)

        if len(state["messages"]) > self.config.max_history:
            state["messages"] = state["messages"][-self.config.max_history :]

        state["last_update"] = entry["timestamp"]
        self._save_state(state)
        return entry

    def send(self, message: str, wait_reply: bool = True) -> dict:
        """
        發送訊息到 NanoClaw
        """
        cfg = self.config.telegram

        url = f"https://api.telegram.org/bot{cfg.bot_token}/sendMessage"
        payload = {"chat_id": cfg.chat_id, "text": f"[AionUI]\n{message}"}

        try:
            response = requests.post(url, json=payload, timeout=30)
            response.raise_for_status()
            result = response.json()

            if not result.get("ok"):
                return {
                    "status": "error",
                    "error": f"Telegram API error: {result.get('description')}",
                }

            msg_id = result["result"]["message_id"]
            self._add_message("aionui", message, msg_id)

            if wait_reply:
                reply = self._wait_for_reply(msg_id)
                return {"status": "success", "message_id": msg_id, "reply": reply}

            return {"status": "success", "message_id": msg_id, "reply": None}

        except requests.exceptions.Timeout:
            return {"status": "error", "error": "Request timeout"}
        except requests.exceptions.RequestException as e:
            return {"status": "error", "error": str(e)}
        except Exception as e:
            return {"status": "error", "error": f"Unexpected: {str(e)}"}

    def _wait_for_reply(self, after_msg_id: int, timeout: int = 120) -> dict:
        """
        輪詢等待 NanoClaw 回覆 - 改進版
        """
        cfg = self.config.telegram
        start_time = time.time()

        last_update_id = None

        while time.time() - start_time < timeout:
            try:
                url = f"https://api.telegram.org/bot{cfg.bot_token}/getUpdates"
                params = {"timeout": 10}

                if last_update_id:
                    params["offset"] = last_update_id + 1

                response = requests.get(url, params=params, timeout=15)
                response.raise_for_status()
                updates = response.json()

                if updates.get("ok") and updates.get("result"):
                    for update in updates["result"]:
                        last_update_id = update.get("update_id", last_update_id)

                        msg = update.get("message", {})
                        chat_id = msg.get("chat", {}).get("id")

                        if chat_id == int(cfg.chat_id):
                            text = msg.get("text", "")
                            from_bot = msg.get("from", {}).get("is_bot", False)

                            if text and not text.startswith("[AionUI]") and from_bot:
                                return {
                                    "message_id": msg.get("message_id"),
                                    "content": text,
                                }

                time.sleep(self.config.poll_interval)

            except Exception as e:
                if self.config.debug:
                    print(f"Polling error: {e}")
                time.sleep(5)

        return {"error": "Timeout waiting for reply"}

    def get_history(self, limit: int = 10) -> list:
        state = self._load_state()
        return state["messages"][-limit:]

    def clear_history(self):
        self._save_state({"messages": [], "last_update": None})
        return {"status": "cleared"}

    def health_check(self) -> dict:
        cfg = self.config.telegram

        try:
            url = f"https://api.telegram.org/bot{cfg.bot_token}/getMe"
            response = requests.get(url, timeout=10)
            bot_info = response.json()

            return {
                "status": "healthy" if bot_info.get("ok") else "unhealthy",
                "bot": bot_info.get("result", {}).get("username", "unknown"),
                "config": {"chat_id": cfg.chat_id, "has_token": bool(cfg.bot_token)},
            }
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: bridge.py <command> [args]"}))
        sys.exit(1)

    command = sys.argv[1]
    bridge = NanoClawBridge()

    if command == "send":
        message = sys.argv[2] if len(sys.argv) > 2 else ""
        wait = "--wait" in sys.argv
        result = bridge.send(message, wait_reply=wait)
        print(json.dumps(result, ensure_ascii=False))

    elif command == "history":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        result = bridge.get_history(limit)
        print(json.dumps(result, ensure_ascii=False))

    elif command == "clear":
        result = bridge.clear_history()
        print(json.dumps(result))

    elif command == "health":
        result = bridge.health_check()
        print(json.dumps(result, ensure_ascii=False))

    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))


if __name__ == "__main__":
    main()
