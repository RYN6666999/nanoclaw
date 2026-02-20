#!/usr/bin/env python3
"""
瑟喵的 Telegram 頻道操作技能
用於讀取和操作 @Se-Meow-box 頻道
"""

import os
import asyncio
import logging
from typing import List, Dict, Optional
from datetime import datetime

# Telegram 庫
from telegram import Bot, Update, Chat, Message
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from telethon import TelegramClient
from telethon.tl.types import Channel, Message as TLMessage

# 配置
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_API_ID = os.getenv("TELEGRAM_API_ID", "")
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH", "")
CHANNEL_USERNAME = "@Se-Meow-box"  # 您的頻道
CHANNEL_ID = -1003681073163  # 從 URL 提取的頻道 ID

# 設置日誌
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

class SemiaoTelegramSkill:
    """瑟喵的 Telegram 技能類"""
    
    def __init__(self):
        self.bot = None
        self.client = None
        self.channel_info = None
        
    async def initialize(self):
        """初始化 Telegram 連接"""
        try:
            # 初始化 Bot
            if TELEGRAM_BOT_TOKEN:
                self.bot = Bot(token=TELEGRAM_BOT_TOKEN)
                logger.info("Bot 初始化成功")
            
            # 初始化 Telethon Client (如果需要更強大的功能)
            if TELEGRAM_API_ID and TELEGRAM_API_HASH:
                self.client = TelegramClient(
                    'semiao_session',
                    int(TELEGRAM_API_ID),
                    TELEGRAM_API_HASH
                )
                await self.client.start()
                logger.info("Telethon Client 初始化成功")
                
            return True
        except Exception as e:
            logger.error(f"初始化失敗: {e}")
            return False
    
    async def get_channel_info(self, channel_identifier: str = None):
        """獲取頻道資訊"""
        try:
            if not self.bot:
                return {"error": "Bot 未初始化"}
            
            channel_id = channel_identifier or CHANNEL_USERNAME
            
            # 獲取頻道資訊
            chat = await self.bot.get_chat(channel_id)
            
            self.channel_info = {
                "id": chat.id,
                "title": chat.title,
                "username": chat.username,
                "type": chat.type,
                "description": chat.description,
                "member_count": chat.get_member_count() if hasattr(chat, 'get_member_count') else "未知",
                "is_admin": False  # 稍後檢查
            }
            
            # 檢查管理員權限
            admins = await self.bot.get_chat_administrators(chat.id)
            bot_id = (await self.bot.get_me()).id
            for admin in admins:
                if admin.user.id == bot_id:
                    self.channel_info["is_admin"] = True
                    self.channel_info["admin_permissions"] = {
                        "can_post_messages": admin.can_post_messages,
                        "can_edit_messages": admin.can_edit_messages,
                        "can_delete_messages": admin.can_delete_messages,
                        "can_invite_users": admin.can_invite_users,
                        "can_restrict_members": admin.can_restrict_members,
                        "can_promote_members": admin.can_promote_members,
                        "can_change_info": admin.can_change_info,
                        "can_pin_messages": admin.can_pin_messages
                    }
                    break
            
            return self.channel_info
            
        except Exception as e:
            logger.error(f"獲取頻道資訊失敗: {e}")
            return {"error": str(e)}
    
    async def get_recent_messages(self, limit: int = 20):
        """獲取最近的頻道訊息"""
        try:
            if not self.bot or not self.channel_info:
                await self.get_channel_info()
            
            messages = []
            
            # 使用 Bot API 獲取訊息
            updates = await self.bot.get_updates(offset=-1, limit=100, timeout=10)
            
            for update in updates:
                if update.channel_post and update.channel_post.chat.id == self.channel_info["id"]:
                    msg = update.channel_post
                    messages.append({
                        "id": msg.message_id,
                        "text": msg.text or msg.caption or "",
                        "date": msg.date.isoformat(),
                        "has_photo": bool(msg.photo),
                        "has_video": bool(msg.video),
                        "has_document": bool(msg.document),
                        "sender": "頻道"
                    })
            
            # 如果使用 Telethon，可以獲取更多歷史訊息
            if self.client and len(messages) < limit:
                try:
                    async for message in self.client.iter_messages(
                        self.channel_info["id"],
                        limit=limit - len(messages)
                    ):
                        if isinstance(message, TLMessage):
                            messages.append({
                                "id": message.id,
                                "text": message.text or message.message or "",
                                "date": message.date.isoformat() if message.date else "",
                                "has_media": bool(message.media),
                                "sender": "頻道"
                            })
                except Exception as e:
                    logger.warning(f"Telethon 獲取訊息失敗: {e}")
            
            return sorted(messages, key=lambda x: x.get("date", ""), reverse=True)[:limit]
            
        except Exception as e:
            logger.error(f"獲取訊息失敗: {e}")
            return {"error": str(e)}
    
    async def send_message(self, text: str, image_path: str = None):
        """發送訊息到頻道"""
        try:
            if not self.bot:
                return {"error": "Bot 未初始化"}
            
            if not self.channel_info:
                await self.get_channel_info()
            
            if image_path and os.path.exists(image_path):
                # 發送圖片
                with open(image_path, 'rb') as photo:
                    message = await self.bot.send_photo(
                        chat_id=self.channel_info["id"],
                        photo=photo,
                        caption=text[:1024] if text else ""
                    )
            else:
                # 發送純文字
                message = await self.bot.send_message(
                    chat_id=self.channel_info["id"],
                    text=text
                )
            
            return {
                "success": True,
                "message_id": message.message_id,
                "date": message.date.isoformat()
            }
            
        except Exception as e:
            logger.error(f"發送訊息失敗: {e}")
            return {"error": str(e)}
    
    async def monitor_channel(self, callback_function):
        """監聽頻道新訊息（回調模式）"""
        try:
            if not self.bot:
                return {"error": "Bot 未初始化"}
            
            # 設置更新處理器
            application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
            
            async def channel_post_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
                """處理頻道新訊息"""
                if update.channel_post and update.channel_post.chat.id == self.channel_info["id"]:
                    message_data = {
                        "id": update.channel_post.message_id,
                        "text": update.channel_post.text or update.channel_post.caption or "",
                        "date": update.channel_post.date.isoformat(),
                        "has_media": bool(update.channel_post.photo or update.channel_post.video or update.channel_post.document)
                    }
                    
                    # 調用回調函數
                    if callback_function:
                        await callback_function(message_data)
            
            # 添加處理器
            application.add_handler(MessageHandler(filters.ChatType.CHANNEL, channel_post_handler))
            
            # 開始監聽
            await application.initialize()
            await application.start()
            await application.updater.start_polling()
            
            return {"success": True, "status": "監聽中"}
            
        except Exception as e:
            logger.error(f"監聽頻道失敗: {e}")
            return {"error": str(e)}
    
    async def close(self):
        """關閉連接"""
        try:
            if self.client:
                await self.client.disconnect()
            logger.info("Telegram 連接已關閉")
        except Exception as e:
            logger.error(f"關閉連接失敗: {e}")

