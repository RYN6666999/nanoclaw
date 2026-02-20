import asyncio
import json
import os
import sys
from typing import Any, Dict, List, Optional
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

class MCPClient:
    def __init__(self, config_path: str = "/Users/ryan/nanoclaw/.mcp.json"):
        self.config_path = config_path
        self.config = self._load_config()

    def _load_config(self) -> Dict[str, Any]:
        if not os.path.exists(self.config_path):
            return {"mcpServers": {}}
        with open(self.config_path, "r") as f:
            return json.load(f)

    async def call_tool(self, server_name: str, tool_name: str, arguments: Dict[str, Any]) -> str:
        server_config = self.config.get("mcpServers", {}).get(server_name)
        if not server_config:
            return f"Error: Server '{server_name}' not found in config."

        command = server_config.get("command")
        args = server_config.get("args", [])
        env = os.environ.copy()
        env.update(server_config.get("env", {}))

        server_params = StdioServerParameters(
            command=command,
            args=args,
            env=env
        )

        try:
            async with stdio_client(server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    result = await session.call_tool(tool_name, arguments)
                    
                    # Process result
                    if hasattr(result, 'content'):
                        return "\n".join([c.text for c in result.content if hasattr(c, 'text')])
                    return str(result)
        except Exception as e:
            return f"Error calling MCP tool {server_name}:{tool_name} -> {str(e)}"

    def list_servers(self) -> List[str]:
        return list(self.config.get("mcpServers", {}).keys())

def run_mcp_tool(server_name: str, tool_name: str, **kwargs):
    client = MCPClient()
    return asyncio.run(client.call_tool(server_name, tool_name, kwargs))

if __name__ == "__main__":
    import fire
    fire.Fire({
        "call": run_mcp_tool,
        "list": lambda: MCPClient().list_servers()
    })
