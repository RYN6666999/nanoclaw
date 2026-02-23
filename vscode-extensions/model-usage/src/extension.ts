import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

type ModelEntry = {
  name: string;
  lastSeen?: string;
  occurrences: number;
  approxTokens?: number;
};

function approxTokensFromText(text: string) {
  // rough heuristic: 1 token ~ 4 chars
  return Math.max(0, Math.round(text.length / 4));
}

function readFileIfExists(p: string) {
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  } catch (e) {
    // ignore
  }
  return '';
}

function scanForModels(basePath: string): ModelEntry[] {
  const envPath = path.join(basePath, '.env');
  const logsPath = path.join(basePath, 'logs', 'bot.log');
  const handoffPath = path.join(basePath, 'logs', 'handoff_suggestions.json');

  const candidates = new Map<string, ModelEntry>();

  const env = readFileIfExists(envPath);
  const knownKeys = ['OPENROUTER_MODEL', 'GEMINI_MODEL', 'OPENAI_MODEL', 'ASSISTANT_MODEL'];
  for (const k of knownKeys) {
    const m = env.match(new RegExp(`${k}=([\"']?)([^\\n\\r\"]+)`));
    if (m) {
      const name = m[2].trim();
      candidates.set(name, { name, occurrences: 0 });
    }
  }

  const logText = readFileIfExists(logsPath);
  if (logText) {
    // look for lines mentioning model names or tokens
    const lines = logText.split(/\r?\n/).slice(-2000); // only recent
    for (const ln of lines) {
      for (const entry of Array.from(candidates.keys())) {
        if (ln.includes(entry)) {
          const e = candidates.get(entry)!;
          e.occurrences += 1;
          e.lastSeen = new Date().toISOString();
        }
      }
      // generic model: look for word 'model=' or 'model:'
      const m = ln.match(/model[:=]\s*([a-zA-Z0-9_\-\/\.]+)/i);
      if (m) {
        const name = m[1];
        if (!candidates.has(name)) candidates.set(name, { name, occurrences: 1, lastSeen: new Date().toISOString() });
      }
      const t = ln.match(/tokens[:=]\s*(\d+)/i);
      if (t && candidates.size > 0) {
        // attribute tokens to the last candidate
        const last = Array.from(candidates.values()).pop();
        if (last) last.approxTokens = (last.approxTokens || 0) + parseInt(t[1], 10);
      }
    }
  }

  // scan handoff suggestions for changedFiles and commit hints
  const handoffText = readFileIfExists(handoffPath);
  if (handoffText) {
    try {
      const arr = JSON.parse(handoffText);
      for (const item of arr) {
        if (item && item.commitSuggestion && item.title) {
          const name = item.title.slice(0, 40);
          if (!candidates.has(name)) candidates.set(name, { name, occurrences: 1 });
        }
      }
    } catch (e) {
      // ignore parse errors
    }
  }

  return Array.from(candidates.values()).sort((a, b) => (b.occurrences - a.occurrences));
}

export function activate(context: vscode.ExtensionContext) {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = 'Models: scanning...';
  statusBar.show();

  const workspaceFolders = vscode.workspace.workspaceFolders;
  const basePath = workspaceFolders && workspaceFolders[0] ? workspaceFolders[0].uri.fsPath : process.cwd();

  let current: ModelEntry[] = [];

  function refresh() {
    const models = scanForModels(basePath);
    current = models;
    statusBar.text = `Models: ${models.length} active`;
  }

  refresh();
  const interval = setInterval(refresh, 15 * 1000);

  context.subscriptions.push(statusBar);
  context.subscriptions.push({ dispose() { clearInterval(interval); } });

  context.subscriptions.push(vscode.commands.registerCommand('nanoclawModelUsage.openView', () => {
    const panel = vscode.window.createWebviewPanel('nanoclawModelUsage', 'NanoClaw Model Usage', vscode.ViewColumn.One, {});
    const rows = current.map(m => `<tr><td>${m.name}</td><td>${m.occurrences}</td><td>${m.approxTokens || '-'}</td><td>${m.lastSeen||'-'}</td></tr>`).join('\n');
    panel.webview.html = `
      <html>
      <body>
        <h2>NanoClaw Model Usage (approx)</h2>
        <table border="1" cellpadding="6">
          <thead><tr><th>Model</th><th>Occurrences</th><th>Approx Tokens</th><th>Last Seen</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p>Updated every 15s. Data sources: <code>.env</code>, <code>logs/bot.log</code>, <code>logs/handoff_suggestions.json</code>.</p>
      </body>
      </html>`;
  }));
}

export function deactivate() {}
