#!/usr/bin/env python3
"""
瑟喵 Telegram 整合接口
讓瑟喵能夠通過 function calling 調用 Telegram 功能
"""

import os
import asyncio
import json
from typing import Dict, List, Optional, Any
import logging

# 本地導入
from telegram_skill import SemiaoTelegramSkill, check_channel_access, test_connection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SemiaoTelegramIntegration:
    """瑟喵 Telegram 整合類"""
    
    def __init__(self):
        self.skill = None
        self.initialized = False
        
    async def initialize(self):
        """初始化"""
        try:
            self.skill = SemiaoTelegramSkill()
            self.initialized = await self.skill.initialize()
            return self.initialized
        except Exception as e:
            logger.error(f"初始化失敗: {e}")
            return False
    
    async def get_channel_status(self) -> Dict[str, Any]:
        """獲取頻道狀態"""
        if not self.initialized:
            await self.initialize()
        
        if not self.initialized:
            return {"error": "Telegram 技能未初始化"}
        
        try:
            # 檢查頻道訪問
            channel_url = "https://t.me/c/3681073163?boost"
            info = await check_channel_access(channel_url)
            
            if "error" in info:
                return {
                    "status": "disconnected",
                    "message": "無法訪問頻道",
                    "details": info["error"],
                    "setup_required": True
                }
            
            # 獲取最近訊息
            messages = await self.skill.get_recent_messages(limit=5)
            
            return {
                "status": "connected",
                "channel_info": info,
                "recent_messages": messages if isinstance(messages, list) else [],
                "is_admin": info.get("is_admin", False),
                "message_count": len(messages) if isinstance(messages, list) else 0
            }
            
        except Exception as e:
            logger.error(f"獲取狀態失敗: {e}")
            return {"error": str(e)}
    
    async def post_to_channel(self, content: str, image_path: Optional[str] = None) -> Dict[str, Any]:
        """發布內容到頻道"""
        if not self.initialized:
            await self.initialize()
        
        if not self.initialized:
            return {"error": "Telegram 技能未初始化"}
        
        try:
            result = await self.skill.send_message(content, image_path)
            return result
        except Exception as e:
            logger.error(f"發布失敗: {e}")
            return {"error": str(e)}
    
    async def monitor_and_process(self, callback_url: Optional[str] = None) -> Dict[str, Any]:
        """監聽頻道並處理新訊息"""
        if not self.initialized:
            await self.initialize()
        
        if not self.initialized:
            return {"error": "Telegram 技能未初始化"}
        
        try:
            async def process_message(message_data: Dict):
                """處理新訊息的回調函數"""
                logger.info(f"收到新訊息: {message_data}")
                
                # 這裡可以添加處理邏輯，例如：
                # 1. 分析訊息內容
                # 2. 調用瑟喵的 NSFW 生圖功能
                # 3. 自動回覆等
                
                # 示例：如果訊息包含「畫圖」關鍵字，自動生成圖片
                text = message_data.get("text", "").lower()
                if "畫圖" in text or "generate" in text or "draw" in text:
                    # 提取提示詞
                    prompt = text.replace("畫圖", "").replace("generate", "").replace("draw", "").strip()
                    if prompt:
                        logger.info(f"檢測到生圖請求: {prompt}")
                        # 這裡可以調用瑟喵的生圖功能
                        # await generate_and_post_image(prompt)
            
            # 開始監聽
            result = await self.skill.monitor_channel(process_message)
            return result
            
        except Exception as e:
            logger.error(f"監聽失敗: {e}")
            return {"error": str(e)}
    
    async def get_channel_analytics(self, days: int = 7) -> Dict[str, Any]:
        """獲取頻道分析數據"""
        if not self.initialized:
            await self.initialize()
        
        if not self.initialized:
            return {"error": "Telegram 技能未初始化"}
        
        try:
            # 獲取更多訊息進行分析
            messages = await self.skill.get_recent_messages(limit=100)
            
            if not isinstance(messages, list):
                return {"error": "無法獲取訊息"}
            
            # 簡單分析
            total_messages = len(messages)
            messages_with_media = sum(1 for msg in messages if msg.get("has_media") or msg.get("has_photo"))
            
            # 按日期分組
            from collections import defaultdict
            daily_counts = defaultdict(int)
            
            for msg in messages:
                date_str = msg.get("date", "").split("T")[0] if msg.get("date") else "unknown"
                daily_counts[date_str] += 1
            
            return {
                "total_messages": total_messages,
                "messages_with_media": messages_with_media,
                "media_percentage": (messages_with_media / total_messages * 100) if total_messages > 0 else 0,
                "daily_counts": dict(daily_counts),
                "analysis_period_days": days
            }
            
        except Exception as e:
            logger.error(f"分析失敗: {e}")
            return {"error": str(e)}
    
    async def close(self):
        """關閉連接"""
        if self.skill:
            await self.skill.close()

# Function calling 接口
async def telegram_check_channel():
    """檢查頻道狀態（Function calling 接口）"""
    integration = SemiaoTelegramIntegration()
    result = await integration.get_channel_status()
    await integration.close()
    return json.dumps(result, ensure_ascii=False, indent=2)

async def telegram_post_message(content: str, image_path: Optional[str] = None):
    """發布訊息到頻道（Function calling 接口）"""
    integration = SemiaoTelegramIntegration()
    result = await integration.post_to_channel(content, image_path)
    await integration.close()
    return json.dumps(result, ensure_ascii=False, indent=2)

async def telegram_get_analytics(days: int = 7):
    """獲取頻道分析（Function calling 接口）"""
    integration = SemiaoTelegramIntegration()
    result = await integration.get_channel_analytics(days)
    await integration.close()
    return json.dumps(result, ensure_ascii=False, indent=2)

# 命令行接口
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="瑟喵 Telegram 整合接口")
    parser.add_argument("--check", action="store_true", help="檢查頻道狀態")
    parser.add_argument("--post", type=str, help="發布訊息到頻道")
    parser.add_argument("--image", type=str, help="圖片路徑（與 --post 一起使用）")
    parser.add_argument("--analytics", type=int, default=7, help="獲取分析數據（天數）")
    parser.add_argument("--monitor", action="store_true", help="開始監聽頻道")
    
    args = parser.parse_args()
    
    async def main():
        integration = SemiaoTelegramIntegration()
        
        if args.check:
            result = await integration.get_channel_status()
            print(json.dumps(result, ensure_ascii=False, indent=2))
        
        elif args.post:
            result = await integration.post_to_channel(args.post, args.image)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        
        elif args.analytics:
            result = await integration.get_channel_analytics(args.analytics)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        
        elif args.monitor:
            print("開始監聽頻道... (按 Ctrl+C 停止)")
            result = await integration.monitor_and_process()
            print(json.dumps(result, ensure_ascii=False, indent=2))
        
        else:
            # 默認檢查
            result = await integration.get_channel_status()
            print(json.dumps(result, ensure_ascii=False, indent=2))
        
        await integration.close()
    
    asyncio.run(main())