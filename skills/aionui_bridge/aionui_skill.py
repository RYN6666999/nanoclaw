#!/usr/bin/env python3
"""
AionUI Skill for NanoClaw Bridge
提供給 AionUI 使用的橋接 Skill
"""

import sys
import os
import json
import time
import subprocess
from pathlib import Path

_BRIDGE_DIR = Path(__file__).parent
sys.path.insert(0, str(_BRIDGE_DIR))

from aionui_to_nanoclaw import NanoClawBridge


def execute_bridge_command(command: str, *args) -> dict:
    """執行橋接命令"""
    bridge_script = _BRIDGE_DIR / "aionui_to_nanoclaw.py"

    cmd = ["python3", str(bridge_script), command] + list(args)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=180,
            env={**os.environ, "PYTHONPATH": str(_BRIDGE_DIR)},
        )

        if result.returncode == 0:
            return json.loads(result.stdout)
        else:
            return {"status": "error", "error": result.stderr}

    except subprocess.TimeoutExpired:
        return {"status": "error", "error": "Command timeout"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def bridge_send(message: str, wait_for_reply: bool = True) -> str:
    """橋接發送訊息"""
    result = execute_bridge_command("send", message, "--wait" if wait_for_reply else "")

    if result.get("status") == "success":
        if wait_for_reply and result.get("reply"):
            reply = result["reply"]
            return f"📤 已發送到 NanoClaw\n\n💬 NanoClaw 回覆：\n\n{reply.get('content', 'N/A')}"
        return f"📤 已發送到 NanoClaw (訊息 ID: {result.get('message_id')})"

    return f"❌ 發送失敗：{result.get('error', 'Unknown error')}"


def bridge_history(limit: int = 10) -> str:
    """獲取對話歷史"""
    result = execute_bridge_command("history", str(limit))

    if result and isinstance(result, list):
        lines = ["📜 對話歷史："]
        for msg in result[-5:]:
            sender = msg.get("sender", "unknown")
            content = msg.get("content", "")[:100]
            lines.append(f"\n[{sender}] {content}...")
        return "\n".join(lines)

    return "📜 無對話記錄"


def bridge_health() -> str:
    """健康檢查"""
    result = execute_bridge_command("health")

    if result.get("status") == "healthy":
        return f"✅ 橋接服務正常\n\n🤖 Bot: @{result.get('bot', 'N/A')}\n💬 Chat ID: {result.get('config', {}).get('chat_id', 'N/A')}"

    return f"❌ 服務異常：{result.get('error', 'Unknown')}"


def bridge_clear() -> str:
    """清除對話歷史"""
    result = execute_bridge_command("clear")
    return "✅ 對話歷史已清除" if result.get("status") == "cleared" else "❌ 清除失敗"


# Skill entry points for AionUI
SKILL_FUNCTIONS = {
    "send": bridge_send,
    "history": bridge_history,
    "health": bridge_health,
    "clear": bridge_clear,
}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: skill.py <function> [args]"}))
        sys.exit(1)

    func = sys.argv[1]

    if func == "send":
        message = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else ""
        print(bridge_send(message))

    elif func == "history":
        limit = int(sys.argv[2]) if len(sys.argv) > 2 else 10
        print(bridge_history(limit))

    elif func == "health":
        print(bridge_health())

    elif func == "clear":
        print(bridge_clear())

    else:
        print(json.dumps({"error": f"Unknown function: {func}"}))


if __name__ == "__main__":
    main()
