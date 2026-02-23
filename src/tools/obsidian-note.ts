/**
 * Obsidian Note Tool — read/write/append notes in Obsidian vault
 */
import fs from 'fs';
import path from 'path';
import { OBSIDIAN_VAULT_PATH } from '../config.js';
import type { Tool } from './index.js';

const MAX_READ = 8000;

async function handler(args: Record<string, unknown>): Promise<string> {
  const action = String(args.action || 'read');
  const notePath = String(args.path || '');
  if (!notePath) return 'Error: path is required (relative to vault root)';

  // Ensure path doesn't traverse upwards and is strictly inside OBSIDIAN_VAULT_PATH
  const resolved = path.resolve(OBSIDIAN_VAULT_PATH, notePath);
  if (!resolved.startsWith(path.resolve(OBSIDIAN_VAULT_PATH))) {
    return 'Error: path must be strictly within the Obsidian vault';
  }

  try {
    switch (action) {
      case 'read': {
        let content = fs.readFileSync(resolved, 'utf-8');
        if (content.length > MAX_READ) {
          content = content.slice(0, MAX_READ) + '\n... (truncated)';
        }
        return content;
      }
      case 'write': {
        const content = String(args.content ?? '');
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, content, 'utf-8');
        return `Written to ${notePath}`;
      }
      case 'append': {
        const content = String(args.content ?? '');
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.appendFileSync(resolved, '\n' + content, 'utf-8');
        return `Appended to ${notePath}`;
      }
      case 'list': {
        const entries = fs.readdirSync(resolved);
        return entries.join('\n');
      }
      default:
        return `Unknown action: ${action}. Use read, write, append, or list.`;
    }
  } catch (err) {
    return `Error (${action} ${notePath}): ${err instanceof Error ? err.message : String(err)}`;
  }
}

export const obsidianNote: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'obsidian_note',
      description: 'Read, write, append, or list notes in the Obsidian vault. Path is relative to vault root.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['read', 'write', 'append', 'list'],
            description: 'Action to perform (default: read)',
          },
          path: {
            type: 'string',
            description: 'Note path relative to vault root, e.g. "hermes_memories/daily.md"',
          },
          content: {
            type: 'string',
            description: 'Content to write/append (only for write/append actions)',
          },
        },
        required: ['path'],
      },
    },
  },
  handler,
};
