#!/usr/bin/env python3
"""
NanoClaw MCP Server
Exposes NanoClaw tools as an MCP server for AionUi/opencode
"""

import json
import subprocess
import sys
import os
from pathlib import Path

NANOCLAW_PATH = "/Users/ryan/nanoclaw"
VENV_PYTHON = f"{NANOCLAW_PATH}/skills/venv/bin/python"
ROUTER_SCRIPT = f"{NANOCLAW_PATH}/skills/universal-api-router/router.py"


def handle_request(line):
    """Handle a single MCP request line"""
    if not line.strip():
        return
        
    try:
        request = json.loads(line)
        method = request.get("method")
        req_id = request.get("id")

        if method == "initialize":
            response = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "nanoclaw",
                        "version": "1.0.0"
                    }
                }
            }
            print(json.dumps(response), flush=True)
            return

        if method == "tools/list":
            response = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "tools": [
                        {
                            "name": "nanoclaw_generate_image",
                            "description": "Generate images using AI (via NanoClaw FLUX.1)",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "prompt": {
                                        "type": "string",
                                        "description": "Image generation prompt",
                                    }
                                },
                                "required": ["prompt"],
                            },
                        },
                        {
                            "name": "nanoclaw_web_search",
                            "description": "Search the web for information",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "query": {
                                        "type": "string",
                                        "description": "Search query",
                                    }
                                },
                                "required": ["query"],
                            },
                        },
                        {
                            "name": "nanoclaw_tg_send",
                            "description": "Send message via Telegram bot",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "message": {
                                        "type": "string",
                                        "description": "Message to send",
                                    },
                                    "chat_id": {
                                        "type": "string",
                                        "description": "Telegram chat ID (optional)",
                                    },
                                },
                                "required": ["message"],
                            },
                        },
                        {
                            "name": "nanoclaw_tg_sync",
                            "description": "Sync/read Telegram messages",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "limit": {
                                        "type": "number",
                                        "description": "Number of messages to fetch",
                                    }
                                },
                            },
                        },
                        {
                            "name": "nanoclaw_obsidian_read",
                            "description": "Read note from Obsidian vault",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "path": {
                                        "type": "string",
                                        "description": "Note path (relative to vault)",
                                    }
                                },
                                "required": ["path"],
                            },
                        },
                        {
                            "name": "nanoclaw_obsidian_write",
                            "description": "Write note to Obsidian vault",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "path": {
                                        "type": "string",
                                        "description": "Note path (relative to vault)",
                                    },
                                    "content": {
                                        "type": "string",
                                        "description": "Note content",
                                    },
                                },
                                "required": ["path", "content"],
                            },
                        },
                        {
                            "name": "nanoclaw_bash",
                            "description": "Execute shell command (Requires human approval via local runner at 127.0.0.1:8787)",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "command": {
                                        "type": "string",
                                        "description": "Shell command to execute",
                                    }
                                },
                                "required": ["command"],
                            },
                        },
                        {
                            "name": "nanoclaw_read_file",
                            "description": "Read file content",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "path": {
                                        "type": "string",
                                        "description": "File path to read",
                                    }
                                },
                                "required": ["path"],
                            },
                        },
                        {
                            "name": "nanoclaw_write_file",
                            "description": "Write content to file",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "path": {
                                        "type": "string",
                                        "description": "File path to write",
                                    },
                                    "content": {
                                        "type": "string",
                                        "description": "Content to write",
                                    },
                                },
                                "required": ["path", "content"],
                            },
                        },
                    ]
                },
            }
            print(json.dumps(response), flush=True)

        elif method == "tools/call":
            tool_name = request.get("params", {}).get("name")
            arguments = request.get("params", {}).get("arguments", {})

            result = call_nanoclaw_tool(tool_name, arguments)

            response = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"content": [{"type": "text", "text": result}]},
            }
            print(json.dumps(response), flush=True)
            
        elif method == "notifications/initialized":
            pass # No response needed
            
        else:
            if req_id is not None:
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32601, "message": f"Method not found: {method}"},
                }
                print(json.dumps(response), flush=True)

    except Exception as e:
        error_response = {
            "jsonrpc": "2.0",
            "id": None,
            "error": {"code": -32603, "message": str(e)},
        }
        print(json.dumps(error_response), flush=True)


