---
name: nanoclaw_tools
description: Access NanoClaw's powerful AI toolset - web search, file operations, Obsidian integration, and image generation
version: 1.0.0
author: Antigravity Agent
---

# NanoClaw Tools Integration

This skill provides seamless access to NanoClaw's comprehensive tool library, enabling Aionui to leverage advanced capabilities like multi-source web search, file system operations, Obsidian note management, and AI image generation.

## 🎯 Available Tools

### 1. Web Search (三源搜尋)
Multi-source web search with cross-validation from Grok, Brave, and DuckDuckGo.

**Usage:**
```python
result = nanoclaw_tool("web_search", {"query": "latest AI breakthroughs"})
```

### 2. File Operations
Complete file system management capabilities.

**Read File:**
```python
content = nanoclaw_tool("read_file", {"path": "/path/to/file.txt"})
```

**Write File:**
```python
nanoclaw_tool("write_file", {
    "path": "/tmp/output.txt",
    "content": "Hello from Aionui!"
})
```

**Edit File:**
```python
nanoclaw_tool("edit_file", {
    "path": "/path/to/file.txt",
    "search": "old text",
    "replace": "new text"
})
```

**List Files:**
```python
files = nanoclaw_tool("list_files", {
    "path": "/Users/ryan/Documents",
    "pattern": "*.md"
})
```

**Grep Search:**
```python
matches = nanoclaw_tool("grep_search", {
    "path": "/Users/ryan/projects",
    "pattern": "TODO",
    "filePattern": "*.py"
})
```

### 3. Obsidian Integration
Write directly to your Obsidian vault for long-term memory.

**Usage:**
```python
nanoclaw_tool("obsidian_note", {
    "title": "Meeting Notes 2026-02-12",
    "content": "# Key Decisions\n- Integrated NanoClaw with Aionui\n- Deployed Circuit Breaker"
})
```

### 4. Image Generation
AI-powered image generation using FLUX/DeepSeek.

**Usage:**
```python
image_path = nanoclaw_tool("generate_image", {
    "prompt": "A futuristic AI assistant helping a developer"
})
```

### 5. Bash Execution
Execute shell commands (use with caution).

**Usage:**
```python
output = nanoclaw_tool("bash_exec", {
    "command": "git status"
})
```

## 📦 Setup Instructions

### Step 1: Verify NanoClaw Installation

```bash
# Check if tool runner exists
ls -lh /Users/ryan/nanoclaw/dist/tool-runner.mjs

# Test a simple tool
cd /Users/ryan/nanoclaw/skills/universal-api-router
venv/bin/python router.py tool list_files '{"path":"."}'
```

### Step 2: Add Helper Function to Aionui

Add this function to your Aionui environment (e.g., in a startup script or utilities module):

```python
import subprocess
import json

def nanoclaw_tool(tool_name: str, args: dict) -> str:
    """
    Execute a NanoClaw tool from Aionui.
    
    Args:
        tool_name: Name of the tool (e.g., 'web_search', 'read_file')
        args: Dictionary of arguments for the tool
        
    Returns:
        Tool execution result as a string
        
    Example:
        result = nanoclaw_tool("web_search", {"query": "AI news"})
    """
    router_path = "/Users/ryan/nanoclaw/skills/universal-api-router"
    python_bin = f"{router_path}/venv/bin/python"
    router_script = f"{router_path}/router.py"
    
    args_json = json.dumps(args, ensure_ascii=False)
    cmd = [python_bin, router_script, "tool", tool_name, args_json]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,  # 2 minute timeout
            check=True
        )
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        return f"Error: Tool '{tool_name}' timed out after 120 seconds"
    except subprocess.CalledProcessError as e:
        return f"Error executing '{tool_name}': {e.stderr}"
    except Exception as e:
        return f"Unexpected error: {str(e)}"
```

### Step 3: Test Integration

```python
# Test 1: Web Search
print(nanoclaw_tool("web_search", {"query": "DeepSeek V3 評測"}))

# Test 2: File Operations
print(nanoclaw_tool("list_files", {"path": ".", "pattern": "*.md"}))

# Test 3: Obsidian Note
nanoclaw_tool("obsidian_note", {
    "title": "Aionui Integration Test",
    "content": "Successfully integrated NanoClaw tools!"
})
```

