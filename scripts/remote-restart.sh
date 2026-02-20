#!/bin/bash
# 遠端重啟腳本（給 iOS Shortcuts 調用）
# 用法: ssh user@host 'bash -s' < remote-restart.sh

export PATH="/opt/homebrew/bin:$PATH"

echo "🔄 正在重啟 NanoClaw..."

# 1. 檢查 PM2 狀態
if ! pm2 list | grep -q "nanoclaw"; then
  echo "❌ PM2 無 nanoclaw 進程，嘗試啟動..."
  cd /Users/ryan/nanoclaw
  pm2 start ecosystem.config.cjs
  exit 0
fi

# 2. 重啟
pm2 restart nanoclaw

# 3. 驗證
sleep 3
if pm2 list | grep -q "nanoclaw.*online"; then
  echo "✅ 重啟成功"
  pm2 list | grep nanoclaw
else
  echo "❌ 重啟失敗，查看日誌:"
  tail -20 /tmp/nanoclaw-live.log
  exit 1
fi
