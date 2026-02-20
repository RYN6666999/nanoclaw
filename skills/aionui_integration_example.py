#!/usr/bin/env python3
"""
AionUI 整合範例
展示如何在 AionUI 的 OpenClaw 介面中使用 NanoClaw
"""

import sys
import json
import time
from pathlib import Path

# 添加橋接腳本路徑
sys.path.append('/Users/ryan/nanoclaw/skills')

# 方法 1: 直接導入橋接模組
try:
    from aionui_bidirectional import (
        send_to_nanoclaw,
        get_latest_reply,
        check_for_replies,
        get_unread_replies,
        clear_dialog
    )
    BRIDGE_AVAILABLE = True
except ImportError:
    BRIDGE_AVAILABLE = False
    print("⚠️ 無法導入橋接模組，請確保路徑正確")

# 方法 2: 使用子進程調用
import subprocess

def call_bridge_command(command, *args):
    """通過命令行調用橋接腳本"""
    cmd = ['python3', '/Users/ryan/nanoclaw/skills/aionui_bidirectional.py', command] + list(args)
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return {"raw_output": result.stdout}
    else:
        return {"error": result.stderr, "returncode": result.returncode}

class NanoClawInterface:
    """AionUI 中的 NanoClaw 介面類別"""
    
    def __init__(self, use_direct_import=True):
        """
        初始化介面
        use_direct_import: True=直接導入, False=使用命令行
        """
        self.use_direct_import = use_direct_import
        self.last_seen_id = 0  # 最後看到的回覆 ID
        
        if use_direct_import and not BRIDGE_AVAILABLE:
            print("⚠️ 切換到命令行模式")
            self.use_direct_import = False
    
    def ask(self, question):
        """向 NanoClaw 提問"""
        print(f"📤 發送問題: {question}")
        
        if self.use_direct_import:
            result = send_to_nanoclaw(question)
        else:
            result = call_bridge_command("send", question)
        
        if result.get("status") == "success":
            self.last_seen_id = result.get("message_id", self.last_seen_id)
            print(f"✅ {result.get('text', '已發送')}")
        else:
            print(f"❌ 發送失敗: {result.get('text', '未知錯誤')}")
        
        return result
    
    def check_replies(self, wait_seconds=0):
        """檢查回覆，可選等待時間"""
        if wait_seconds > 0:
            print(f"⏳ 等待 {wait_seconds} 秒檢查回覆...")
            time.sleep(wait_seconds)
        
        if self.use_direct_import:
            status = check_for_replies()
            unread = get_unread_replies(self.last_seen_id)
        else:
            status = call_bridge_command("check")
            # 獲取所有回覆再篩選
            history = call_bridge_command("history", "--limit", "50")
            if isinstance(history, list):
                unread = [msg for msg in history 
                         if msg.get("from") == "nanoclaw" 
                         and msg.get("message_id", 0) > self.last_seen_id]
            else:
                unread = []
        
        print(f"📊 狀態: {status.get('total_messages', 0)} 則訊息")
        print(f"   AionUI: {status.get('from_aionui', 0)}")
        print(f"   NanoClaw: {status.get('from_nanoclaw', 0)}")
        
        if unread:
            print(f"📨 有 {len(unread)} 則新回覆")
            # 更新最後看到的 ID
            for reply in unread:
                reply_id = reply.get("message_id", 0)
                if reply_id > self.last_seen_id:
                    self.last_seen_id = reply_id
        
        return {"status": status, "unread": unread}
    
    def get_latest_reply(self):
        """獲取最新回覆"""
        if self.use_direct_import:
            reply = get_latest_reply()
        else:
            reply = call_bridge_command("get")
            if reply.get("status") == "no_reply":
                reply = None
        
        if reply:
            print(f"📥 最新回覆來自 {reply.get('from', 'unknown')}:")
            print(f"   {reply.get('message', '')}")
            print(f"   時間: {reply.get('timestamp', '')}")
            return reply
        else:
            print("📭 暫無回覆")
            return None
    
    def wait_for_reply(self, timeout=30, poll_interval=2):
        """等待 NanoClaw 回覆"""
        print(f"⏳ 等待回覆 (最多 {timeout} 秒)...")
        
        start_time = time.time()
        attempts = 0
        
        while time.time() - start_time < timeout:
            attempts += 1
            print(f"  嘗試 {attempts}...", end="\r")
            
            result = self.check_replies()
            unread = result.get("unread", [])
            
            if unread:
                print(f"\n✅ 收到 {len(unread)} 則新回覆")
                for reply in unread:
                    print(f"\n📨 {reply.get('from', 'unknown')}:")
                    print(f"   {reply.get('message', '')}")
                return unread
            
            time.sleep(poll_interval)
        
        print(f"\n⏰ 超時 ({timeout} 秒)，未收到回覆")
        return []
    
    def interactive_chat(self):
        """互動式聊天模式"""
        print("🤖 NanoClaw 互動式聊天模式")
        print("  輸入 'quit' 或 'exit' 退出")
        print("  輸入 'status' 查看狀態")
        print("  輸入 'clear' 清空歷史")
        print("-" * 40)
        
        while True:
            # 先檢查是否有新回覆
            self.check_replies()
            
            # 獲取用戶輸入
            user_input = input("\n💬 你的訊息: ").strip()
            
            if user_input.lower() in ['quit', 'exit', 'q']:
                print("👋 結束聊天")
                break
            elif user_input.lower() == 'status':
                self.check_replies()
                continue
            elif user_input.lower() == 'clear':
                if self.use_direct_import:
                    clear_dialog()
                else:
                    call_bridge_command("clear")
                print("🗑️ 對話歷史已清空")
                continue
            elif not user_input:
                continue
            
            # 發送訊息
            self.ask(user_input)
            
            # 等待回覆
            print("⏳ 等待 NanoClaw 回覆...")
            replies = self.wait_for_reply(timeout=20)
            
            if not replies:
                print("💡 提示: 回覆可能已在 Telegram 中，請查看 Telegram")

