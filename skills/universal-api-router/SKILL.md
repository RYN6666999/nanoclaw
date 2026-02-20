---
name: universal-api-router
description: A universal interface to access external LLM APIs (DeepSeek, Gemini, OpenRouter, Groq, NVIDIA) and Telegram Bots. Designed for offloading heavy cognitive tasks and coding work to cost-effective models.
---

# Universal API Router

This skill allows Antigravity to interact with various external APIs, optimizing for cost and performance.

## Core Capabilities

1.  **Thinking & Coding Offload (`heavy_lifting`)**: Send complex coding tasks or large file analysis to cheaper/specialized models like DeepSeek V3 or Grok 3.
2.  **Mult-Model Chat**: Query DeepSeek, Gemini, OpenRouter, Groq, NVIDIA, or Local LLMs.
3.  **Telegram Notifications**: Send messages to Telegram users/groups via configured bots.
4.  **Web Search**: Perform searches using Brave Search API.

## Usage

### 1. Offload Heavy Coding Tasks (Recommended)

Use `heavy_lifting` to let an external model write code or analyze files.

```bash
python3 router.py heavy_lifting "Refactor this file to use functional patterns" --files '["/path/to/file.ts"]' --provider deepseek
```

**Providers:**
- `deepseek`: Best for coding and reasoning (Cost-effective).
- `nvidia`: Great instruction following (Llama 3.1 70B).
- `groq`: Extremely fast inference.

### 2. General Chat

```bash
python3 router.py chat "Explain quantum computing" --provider gemini
```

### 3. Telegram Message

```bash
python3 router.py telegram "Deployment finished" --bot asis --chat_id <chat_id>
```

### 4. Search

```bash
python3 router.py search "latest typescript features"
```

## Setup

Ensure you have the required Python packages installed in your environment:
```bash
pip install requests python-dotenv fire openai
```
