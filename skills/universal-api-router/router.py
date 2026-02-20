import os
import sys
import json
import requests
import fire
from dotenv import load_dotenv

# Load environment variables from the local .env file
load_dotenv()

class ApiRouter:
    def __init__(self):
        self.keys = {
            "gemini": os.getenv("GEMINI_API_KEY"),
            "openrouter": os.getenv("OPENROUTER_API_KEY"),
            "deepseek": os.getenv("DEEPSEEK_API_KEY"),
            "groq": os.getenv("GROQ_API_KEY"),
            "brave": os.getenv("BRAVE_API_KEY"),
            "nvidia": os.getenv("NVIDIA_API_KEY"),
            "tg_asis": os.getenv("TELEGRAM_BOT_TOKEN_ASIS"),
            "tg_love_papa": os.getenv("TELEGRAM_BOT_TOKEN_LOVE_PAPA"),
        }
        self.lm_studio_base = os.getenv("LM_STUDIO_BASE_URL", "http://localhost:1234/v1")
        self.default_local_model = os.getenv("DEFAULT_LOCAL_MODEL", "mobile-llm")

    def chat(self, prompt, provider="deepseek", model=None):
        """Send a chat message to an LLM provider."""
        print(f"\n[ApiRouter] Communicating with {provider}...")
        
        if provider == "deepseek":
            return self._chat_openai_compat(
                base_url="https://api.deepseek.com",
                api_key=self.keys["deepseek"],
                model=model or "deepseek-chat", # V3
                prompt=prompt
            )
        elif provider == "openrouter":
            # Using Grok 2 as a strong alternative via OpenRouter if configured, otherwise DeepSeek
            # Default to DeepSeek via OpenRouter if no model specified to save cost
            return self._chat_openai_compat(
                base_url="https://openrouter.ai/api/v1",
                api_key=self.keys["openrouter"],
                model=model or "deepseek/deepseek-chat", 
                prompt=prompt
            )
        elif provider == "groq":
            return self._chat_openai_compat(
                base_url="https://api.groq.com/openai/v1",
                api_key=self.keys["groq"],
                model=model or "llama-3.3-70b-versatile",
                prompt=prompt
            )
        elif provider == "nvidia":
            # NVIDIA Nim API
            return self._chat_openai_compat(
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=self.keys["nvidia"],
                model=model or "nvidia/llama-3.1-nemotron-70b-instruct",
                prompt=prompt
            )
        elif provider == "local":
            return self._chat_openai_compat(
                base_url=self.lm_studio_base,
                api_key="lm-studio",
                model=model or self.default_local_model,
                prompt=prompt
            )
        elif provider == "gemini":
            return self._chat_gemini(prompt, model)
        else:
            return f"Error: Unknown provider '{provider}'"

    def coding_assistant(self, task, files=None, provider="deepseek"):
        """
        Specialized node for coding tasks. 
        It can read file contents (if provided) and generate code or refactoring suggestions.
        """
        context = ""
        if files:
            for file_path in files:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        context += f"\n--- File: {file_path} ---\n{content}\n"
                except Exception as e:
                    print(f"Warning: Could not read file {file_path}: {e}")

        full_prompt = f"""
        You are an expert coding assistant.
        
        TASK:
        {task}

        CONTEXT FILES:
        {context}
        
        Please provide the complete code or solution. 
        If modifying an existing file, provide the full file content or a clear diff.
        """
        
        return self.chat(full_prompt, provider=provider)

    def heavy_lifting(self, task, files=None, provider="deepseek"):
        """
        Alias for coding_assistant, specifically for offloading heavy tasks from the main agent.
        """
        print(f"[ApiRouter] Offloading heavy lifting to {provider}...")
        return self.coding_assistant(task, files, provider)

    def telegram(self, message, bot="asis", chat_id=None):
        """Send a message via Telegram."""
        if bot == "asis":
            token = self.keys["tg_asis"]
        elif bot == "love_papa":
            token = self.keys["tg_love_papa"]
        else:
            return "Error: Unknown bot nickname"

        if not token:
            print(f"Error: Token for bot '{bot}' not found in .env")
            return f"Error: Token for bot '{bot}' not found."
            
        if not chat_id:
             return "Error: chat_id is required."

        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message
        }
        
        try:
            response = requests.post(url, json=payload, timeout=10)
            if response.status_code == 200:
                print(f"[ApiRouter] Telegram message sent to {chat_id}")
                return response.json()
            else:
                return f"Error sending message: {response.text}"
        except Exception as e:
            return f"Exception: {str(e)}"

    def search(self, query):
        """Search using Brave Search API."""
        if not self.keys["brave"]:
            return "Error: Brave API key not set."
            
        url = "https://api.search.brave.com/res/v1/web/search"
        headers = {
            "Accept": "application/json",
            "X-Subscription-Token": self.keys["brave"]
        }
        params = {"q": query}
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=10)
            if response.status_code == 200:
                results = response.json().get('web', {}).get('results', [])
                formatted = []
                for r in results[:5]:
                    formatted.append(f"- [{r.get('title')}]({r.get('url')}): {r.get('description')}")
                return "\n".join(formatted)
            else:
                return f"Error searching: {response.text}"
        except Exception as e:
            return f"Exception: {str(e)}"

    def _chat_openai_compat(self, base_url, api_key, model, prompt):
        """Generic handler for OpenAI-compatible APIs with recursive tool support."""
        if not api_key:
            return f"Error: API key for {base_url} not configured."
            
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://nanoclaw.ai",
            "X-Title": "NanoClaw",
        }
        
        # Determine if prompt is a single string or a list of messages
        if isinstance(prompt, str):
            messages = [{"role": "user", "content": prompt}]
        else:
            messages = prompt

        # Endpoint adjustment
        endpoint = f"{base_url.rstrip('/')}/chat/completions"
        if "deepseek" in base_url and not "openai" in base_url and not "v1" in base_url:
             endpoint = f"{base_url}/chat/completions"

        max_iterations = 5
        for _ in range(max_iterations):
            payload = {
                "model": model,
                "messages": messages,
                "temperature": 0.2
            }
            
            try:
                response = requests.post(endpoint, json=payload, headers=headers, timeout=120)
                if response.status_code != 200:
                    print(f"[ApiRouter] API Error ({response.status_code}): {response.text}")
                    return f"[API Error: {response.status_code} {response.text}]"
                
                data = response.json()
                msg = data['choices'][0]['message']
                
                # Check for tool_calls
                if 'tool_calls' in msg and msg['tool_calls']:
                    tool_calls = msg['tool_calls']
                    print(f"[ApiRouter] Model requested {len(tool_calls)} tool calls. Executing...")
                    
                    # Token Minimization Instruction: Inject a reminder to be concise for the next turn
                    if not any(m.get("role") == "system" and "Token Minimization" in m.get("content", "") for m in messages):
                        messages.insert(0, {
                            "role": "system", 
                            "content": "STRICT TOKEN MINIMIZATION: If you are responding to tool results, skip all conversational filler. Provide only the synthesized core data. [Skill: protocol-saver]"
                        })

                    # Add assistant message to history (MUST exist before tool messages)
                    # We create a clean message without extra keys that some APIs might reject
                    assistant_msg = {
                        "role": "assistant",
                        "tool_calls": tool_calls
                    }
                    if msg.get("content"):
                        assistant_msg["content"] = msg["content"]
                    else:
                        assistant_msg["content"] = "" # Most APIs require content or null

                    messages.append(assistant_msg)
                    
                    # Execute each tool call
                    for tc in tool_calls:
                        func_name = tc['function']['name']
                        func_args = tc['function']['arguments']
                        
                        print(f"  -> Executing: {func_name}")
                        result = self.tool(func_name, func_args)
                        
                        # Add tool result to history
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc['id'],
                            "name": func_name,
                            "content": result
                        })
                    
                    # Continue loop to send results back to model
                    continue
                
                # If no tool calls, return final content
                return msg.get('content') or ""
                
            except Exception as e:
                return f"Connection Exception: {str(e)}"
        
        return "Error: Maximum tool call iterations exceeded."

    def _chat_gemini(self, prompt, model=None):
        """Handler for Gemini API."""
        api_key = self.keys["gemini"]
        if not api_key:
            return "Error: Gemini API key not found."
            
        model = model or "gemini-2.0-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }]
        }
        
        try:
            response = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=120)
            if response.status_code == 200:
                data = response.json()
                try:
                    return data['candidates'][0]['content']['parts'][0]['text']
                except (KeyError, IndexError):
                    return f"Unexpected Gemini response: {data}"
            else:
                return f"Gemini API Error: {response.text}"
        except Exception as e:
            return f"Exception: {str(e)}"

    def tool(self, tool_name, args_json="{}"):
        """
        Execute a NanoClaw tool by name.
        Usage: python router.py tool web_search '{"query":"latest AI news"}'
        """
        import subprocess
        
        # Determine the path to the tool runner (assuming adjacent to project root)
        # Current file is in skills/universal-api-router/router.py
        # Project root is ../../
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        runner_path = os.path.join(base_dir, "dist", "tool-runner.mjs")
        
        if not os.path.exists(runner_path):
            return f"Error: Tool runner not found at {runner_path}. Please build it first."

        # Handle both dict (from Fire auto-parsing) and string arguments
        if isinstance(args_json, dict):
            # Fire already parsed it as dict, convert back to JSON string
            args_json = json.dumps(args_json, ensure_ascii=False)
        elif isinstance(args_json, str):
            # If args_json is just a string but looks like a query (not JSON), wrap it for convenience
            # Special handling for web_search shorthand: tool web_search "query string"
            if tool_name == "web_search" and not args_json.strip().startswith("{"):
                args_json = json.dumps({"query": args_json}, ensure_ascii=False)
        else:
            return f"Error: Invalid argument type: {type(args_json)}"
        
        # Ensure args_json is valid JSON string
        try:
            json.loads(args_json)
        except json.JSONDecodeError:
            return f"Error: Arguments must be valid JSON string. Got: {args_json}"

        cmd = ["node", runner_path, tool_name, args_json]
        
        print(f"[ApiRouter] Executing tool: {tool_name} with args: {args_json}")
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return result.stdout.strip()
        except subprocess.CalledProcessError as e:
            return f"Tool Execution Error: {e.stderr}"
        except Exception as e:
            return f"Exception: {str(e)}"


if __name__ == "__main__":
    fire.Fire(ApiRouter)
