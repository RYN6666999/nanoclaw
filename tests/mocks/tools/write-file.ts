/**
 * Write File Tool — create or overwrite a file
 */
import fs from 'fs';
import path from 'path';
import type { Tool } from './index.js';

async function handler(args: Record<string, unknown>): Promise<string> {
  const filePath = String(args.path || '');
  const content = String(args.content ?? '');
  if (!filePath) return 'Error: path is required';

  const resolved = path.resolve(filePath);

  try {
    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, 'utf-8');
    return `Written ${content.length} chars to ${resolved}`;
  } catch (err) {
    return `Error writing ${resolved}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export const writeFile: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file. Creates parent directories if needed. Overwrites existing file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path to write to',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  handler,
};
