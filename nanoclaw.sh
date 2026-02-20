#!/bin/bash
# NanoClaw 單實例管理腳本
# 確保只有一個 NanoClaw 實例在運行

NANOCLAW_DIR="/Users/ryan/nanoclaw"
LOG_FILE="/tmp/nanoclaw-live.log"
PID_FILE="/tmp/nanoclaw.pid"

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🤖 NanoClaw 單實例管理器"
echo "========================"
echo ""

# 函數: 檢查運行狀態
check_status() {
    # Only count the actual tsx process, not the npm wrapper
    local pids=$(ps aux | grep "tsx src/index.ts" | grep -v grep | awk '{print $2}')
    local count=$(echo "$pids" | grep -v '^$' | wc -l | tr -d ' ')
    
    if [ "$count" -eq 0 ]; then
        echo -e "${RED}❌ NanoClaw 未運行${NC}"
        return 1
    elif [ "$count" -eq 1 ]; then
        echo -e "${GREEN}✅ NanoClaw 正常運行 (PID: $pids)${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  檢測到 $count 個 NanoClaw 實例 (衝突!)${NC}"
        echo "   PIDs: $pids"
        return 2
    fi
}

# 函數: 停止所有實例
stop_all() {
    echo "🛑 停止所有 NanoClaw 實例..."
    
    local pids=$(ps aux | grep "src/index.ts" | grep -v grep | awk '{print $2}')
    if [ -z "$pids" ]; then
        echo "   沒有運行中的實例"
        return 0
    fi
    
    echo "$pids" | while read pid; do
        if [ -n "$pid" ]; then
            echo "   停止 PID $pid..."
            kill -15 "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null
        fi
    done
    
    # 等待進程完全停止
    sleep 2
    
    # 驗證是否全部停止
    local remaining=$(ps aux | grep "src/index.ts" | grep -v grep | wc -l | tr -d ' ')
    if [ "$remaining" -eq 0 ]; then
        echo -e "${GREEN}✅ 所有實例已停止${NC}"
        rm -f "$PID_FILE"
        return 0
    else
        echo -e "${RED}❌ 部分實例仍在運行，使用 SIGKILL 強制停止...${NC}"
        pkill -9 -f "src/index.ts"
        sleep 1
        rm -f "$PID_FILE"
        return 0
    fi
}

# 函數: 啟動單一實例
start_single() {
    echo "🚀 啟動 NanoClaw (單實例模式)..."
    
    # 確保沒有其他實例
    local existing=$(ps aux | grep "src/index.ts" | grep -v grep | wc -l | tr -d ' ')
    if [ "$existing" -gt 0 ]; then
        echo -e "${YELLOW}⚠️  檢測到現有實例，先停止...${NC}"
        stop_all
    fi
    
    # 清理舊日誌
    if [ -f "$LOG_FILE" ]; then
        mv "$LOG_FILE" "$LOG_FILE.old"
    fi
    
    # 啟動新實例
    cd "$NANOCLAW_DIR"
    nohup npm run dev > "$LOG_FILE" 2>&1 &
    local new_pid=$!
    echo "$new_pid" > "$PID_FILE"
    
    # 等待啟動
    sleep 3
    
    # 驗證啟動
    if ps -p $new_pid > /dev/null 2>&1; then
        echo -e "${GREEN}✅ NanoClaw 已啟動 (PID: $new_pid)${NC}"
        echo ""
        echo "📝 查看日誌: tail -f $LOG_FILE"
        echo "🔍 檢查狀態: $0 status"
        return 0
    else
        echo -e "${RED}❌ 啟動失敗，請檢查日誌: $LOG_FILE${NC}"
        return 1
    fi
}

# 函數: 重啟 (確保單實例)
restart() {
    echo "🔄 重啟 NanoClaw..."
    stop_all
    sleep 2
    start_single
}

# 主邏輯
case "${1:-status}" in
    status)
        check_status
        ;;
    start)
        start_single
        ;;
    stop)
        stop_all
        ;;
    restart)
        restart
        ;;
    fix)
        echo "🔧 修復多實例衝突..."
        stop_all
        sleep 2
        start_single
        ;;
    logs)
        echo "📝 即時日誌 (按 Ctrl+C 停止):"
        echo "----------------------------"
        tail -f "$LOG_FILE"
        ;;
    *)
        echo "用法: $0 {status|start|stop|restart|fix|logs}"
        echo ""
        echo "指令說明:"
        echo "  status   - 檢查運行狀態"
        echo "  start    - 啟動 (確保單實例)"
        echo "  stop     - 停止所有實例"
        echo "  restart  - 重啟"
        echo "  fix      - 修復多實例衝突"
        echo "  logs     - 查看即時日誌"
        exit 1
        ;;
esac
