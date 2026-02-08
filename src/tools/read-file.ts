/**
 * Read File Tool — read file contents with line limit
 */
import fs from 'fs';
import path from 'path';
import type { Tool } from './index.js';

const MAX_CHARS = 8000;

async function handler(args: Record<string, unknown>): Promise<string> {
  const filePath = String(args.path || '');
  if (!filePath) return 'Error: path is required';

  const resolved = path.resolve(filePath);

  try {
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(resolved);
      return `Directory: ${resolved}\n${entries.join('\n')}`;
    }

    let content = fs.readFileSync(resolved, 'utf-8');
    if (content.length > MAX_CHARS) {
      content = content.slice(0, MAX_CHARS) + '\n... (truncated)';
    }
    return content;
  } catch (err) {
    return `Error reading ${resolved}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export const readFile: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file. Can also list directory contents if path is a directory.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative file path to read',
          },
        },
        required: ['path'],
      },
    },
  },
  handler,
};
