import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export type Handoff = { time: string; group: string; summary: any };

export function loadHandoffs(filePath?: string): Handoff[] {
  const outPath = filePath || path.join(process.cwd(), 'logs', 'handoff_suggestions.json');
  if (!fs.existsSync(outPath)) return [];
  const raw = fs.readFileSync(outPath, 'utf-8');
  try {
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

export function applyHandoffs(handoffs: Handoff[], opts: { apply: boolean; autoCommitEnabled: boolean }) {
  const actions: Array<{ group: string; message: string; committed: boolean }> = [];
  for (const item of handoffs) {
    const s = item.summary;
    if (!s?.commitSuggestion?.shouldCommit) continue;
    const msg = s.commitSuggestion.message || `chore: auto handoff ${item.time}`;
    actions.push({ group: item.group, message: msg, committed: false });
    if (opts.apply && opts.autoCommitEnabled) {
      const target = item.group || '.';
      execSync(`git add -A ${target}`);
      execSync(`git commit -m "${msg.replace(/\"/g, '\\"')}"`);
      actions[actions.length - 1].committed = true;
    }
  }
  return actions;
}

export default { loadHandoffs, applyHandoffs };
