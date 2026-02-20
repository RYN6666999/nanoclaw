# 📱 手機端自救指南

當 NanoClaw bot 失去通訊時，你可以在手機上自行修復，無需電腦。

---

## 🚀 方案 A：一鍵重啟（最簡單）⭐

**步驟**：
1. 打開 Telegram 對話
2. 發送指令：
   ```
   /restart
   ```
3. 等待 3-5 秒，bot 自動恢復

**工作原理**：
- bot 收到 `/restart` 後調用 PM2 重啟自己
- 新進程會自動連線 Telegram
- 無需任何其他操作

**檢查狀態**：
```
/status
```
顯示：
- 🟢 運行狀態
- ⏱️ 運行時間
- 💾 記憶體使用
- 🔄 重啟次數

---

## 🔧 方案 B：iOS Shortcuts（離線也能用）

### 設置步驟（一次性）

#### 1. 確保 Mac 開啟遠端登入
```bash
# 在 Mac 終端執行（只需一次）
sudo systemsetup -setremotelogin on
```

或手動開啟：
- 系統設定 > 一般 > 共享 > 遠端登入 ✅

#### 2. 建立 iOS Shortcut

1. 打開 **捷徑 App**
2. 點 **+** 建立新捷徑
3. 搜尋並加入動作：**透過 SSH 執行腳本**
4. 設定參數：
   - **主機**: 你的 Mac IP（例如 `192.168.1.100`）或 hostname
   - **埠**: `22`
   - **使用者**: `ryan`（你的 Mac 使用者名稱）
   - **認證**: 選擇 **密碼** 或 **SSH 金鑰**
   - **指令碼**:
     ```bash
     export PATH="/opt/homebrew/bin:$PATH" && bash /Users/ryan/nanoclaw/scripts/remote-restart.sh
     ```
5. 命名為 **重啟 NanoClaw**
6. 儲存

#### 3. 加到主畫面（選擇性）

1. 點捷徑右上角 **⋯**
2. 選 **加入主畫面**
3. 設定圖示（建議用 🔄 或 🤖）

### 使用
- 點主畫面圖示
- 或叫 Siri：「重啟 NanoClaw」

---

## 📲 方案 C：Termius App（終極備案）

當前兩個方案都失效時使用（例如 bot 完全崩潰）。

### 設置步驟（一次性）

#### 1. 安裝 Termius
- [App Store 下載](https://apps.apple.com/app/termius/id549039908)（免費版足夠）

#### 2. 新增 SSH 連線
1. 打開 Termius
2. 點 **+ New Host**
3. 設定：
   - **Alias**: NanoClaw Server
   - **Hostname**: 你的 Mac IP
   - **Username**: `ryan`
   - **Password**: 你的 Mac 密碼（或設定 SSH key）
4. 儲存

### 使用
1. 打開 Termius
2. 點 **NanoClaw Server** 連線
3. 執行指令：
   ```bash
   export PATH="/opt/homebrew/bin:$PATH" && pm2 restart nanoclaw
   ```
4. 看到 `✓` 表示成功

### 其他實用指令

**查看狀態**：
```bash
pm2 list
```

**查看日誌**：
```bash
pm2 logs nanoclaw --lines 20
```

**健康檢查**：
```bash
bash /Users/ryan/nanoclaw/scripts/check-health.sh
```

**強制重啟**（bot 卡死時）：
```bash
pm2 delete nanoclaw && pm2 start /Users/ryan/nanoclaw/ecosystem.config.cjs
```

---

## 🆘 故障排查

### bot 重啟後還是不回應

1. **檢查網路**：
   ```
   /status
   ```
   如果無回應 = 網路問題或 bot 已崩潰

2. **查看日誌**（Termius）：
   ```bash
   tail -50 /tmp/nanoclaw-live.log
   ```

3. **檢查 Telegram API**（Termius）：
   ```bash
   bash /Users/ryan/nanoclaw/scripts/check-health.sh
   ```
   如果顯示 `✗ Telegram API 無回應` = token 失效或網路問題

### iOS Shortcuts 無法連線

1. **確認 Mac 在同一 Wi-Fi**
2. **檢查 Mac IP**（可能變了）：
   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```
3. **確認遠端登入已開啟**（Mac）：
   ```bash
   sudo systemsetup -getremotelogin
   ```

### Termius 提示 "Connection refused"

- Mac 睡眠了 → 喚醒 Mac
- 防火牆阻擋 → 系統設定 > 網路 > 防火牆 > 允許遠端登入

---

## 🔒 安全建議

1. **使用 SSH 金鑰** 而非密碼（更安全）
   ```bash
   # Mac 生成金鑰（如果沒有）
   ssh-keygen -t ed25519

   # 複製公鑰到 iPhone（透過 AirDrop）
   cat ~/.ssh/id_ed25519.pub
   ```

2. **限制遠端登入** 只允許特定 IP（可選）
   ```bash
   # /etc/hosts.allow
   sshd: 192.168.1.0/24
   ```

3. **使用 Tailscale**（進階）
   - [下載 Mac 版](https://tailscale.com/download/mac)
   - [下載 iOS 版](https://apps.apple.com/app/tailscale/id1470499037)
   - 讓你在任何地方都能安全連回 Mac

---

## ⚡ 自動化建議

### 設定 Siri 快捷指令

1. iOS 設定 > Siri 與搜尋
2. 我的快捷指令 > **重啟 NanoClaw**
3. 加入 Siri 片語：「修復 bot」

### 加到 Control Center（iOS 18+）

1. 設定 > 控制中心
2. 自訂控制項目 > 加入 **快捷指令**
3. 下拉控制中心即可一鍵重啟

---

**最後更新**: 2026-02-17
**作者**: 赫爾密斯 (NanoClaw AI Agent)
