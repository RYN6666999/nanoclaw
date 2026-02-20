#!/usr/bin/env python3
"""
NanoClaw Tools - Aionui Integration Helper
This script provides a ready-to-use interface for Aionui to call NanoClaw tools.
"""

import subprocess
import json
import sys
from typing import Dict, Any, Optional

# Configuration
NANOCLAW_PATH = "/Users/ryan/nanoclaw"
NANOCLAW_ROUTER_PATH = f"{NANOCLAW_PATH}/skills/universal-api-router"
VENV_PYTHON = f"{NANOCLAW_PATH}/skills/venv/bin/python"
ROUTER_SCRIPT = f"{NANOCLAW_ROUTER_PATH}/router.py"
MCP_BRIDGE = f"{NANOCLAW_PATH}/skills/mcp_client.py"
GIT_SKILL = f"{NANOCLAW_PATH}/skills/git_skill.py"

def nanoclaw_tool(tool_name: str, args: Dict[str, Any], timeout: int = 120) -> str:
    """Execute a legacy NanoClaw tool from Aionui."""
    args_json = json.dumps(args, ensure_ascii=False)
    cmd = [VENV_PYTHON, ROUTER_SCRIPT, "tool", tool_name, args_json]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        return f"Error executing '{tool_name}': {e.stderr}"
    except Exception as e:
        return f"Unexpected error: {str(e)}"

def mcp_tool(server: str, tool: str, **kwargs) -> str:
    """Execute an MCP tool via the MCP bridge."""
    cmd = [VENV_PYTHON, MCP_BRIDGE, "call", server, tool]
    for k, v in kwargs.items():
        cmd.append(f"--{k}={v}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        return result.stdout.strip()
    except Exception as e:
        return f"MCP Error ({server}:{tool}): {str(e)}"

def git_tool(action: str, **kwargs) -> str:
    """Execute a Git operation."""
    cmd = [VENV_PYTHON, GIT_SKILL, action]
    for k, v in kwargs.items():
        cmd.append(f"--{k}={v}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return result.stdout.strip()
    except Exception as e:
        return f"Git Error ({action}): {str(e)}"

# --- Specialized Tool Wrappers ---

def web_search(query: str) -> str:
    """Search the web (Uses Brave Search MCP)."""
    return mcp_tool("brave-search", "brave_web_search", query=query)

def fetch_url(url: str) -> str:
    """Fetch content from a URL (Uses Fetch MCP)."""
    return mcp_tool("fetch", "fetch", url=url)

def sequential_thinking(thought: str, thoughtNumber: int, totalThoughts: int, isRevision: bool = False) -> str:
    """Use Sequential Thinking MCP for complex reasoning."""
    return mcp_tool("sequential-thinking", "sequential_thinking", 
                    thought=thought, 
                    thoughtNumber=thoughtNumber, 
                    totalThoughts=totalThoughts, 
                    isRevision=isRevision)

def git_status() -> str:
    """Get current Git status."""
    return git_tool("status")

def git_commit(message: str) -> str:
    """Commit changes to Git."""
    return git_tool("commit", message=message)

def read_file(path: str) -> str:
    """Read file via Filesystem MCP."""
    return mcp_tool("filesystem", "read_file", path=path)

def write_file(path: str, content: str) -> str:
    """Write file via Filesystem MCP."""
    return mcp_tool("filesystem", "write_file", path=path, content=content)

# CLI interface for testing
if __name__ == "__main__":
    import fire
    fire.Fire({
        "search": web_search,
        "fetch": fetch_url,
        "think": sequential_thinking,
        "git-status": git_status,
        "read": read_file,
        "write": write_file,
        "mcp": mcp_tool,
        "git": git_tool
    })

