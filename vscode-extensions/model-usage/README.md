# NanoClaw Model Usage — VS Code Extension (MVP)

Lightweight extension that scans local NanoClaw workspace files to show which models are being referenced/used.

Features (MVP):
- Status bar: shows number of discovered models
- Webview: table of models, approximate token counts, occurrences, last seen
- Polls every 15s and reads `.env`, `logs/bot.log`, `logs/handoff_suggestions.json`

Limitations:
- This is an approximate, local-only observer; it does not call external provider usage APIs.
- Token counts are approximated by character-length heuristic.

Install & Run (developer):

1. In VS Code, open this folder as a workspace: the extension is under `vscode-extensions/model-usage`
2. Run `npm install` inside the extension folder and `npm run compile`.
3. Press F5 to launch an Extension Development Host.
4. The status bar will show "Models: N active"; run the command `NanoClaw: Open Model Usage` to open the view.

Next steps (optional):
- Query provider usage endpoints (OpenAI/OpenRouter/Gemini) when API keys are available.
- Use precise tokenizers (tiktoken) via a companion process.
