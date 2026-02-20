#!/bin/bash
# NanoClaw 健康診斷 + 自動修復 (PM2 版)

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

STATE_FILE="$HOME/.nanoclaw-last-check"

# 顏色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔍 NanoClaw 健康檢查 ($(date))"
echo "---"

# 1. 檢查兩個 bot 進程
BOTS=("nanoclaw-SeMeow" "nanoclaw-asis")
for BOT in "${BOTS[@]}"; do
  STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data:
    if p['name'] == '$BOT':
        print(p.get('pm2_env', {}).get('status', 'unknown'))
        break
else:
    print('not_found')
" 2>/dev/null || echo "pm2_error")

  if [[ "$STATUS" == "online" ]]; then
    echo -e "${GREEN}✓ ${BOT} 運行中${NC}"
    PID=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
for p in json.load(sys.stdin):
    if p['name'] == '$BOT': print(p['pid']); break
" 2>/dev/null)
    echo "  PID: $PID"
  elif [[ "$STATUS" == "not_found" ]]; then
    echo -e "${RED}✗ ${BOT} 未註冊，正在啟動...${NC}"
    cd /Users/ryan/nanoclaw
    if [[ "$BOT" == "nanoclaw-SeMeow" ]]; then
      pm2 start ecosystem-SeMeow.config.cjs
    else
      pm2 start ecosystem-asis.config.cjs
    fi
  else
    echo -e "${RED}✗ ${BOT} 狀態: ${STATUS}，正在重啟...${NC}"
    pm2 restart "$BOT"
  fi
done

# 2. 檢查日誌錯誤
for BOT in "${BOTS[@]}"; do
  LOG_FILE="/tmp/${BOT}-out.log"
  if [[ -f "$LOG_FILE" ]]; then
    # 只用小寫的 nanoclaw 名稱對應 log 路徑
    ERRORS=$(tail -100 "$LOG_FILE" 2>/dev/null | grep -ciE "error|fatal|exception|econnreset|etimedout" || true)
    if [[ $ERRORS -gt 5 ]]; then
      echo -e "${YELLOW}⚠ ${BOT} 最近 100 行有 $ERRORS 個錯誤${NC}"
    else
      echo -e "${GREEN}✓ ${BOT} 日誌正常${NC}"
    fi
  fi
done

# 3. 檢查 Telegram API 連線
echo "🌐 測試 Telegram API..."
for ENV_FILE in "/Users/ryan/nanoclaw/.env.SeMeow" "/Users/ryan/nanoclaw/.env.asis"; do
  if [[ -f "$ENV_FILE" ]]; then
    BOT_NAME=$(grep ASSISTANT_NAME "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'" | xargs)
    TG_TOKEN=$(grep TELEGRAM_BOT_TOKEN "$ENV_FILE" | cut -d= -f2 | tr -d '"' | tr -d "'" | xargs)
    if [[ -n "$TG_TOKEN" ]]; then
      if curl -s --max-time 10 "https://api.telegram.org/bot${TG_TOKEN}/getMe" | grep -q '"ok":true'; then
        echo -e "${GREEN}✓ ${BOT_NAME} Telegram API 可達${NC}"
      else
        echo -e "${RED}✗ ${BOT_NAME} Telegram API 無回應${NC}"
      fi
    fi
  fi
done

# 4. 記錄檢查時間
echo "$(date +%s)" > "$STATE_FILE"

echo "---"
echo "✅ 健康檢查完成"
