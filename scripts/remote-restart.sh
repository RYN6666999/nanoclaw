#!/bin/bash
# 遠端重啟腳本（給 iOS Shortcuts 調用）
# 用法: ssh user@host 'bash -s' < remote-restart.sh

export PATH="/opt/homebrew/bin:$PATH"

PROJECT_DIR="/Users/ryan/nanoclaw"
BOTS=("nanoclaw-semeow" "nanoclaw-hermes")

echo "🔄 正在重啟 NanoClaw..."

# 1. 檢查 PM2 狀態
if ! pm2 list | grep -q "nanoclaw"; then
  echo "❌ PM2 無 nanoclaw 進程，嘗試啟動..."
  cd "$PROJECT_DIR"
  pm2 start ecosystem-semeow.cjs
  pm2 start ecosystem-hermes.cjs
  exit 0
fi

# 2. 重啟所有 nanoclaw bots
for BOT in "${BOTS[@]}"; do
  pm2 restart "$BOT" 2>/dev/null || echo "⚠ $BOT 不存在，跳過"
done

# 3. 驗證
sleep 3
if pm2 list | grep -q "nanoclaw.*online"; then
  echo "✅ 重啟成功"
  pm2 list | grep nanoclaw
else
  echo "❌ 重啟失敗，查看日誌:"
  tail -20 /tmp/nanoclaw-semeow-out.log
  tail -20 /tmp/nanoclaw-hermes-out.log
  exit 1
fi
