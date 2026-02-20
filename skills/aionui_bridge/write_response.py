#!/usr/bin/env python3
"""
NanoClaw → AionUI 回覆寫入器
當 NanoClaw 回覆訊息時，呼叫此腳本寫入共享狀態
"""

import sys
import os
import json
import time
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))

from aionui_bridge.bridge_config import get_config, BRIDGE_STATE_FILE, load_env

load_env()


def write_nanoclaw_response(
    response: str, original_message: str = "", msg_id: int = None
):
    """寫入 NanoClaw 的回覆到共享狀態"""
    config = get_config()

    try:
        with open(BRIDGE_STATE_FILE, "r") as f:
            state = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        state = {"messages": [], "last_update": None}

    entry = {
        "id": msg_id or int(time.time() * 1000),
        "sender": "nanoclaw",
        "content": response,
        "original_message": original_message,
        "timestamp": datetime.now().isoformat(),
    }

    state["messages"].append(entry)

    if len(state["messages"]) > config.max_history:
        state["messages"] = state["messages"][-config.max_history :]

    state["last_update"] = entry["timestamp"]

    with open(BRIDGE_STATE_FILE, "w") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

    return entry


def read_new_messages(since_id: int = 0) -> list:
    """讀取新的 NanoClaw 回覆"""
    try:
        with open(BRIDGE_STATE_FILE, "r") as f:
            state = json.load(f)

        messages = state.get("messages", [])
        return [
            m
            for m in messages
            if m.get("id", 0) > since_id and m.get("sender") == "nanoclaw"
        ]
    except (json.JSONDecodeError, FileNotFoundError):
        return []


def main():
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {"error": "Usage: write_response.py <response> [original_message]"}
            )
        )
        sys.exit(1)

    response = sys.argv[1]
    original = sys.argv[2] if len(sys.argv) > 2 else ""
    msg_id = int(sys.argv[3]) if len(sys.argv) > 3 else None

    entry = write_nanoclaw_response(response, original, msg_id)
    print(json.dumps({"status": "written", "entry": entry}, ensure_ascii=False))


if __name__ == "__main__":
    main()