# 使用範例
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="AionUI NanoClaw 整合範例")
    parser.add_argument("--mode", choices=["test", "chat", "single"], default="test",
                       help="執行模式: test=測試, chat=互動聊天, single=單次提問")
    parser.add_argument("--question", help="單次提問的問題")
    parser.add_argument("--cmd", action="store_true", help="使用命令行模式而非直接導入")
    
    args = parser.parse_args()
    
    # 創建介面
    nano = NanoClawInterface(use_direct_import=not args.cmd)
    
    if args.mode == "test":
        print("🧪 執行連線測試...")
        
        # 測試 1: 發送測試訊息
        print("\n1. 發送測試訊息...")
        result = nano.ask("測試連線，請回覆 '收到'")
        
        # 測試 2: 檢查狀態
        print("\n2. 檢查通訊狀態...")
        nano.check_replies()
        
        # 測試 3: 等待回覆
        print("\n3. 等待回覆 (10秒)...")
        replies = nano.wait_for_reply(timeout=10)
        
        if replies:
            print("✅ 連線測試成功！")
        else:
            print("⚠️ 未收到即時回覆，請檢查 Telegram")
        
        # 測試 4: 顯示最新回覆
        print("\n4. 顯示最新回覆...")
        nano.get_latest_reply()
    
    elif args.mode == "chat":
        nano.interactive_chat()
    
    elif args.mode == "single":
        if not args.question:
            print("❌ 請使用 --question 參數指定問題")
            sys.exit(1)
        
        print(f"📤 發送單次提問: {args.question}")
        nano.ask(args.question)
        
        print("\n⏳ 等待回覆...")
        replies = nano.wait_for_reply(timeout=15)
        
        if replies:
            print("\n✅ 收到回覆:")
            for reply in replies:
                print(f"\n{reply.get('from', 'unknown')}: {reply.get('message', '')}")
        else:
            print("\n💡 提示: 請在 Telegram 中查看回覆")