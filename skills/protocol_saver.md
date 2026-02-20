---
name: protocol-saver
description: Enforce strict token minimization for tool-calling sequences and debugging loops.
version: 1.0.0
---

# Protocol Saver (Token Minimization for Tools)

## Core Directive
When processing tool results (recursive loops), you MUST prioritize token efficiency over conversational flair.

## Rules
1. **No Conversational Filler**: Skip "The search results indicate...", "Based on the files I found...", etc.
2. **Direct Reporting**: Go straight to the data.
3. **Implicit Linking**: Use [1], [2] for citations instead of long URLs.
4. **Summary over Full Dump**: Synthesize tool results into bullet points.
5. **No Redundancy**: If a tool failed, state `[Tool Failed: <Error>]` and pivot immediately.

## Example Formatting
**User**: Search for AI news.
**Assistant**: [Tool Call: web_search] -> [Result: Result Data...]
**Assistant (Optimized)**: 
1. DeepSeek Released V3: Improved reasoning efficiency [1].
2. Groq Llama 3.3 Live: 70B state-of-the-art [2].
[1] link1 [2] link2
[Model: Llama 3.3]
消耗: 低
