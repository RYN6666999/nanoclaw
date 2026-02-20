#!/bin/bash
# 瑟喵 Telegram 技能安裝腳本

echo "🐾 瑟喵 Telegram 技能安裝開始..."

# 檢查虛擬環境
if [ ! -d "~/telegram_bot_env" ]; then
    echo "創建虛擬環境..."
    python3 -m venv ~/telegram_bot_env
fi

# 激活虛擬環境
source ~/telegram_bot_env/bin/activate

# 安裝依賴
echo "安裝 Python 依賴..."
pip install python-telegram-bot telethon

# 創建配置文件
echo "創建配置文件..."
cat > ~/telegram_bot_env/config.env << EOF
# 瑟喵 Telegram 配置
# 請從 @BotFather 獲取 Bot Token
TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN_HERE"

# 從 https://my.telegram.org 獲取 API ID 和 Hash
TELEGRAM_API_ID="YOUR_API_ID_HERE"
TELEGRAM_API_HASH="YOUR_API_HASH_HERE"

# 目標頻道
TARGET_CHANNEL="@Se-Meow-box"
CHANNEL_ID="-1003681073163"
EOF

# 創建啟動腳本
cat > ~/telegram_bot_env/start_monitor.sh << 'EOF'
#!/bin/bash
source ~/telegram_bot_env/bin/activate
python ~/telegram_bot_env/telegram_skill.py
EOF

chmod +x ~/telegram_bot_env/start_monitor.sh

# 創建測試腳本
cat > ~/telegram_bot_env/test_skill.py << 'EOF'
#!/usr/bin/env python3
import asyncio
import sys
import os

# 添加路徑
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from telegram_skill import test_connection, check_channel_access

async def main():
    print("=== 瑟喵 Telegram 技能測試 ===")
    
    # 測試基本連接
    print("\n1. 測試連接...")
    conn_result = await test_connection()
    print(f"結果: {conn_result}")
    
    # 測試頻道訪問
    print("\n2. 測試頻道訪問...")
    channel_url = "https://t.me/c/3681073163?boost"
    access_result = await check_channel_access(channel_url)
    print(f"結果: {access_result}")
    
    if "error" in access_result:
        print("\n⚠️  需要配置環境變數:")
        print("1. 從 @BotFather 獲取 Bot Token")
        print("2. 從 https://my.telegram.org 獲取 API ID 和 Hash")
        print("3. 編輯 ~/telegram_bot_env/config.env 文件")
    else:
        print("\n✅ 技能安裝成功！")

if __name__ == "__main__":
    asyncio.run(main())
EOF

chmod +x ~/telegram_bot_env/test_skill.py

echo "🐾 安裝完成！"
echo ""
echo "下一步："
echo "1. 從 @BotFather 創建 Bot 並獲取 Token"
echo "2. 從 https://my.telegram.org 獲取 API ID 和 Hash"
echo "3. 編輯 ~/telegram_bot_env/config.env 文件"
echo "4. 運行測試: source ~/telegram_bot_env/bin/activate && python ~/telegram_bot_env/test_skill.py"
echo ""
echo "🐾 瑟喵準備好為您服務了！"