# 工具函數
async def check_channel_access(channel_url: str):
    """檢查頻道訪問權限"""
    skill = SemiaoTelegramSkill()
    initialized = await skill.initialize()
    
    if not initialized:
        return {"error": "初始化失敗"}
    
    # 從 URL 提取頻道 ID
    import re
    match = re.search(r'c/(\d+)', channel_url)
    if match:
        channel_id = f"-100{match.group(1)}"
    else:
        channel_id = CHANNEL_USERNAME
    
    info = await skill.get_channel_info(channel_id)
    await skill.close()
    
    return info

async def test_connection():
    """測試連接"""
    skill = SemiaoTelegramSkill()
    initialized = await skill.initialize()
    
    result = {
        "bot_initialized": bool(skill.bot),
        "client_initialized": bool(skill.client),
        "channel_info": None
    }
    
    if initialized:
        result["channel_info"] = await skill.get_channel_info()
    
    await skill.close()
    return result

if __name__ == "__main__":
    # 測試腳本
    async def main():
        print("=== 瑟喵 Telegram 技能測試 ===")
        
        # 測試連接
        test_result = await test_connection()
        print(f"連接測試: {test_result}")
        
        # 檢查頻道訪問
        channel_url = "https://t.me/c/3681073163?boost"
        access_info = await check_channel_access(channel_url)
        print(f"頻道訪問檢查: {access_info}")
        
        if access_info and "error" not in access_info:
            # 獲取最近訊息
            skill = SemiaoTelegramSkill()
            await skill.initialize()
            await skill.get_channel_info()
            
            messages = await skill.get_recent_messages(limit=5)
            print(f"最近訊息 ({len(messages) if isinstance(messages, list) else 0} 條):")
            for msg in (messages if isinstance(messages, list) else []):
                print(f"  - {msg.get('date', '')}: {msg.get('text', '')[:50]}...")
            
            await skill.close()
    
    asyncio.run(main())