# AionUI ↔ NanoClaw 雙向通訊快速指南

## 已完成部署

✅ **雙向通訊系統已建立**
- 檔案共享機制：`/tmp/nanoclaw_aionui_dialog.json`
- 橋接腳本：`aionui_bidirectional.py`
- 整合範例：`aionui_integration_example.py`

## 在 AionUI 中使用

### 方法 1：直接導入（推薦）
```python
import sys
sys.path.append('/Users/ryan/nanoclaw/skills')

from aionui_bidirectional import send_to_nanoclaw, get_latest_reply

# 發送問題
result = send_to_nanoclaw("請幫我搜尋最新的 AI 新聞")
print(result["text"])  # ✅ 已發送到 NanoClaw (訊息 ID: XXXX)

# 檢查回覆
reply = get_latest_reply()
if reply:
    print(f"📨 {reply['message']}")
```

### 方法 2：使用整合類別
```python
from aionui_integration_example import NanoClawInterface

nano = NanoClawInterface()
nano.ask("Hello from AionUI!")
replies = nano.wait_for_reply(timeout=15)
```

### 方法 3：命令行調用
```bash
# 發送訊息
cd /Users/ryan/nanoclaw/skills
python3 aionui_bidirectional.py send "你的問題"

# 檢查回覆
python3 aionui_bidirectional.py check

# 獲取最新回覆
python3 aionui_bidirectional.py get

# 查看歷史
python3 aionui_bidirectional.py history --limit 10
```

## 互動式聊天
```bash
cd /Users/ryan/nanoclaw/skills
python3 aionui_integration_example.py --mode chat
```

## 架構說明

### 資料流程
```
AionUI → 橋接腳本 → Telegram API → NanoClaw
NanoClaw 回覆 → 共享檔案 ← AionUI 讀取
```

### 共享檔案格式
```json
[
  {
    "timestamp": "2026-02-12T13:25:00Z",
    "from": "aionui",
    "message": "Hello",
    "message_id": 1367
  },
  {
    "timestamp": "2026-02-12T13:25:05Z",
    "from": "nanoclaw",
    "message": "Hi there!",
    "message_id": 1368
  }
]
```

### 自動化 NanoClaw 回覆記錄
**需要修改 NanoClaw 系統**：
1. 在回覆時自動寫入共享檔案
2. 或建立 Webhook 接收 Telegram 回覆

**臨時方案**：
- 手動複製 Telegram 回覆到共享檔案
- 使用 `simulate` 命令測試

## 測試連線

### 完整測試腳本
```python
#!/usr/bin/env python3
import sys
sys.path.append('/Users/ryan/nanoclaw/skills')

from aionui_bidirectional import send_to_nanoclaw, get_latest_reply

# 測試連線
print("🧪 測試 AionUI ↔ NanoClaw 連線...")
result = send_to_nanoclaw("測試連線，請回覆 '收到'")

if result["status"] == "success":
    print(f"✅ 發送成功: {result['text']}")
    
    # 等待 5 秒後檢查
    import time
    time.sleep(5)
    
    reply = get_latest_reply()
    if reply:
        print(f"📨 收到回覆: {reply['message']}")
        print("🎉 雙向通訊正常！")
    else:
        print("⚠️ 未收到即時回覆，請檢查 Telegram")
else:
    print(f"❌ 發送失敗: {result.get('text', '未知錯誤')}")
```

## 故障排除

### 常見問題
1. **無法導入模組**
   ```bash
   cd /Users/ryan/nanoclaw/skills
   pip3 install requests
   ```

2. **共享檔案權限問題**
   ```bash
   chmod 666 /tmp/nanoclaw_aionui_dialog.json
   ```

3. **Telegram API 錯誤**
   - 檢查 token 是否有效
   - 檢查網路連線

4. **無回覆**
   - NanoClaw 需要手動回覆
   - 或設定自動回覆機制

### 檢查狀態
```bash
# 檢查共享檔案
ls -la /tmp/nanoclaw_aionui_dialog.json

# 查看內容
python3 -c "import json; print(json.dumps(json.load(open('/tmp/nanoclaw_aionui_dialog.json')), indent=2))"
```

## 進階功能

### 輪詢檢查新回覆
```python
import time
from aionui_bidirectional import get_unread_replies

last_seen_id = 0
while True:
    unread = get_unread_replies(last_seen_id)
    if unread:
        for reply in unread:
            print(f"新回覆: {reply['message']}")
            last_seen_id = max(last_seen_id, reply.get('message_id', 0))
    time.sleep(2)  # 每 2 秒檢查一次
```

### 對話歷史管理
```python
from aionui_bidirectional import load_dialog, save_dialog

# 自定義過濾
dialog = load_dialog()
today_messages = [msg for msg in dialog if msg['timestamp'].startswith('2026-02-12')]
```

## 下一步優化

### 短期
1. ✅ 建立雙向通訊基礎
2. 🔄 在 NanoClaw 中自動記錄回覆
3. 🔄 增加回覆超時處理

### 中期
1. 建立 HTTP Webhook 即時推送
2. 增加對話上下文管理
3. 支援多輪對話

### 長期
1. 直接 API 整合
2. 支援檔案傳輸
3. 多用戶支援

## 立即測試
```bash
cd /Users/ryan/nanoclaw/skills
python3 aionui_integration_example.py --mode test
```