## 🔧 Advanced Usage

### Chaining Tools

```python
# Example: Search for information, then save to Obsidian
search_result = nanoclaw_tool("web_search", {"query": "Quantum computing breakthroughs 2026"})

nanoclaw_tool("obsidian_note", {
    "title": "Quantum Computing Research 2026",
    "content": f"# Research Summary\n\n{search_result}"
})
```

### Error Handling

```python
def safe_nanoclaw_tool(tool_name: str, args: dict, fallback="Tool execution failed"):
    """Wrapper with error handling"""
    try:
        result = nanoclaw_tool(tool_name, args)
        if result.startswith("Error:"):
            print(f"⚠️  {result}")
            return fallback
        return result
    except Exception as e:
        print(f"❌ Exception: {e}")
        return fallback

# Usage
content = safe_nanoclaw_tool("read_file", {"path": "/nonexistent.txt"}, fallback="File not found")
```

## 🐛 Troubleshooting

### Issue: "Tool runner not found"
**Solution:**
```bash
cd /Users/ryan/nanoclaw
npx esbuild src/tools/tool-runner.ts --bundle --platform=node --format=esm --outfile=dist/tool-runner.mjs --external:pino --external:pino-pretty
```

### Issue: "Module import error"
**Solution:**
```bash
cd /Users/ryan/nanoclaw
npm install
```

### Issue: Slow execution
**Check system health:**
```bash
# In Telegram, send to NanoClaw bot:
/status

# Or check logs:
tail -f /Users/ryan/nanoclaw/nanoclaw.log
```

### Issue: Permission denied
**Solution:**
```bash
chmod +x /Users/ryan/nanoclaw/dist/tool-runner.mjs
chmod +x /Users/ryan/nanoclaw/skills/universal-api-router/test-tools.sh
```

## 📊 Performance Tips

1. **Use Request Deduplication**: Identical web searches within 5 minutes return cached results
2. **Monitor Circuit Breaker**: Check `/status` to see if any backends are down
3. **Batch Operations**: When possible, combine multiple file operations
4. **Async Execution**: For long-running tasks, consider running tools in background

## 🔐 Security Notes

- **bash_exec**: Only use with trusted commands. Never pass user input directly.
- **write_file**: Validate paths to prevent overwriting critical files.
- **File Operations**: All operations respect file system permissions.

## 📚 Full Tool Reference

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `web_search` | Multi-source search with cross-validation | `query` |
| `read_file` | Read file contents | `path` |
| `write_file` | Write/create file | `path`, `content` |
| `edit_file` | Find and replace in file | `path`, `search`, `replace` |
| `list_files` | List directory contents | `path`, `pattern` |
| `grep_search` | Search file contents | `path`, `pattern`, `filePattern` |
| `obsidian_note` | Create Obsidian note | `title`, `content` |
| `generate_image` | AI image generation | `prompt` |
| `bash_exec` | Execute shell command | `command` |
| `tune_local` | Fine-tune local model | (advanced) |

## 🎓 Example Workflows

### Workflow 1: Research Assistant
```python
# 1. Search for information
research = nanoclaw_tool("web_search", {"query": "AI safety alignment 2026"})

# 2. Save to Obsidian
nanoclaw_tool("obsidian_note", {
    "title": "AI Safety Research",
    "content": f"# Latest Findings\n\n{research}"
})

# 3. Generate summary image
nanoclaw_tool("generate_image", {
    "prompt": "Diagram of AI safety alignment framework"
})
```

### Workflow 2: Code Analysis
```python
# 1. Find all Python files
files = nanoclaw_tool("list_files", {"path": "/project", "pattern": "*.py"})

# 2. Search for TODOs
todos = nanoclaw_tool("grep_search", {
    "path": "/project",
    "pattern": "TODO",
    "filePattern": "*.py"
})

# 3. Save report
nanoclaw_tool("write_file", {
    "path": "/tmp/todo_report.md",
    "content": f"# TODO Report\n\n{todos}"
})
```

---

**Created by**: Antigravity Agent  
**Date**: 2026-02-12  
**Version**: 1.0.0  
**Status**: Production Ready ✅
