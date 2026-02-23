/**
 * Handoff formatting service — single source of truth for handoff display logic.
 */
import type { HandoffSummary } from './types.js';

export interface FormatHandoffOptions {
  /** Max number of changed files to show (default: 20) */
  maxFiles?: number;
  /** Prefix label, e.g. "自動 Handoff 建議" or "Handoff (dry-run)" */
  label?: string;
  /** If true, skip obsidianLog section */
  compact?: boolean;
}

/**
 * Format a HandoffSummary into readable text lines.
 * Used by: commands (button), channel-handler (/handoff), callback-handler (dry-run), host-agent (auto).
 */
export function formatHandoffLines(
  groupName: string,
  summary: HandoffSummary,
  opts: FormatHandoffOptions = {},
): string[] {
  const { maxFiles = 20, label = 'Handoff 建議', compact = false } = opts;
  const lines: string[] = [];

  lines.push(`**${label} - ${groupName}**`);
  lines.push(`優先度：${summary.priority}`);

  if (!compact && summary.summary) {
    lines.push(`\n**承先啟後脈絡提示詞：**\n${summary.summary}`);
  }
  if (!compact && summary.obsidianLog) {
    lines.push(`\n**已同步至 Obsidian：**\n${summary.obsidianLog}`);
  }
  if (summary.changedFilesList && summary.changedFilesList.length) {
    lines.push(compact ? '變更檔案：' : '\n**變更檔案：**');
    lines.push(summary.changedFilesList.slice(0, maxFiles).join('\n'));
  }
  if (summary.commitSuggestion && summary.commitSuggestion.shouldCommit) {
    lines.push(compact ? `建議 commit: ${summary.commitSuggestion.message}` : `\n**建議 commit:** ${summary.commitSuggestion.message}`);
  } else {
    lines.push(compact ? '無自動 commit 建議' : '\n無自動 commit 建議');
  }

  return lines;
}
