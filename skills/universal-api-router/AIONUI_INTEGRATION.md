# Aionui Tool Integration Guide

## 🎯 目標
將 NanoClaw 的所有工具（Web Search, File Ops, Obsidian, Image Gen 等）整合到 Aionui 中使用。

## 📦 已完成的整合

### 1. Tool Runner (工具執行器)
- **位置**: `/Users/ryan/nanoclaw/dist/tool-runner.mjs`
- **功能**: 將 TypeScript 工具轉為可獨立執行的 Node.js 腳本
- **建置**: 已完成 (使用 esbuild 打包)

### 2. Python Router 擴充
- **位置**: `/Users/ryan/nanoclaw/skills/universal-api-router/router.py`
- **新增方法**: `tool(tool_name, args_json)`
- **功能**: Python 呼叫 TypeScript 工具的橋樑

## 🚀 使用方式

### 方式 A: 直接從終端使用 (推薦用於測試)

```bash
cd /Users/ryan/nanoclaw/skills/universal-api-router

# 1. Web Search (網路搜尋)
venv/bin/python router.py tool web_search "最新的 AI 新聞"

# 2. Read File (讀取檔案)
venv/bin/python router.py tool read_file '{"path":"/path/to/file.txt"}'

# 3. Write File (寫入檔案)
venv/bin/python router.py tool write_file '{"path":"/tmp/test.txt","content":"Hello World"}'

# 4. List Files (列出檔案)
venv/bin/python router.py tool list_files '{"path":".","pattern":"*.py"}'

# 5. Grep Search (搜尋檔案內容)
venv/bin/python router.py tool grep_search '{"path":".","pattern":"import","filePattern":"*.py"}'

# 6. Obsidian Note (寫入 Obsidian 筆記)
venv/bin/python router.py tool obsidian_note '{"title":"Test Note","content":"# Hello\nThis is a test"}'

# 7. Generate Image (生成圖片)
venv/bin/python router.py tool generate_image '{"prompt":"A beautiful sunset over mountains"}'

# 8. Bash Exec (執行 Shell 指令 - 小心使用!)
venv/bin/python router.py tool bash_exec '{"command":"ls -la"}'
```

### 方式 B: 在 Aionui 中使用

在 Aionui 的 Python 環境中，您可以這樣調用：

```python
import subprocess
import json

def call_nanoclaw_tool(tool_name, args):
    """
    在 Aionui 中調用 NanoClaw 工具
    
    Args:
        tool_name: 工具名稱 (e.g., 'web_search', 'read_file')
        args: 參數字典 (e.g., {'query': 'AI news'})
    
    Returns:
        工具執行結果 (字串)
    """
    router_path = "/Users/ryan/nanoclaw/skills/universal-api-router"
    python_bin = f"{router_path}/venv/bin/python"
    router_script = f"{router_path}/router.py"
    
    args_json = json.dumps(args)
    cmd = [python_bin, router_script, "tool", tool_name, args_json]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout.strip()

# 使用範例
search_result = call_nanoclaw_tool("web_search", {"query": "latest AI news"})
print(search_result)
```

## 🔧 可用工具清單

| 工具名稱 | 功能 | 參數範例 |
|---------|------|---------|
| `web_search` | 三源網路搜尋 (Grok/Brave/DDG) | `{"query": "搜尋關鍵字"}` |
| `read_file` | 讀取檔案內容 | `{"path": "/path/to/file"}` |
| `write_file` | 寫入檔案 | `{"path": "/path", "content": "內容"}` |
| `edit_file` | 編輯檔案 | `{"path": "/path", "search": "舊內容", "replace": "新內容"}` |
| `list_files` | 列出檔案 | `{"path": ".", "pattern": "*.txt"}` |
| `grep_search` | 搜尋檔案內容 | `{"path": ".", "pattern": "關鍵字"}` |
| `obsidian_note` | 寫入 Obsidian | `{"title": "標題", "content": "內容"}` |
| `generate_image` | AI 生圖 | `{"prompt": "圖片描述"}` |
| `bash_exec` | 執行 Shell 指令 | `{"command": "ls -la"}` |

## 🐛 除錯指南

### 問題 1: "Tool runner not found"
**原因**: 工具尚未建置
**解決**:
```bash
cd /Users/ryan/nanoclaw
npx esbuild src/tools/tool-runner.ts --bundle --platform=node --format=esm --outfile=dist/tool-runner.mjs
```

### 問題 2: "Module not found" 或 Import 錯誤
**原因**: Node.js 環境問題
**解決**:
```bash
cd /Users/ryan/nanoclaw
npm install
```

### 問題 3: 工具執行緩慢或卡住
**原因**: 可能是 API 超時或網路問題
**除錯**:
```bash
# 查看即時日誌
tail -f /Users/ryan/nanoclaw/nanoclaw.log

# 檢查系統健康
# (在 Telegram 對 Bot 輸入 /status)
```

### 問題 4: 權限錯誤
**原因**: 檔案權限不足
**解決**:
```bash
chmod +x /Users/ryan/nanoclaw/skills/universal-api-router/test-tools.sh
chmod +x /Users/ryan/nanoclaw/dist/tool-runner.mjs
```

## 📊 測試工具整合

我已為您建立了測試腳本：

```bash
cd /Users/ryan/nanoclaw/skills/universal-api-router
./test-tools.sh
```

這會自動測試 Web Search, Read File, List Files 三個核心工具。

## 🎓 進階：在 Aionui 中建立 Skill

您可以在 Aionui 的 skills 目錄中建立一個新的 skill，例如 `nanoclaw-tools.md`：

```markdown
---
name: nanoclaw-tools
description: Access to NanoClaw's powerful toolset (web search, file ops, obsidian, image gen)
---

# NanoClaw Tools

This skill provides access to NanoClaw's tool library.

## Usage

Use the `call_nanoclaw_tool` function to invoke any tool:

```python
result = call_nanoclaw_tool("web_search", {"query": "AI news"})
```

Available tools: web_search, read_file, write_file, list_files, grep_search, obsidian_note, generate_image, bash_exec
```

## 📝 下一步建議

1. **先測試**: 執行 `./test-tools.sh` 確認工具可用
2. **整合到 Aionui**: 將 `call_nanoclaw_tool` 函數加入您的 Aionui 環境
3. **建立 Skill**: 在 Aionui 中建立專屬的 NanoClaw Tools skill
4. **監控日誌**: 使用 `tail -f` 監控執行狀況

---

**編輯者**: Antigravity (Agent)  
**日期**: 2026-02-12  
**版本**: v1.0