def call_nanoclaw_tool(tool_name: str, args: dict) -> str:
    """Call nanoclaw tool via the bridge scripts"""

    # Map MCP tool names to bridge script calls
    if tool_name == "nanoclaw_generate_image":
        prompt = args.get("prompt", "")
        cmd = [VENV_PYTHON, f"{NANOCLAW_PATH}/skills/generate_image_bridge.py", prompt]
        env = os.environ.copy()
        env["ENV_FILE"] = f"{NANOCLAW_PATH}/.env.SeMeow"

    elif tool_name == "nanoclaw_web_search":
        query = args.get("query", "")
        # Use brave-search MCP that's already configured
        cmd = [
            VENV_PYTHON,
            "-c",
            f"""
import subprocess
result = subprocess.run(['/opt/homebrew/bin/npx', '-y', '@modelcontextprotocol/server-brave-search', '--search', '{query}'], 
                       capture_output=True, text=True, timeout=30)
print(result.stdout)
""",
        ]
        env = os.environ.copy()

    elif tool_name == "nanoclaw_tg_send":
        message = args.get("message", "")
        chat_id = args.get("chat_id", "1469326872")
        cmd = [
            VENV_PYTHON,
            f"{NANOCLAW_PATH}/skills/aionui_nanoclaw_bridge.py",
            "send",
            message,
        ]
        env = os.environ.copy()
        env["TG_CHAT_ID"] = chat_id

    elif tool_name == "nanoclaw_tg_sync":
        limit = args.get("limit", 10)
        cmd = [
            VENV_PYTHON,
            f"{NANOCLAW_PATH}/skills/SeMeow_tg_bridge.py",
            "sync",
            str(limit),
        ]
        env = os.environ.copy()
        env["ENV_FILE"] = f"{NANOCLAW_PATH}/.env.SeMeow"

    elif tool_name == "nanoclaw_obsidian_read":
        path = args.get("path", "")
        vault_path = (
            "/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun"
        )
        full_path = f"{vault_path}/{path}"
        try:
            with open(full_path, "r") as f:
                return f.read()
        except Exception as e:
            return f"Error reading file: {e}"

    elif tool_name == "nanoclaw_obsidian_write":
        path = args.get("path", "")
        content = args.get("content", "")
        vault_path = (
            "/Users/ryan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun"
        )
        full_path = f"{vault_path}/{path}"
        try:
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "w") as f:
                f.write(content)
            return f"Successfully wrote to {path}"
        except Exception as e:
            return f"Error writing file: {e}"

    elif tool_name == "nanoclaw_bash":
        command = args.get("command", "")
        import requests
        import time

        RUNNER_URL = "http://127.0.0.1:8787"
        try:
            # Submit to runner
            resp = requests.post(f"{RUNNER_URL}/submit", json={"cmd": command}, timeout=5)
            if resp.status_code != 200:
                return f"Error submitting to runner: {resp.text}"
            
            job_data = resp.json()
            job_id = job_data.get("id")
            
            # If it's a non-interactive command or we don't want to wait
            # return f"Command submitted. Job ID: {job_id}. Please approve at {RUNNER_URL}"

            # Wait for approval (polling)
            print(f"DEBUG: Job {job_id} submitted. Waiting for approval at {RUNNER_URL}...", file=sys.stderr)
            
            start_time = time.time()
            timeout = 60  # Wait up to 60 seconds
            
            while time.time() - start_time < timeout:
                # Check status
                # The result endpoint returns HTML, but we can check the status text
                res_resp = requests.get(f"{RUNNER_URL}/result?id={job_id}", timeout=5)
                if res_resp.status_code == 200:
                    html_content = res_resp.text
                    if "Status: <b>DONE</b>" in html_content:
                        # Extract output from <pre>
                        import html
                        try:
                            output = html_content.split("<pre style='white-space:pre-wrap'>")[1].split("</pre>")[0]
                            return html.unescape(output)
                        except:
                            return "Command executed successfully, but output parsing failed."
                    elif "Status: <b>FAILED" in html_content:
                        try:
                            output = html_content.split("<pre style='white-space:pre-wrap'>")[1].split("</pre>")[0]
                            return f"Execution Failed:\n{html.unescape(output)}"
                        except:
                            return "Command failed."
                    elif "REJECTED" in html_content:
                        return "Command was REJECTED by the runner policy."
                
                time.sleep(2)
            
            return f"⏳ 指令等待核准超時 (JOB_ID: {job_id})。\n\n主人，請到 {RUNNER_URL} 點擊 【Approve】。核准後，請告訴我「核准了」，我再去拿結果。喵~ 🐾"

        except Exception as e:
            return f"Error connecting to Approve Runner: {e}. Is `python3 ~/runner.py` running?"

    elif tool_name == "nanoclaw_read_file":
        path = args.get("path", "")
        try:
            with open(path, "r") as f:
                return f.read()
        except Exception as e:
            return f"Error reading file: {e}"

    elif tool_name == "nanoclaw_write_file":
        path = args.get("path", "")
        content = args.get("content", "")
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as f:
                f.write(content)
            return f"Successfully wrote to {path}"
        except Exception as e:
            return f"Error writing file: {e}"
    else:
        return f"Unknown tool: {tool_name}"

    # Execute command
    if "cmd" in locals():
        try:
            env = locals().get("env", os.environ.copy())
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=120, env=env
            )
            return result.stdout if result.stdout else result.stderr
        except Exception as e:
            return f"Error: {str(e)}"

    return "Tool not implemented"


if __name__ == "__main__":
    for line in sys.stdin:
        handle_request(line)
