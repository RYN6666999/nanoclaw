/**
 * Edit File Tool — search & replace within files (like Claude Code's Edit)
 */
import fs from 'fs';
import path from 'path';
import type { Tool } from './index.js';

async function handler(args: Record<string, unknown>): Promise<string> {
  const filePath = String(args.path || '');
  const oldStr = String(args.old_string || '');
  const newStr = String(args.new_string ?? '');
  const replaceAll = Boolean(args.replace_all);

  if (!filePath) return 'Error: path is required';
  if (!oldStr) return 'Error: old_string is required';
  if (oldStr === newStr) return 'Error: old_string and new_string are identical';

  const resolved = path.resolve(filePath);

  try {
    const content = fs.readFileSync(resolved, 'utf-8');

    if (!content.includes(oldStr)) {
      return `Error: old_string not found in ${resolved}`;
    }

    let updated: string;
    let count: number;

    if (replaceAll) {
      count = content.split(oldStr).length - 1;
      updated = content.split(oldStr).join(newStr);
    } else {
      // Check uniqueness
      const occurrences = content.split(oldStr).length - 1;
      if (occurrences > 1) {
        return `Error: old_string found ${occurrences} times — provide more context to make it unique, or use replace_all=true`;
      }
      count = 1;
      updated = content.replace(oldStr, newStr);
    }

    fs.writeFileSync(resolved, updated, 'utf-8');
    return `Replaced ${count} occurrence(s) in ${resolved}`;
  } catch (err) {
    return `Error editing ${resolved}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export const editFile: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing exact string matches. Provide old_string (text to find) and new_string (replacement). By default requires old_string to be unique; use replace_all=true for multiple replacements.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path to edit',
          },
          old_string: {
            type: 'string',
            description: 'Exact text to find and replace',
          },
          new_string: {
            type: 'string',
            description: 'Replacement text',
          },
          replace_all: {
            type: 'boolean',
            description: 'Replace all occurrences (default: false, requires unique match)',
          },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  handler,
};
