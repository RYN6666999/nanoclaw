/**
 * List Files Tool — list directory contents with optional glob pattern
 */
import fs from 'fs';
import path from 'path';
import type { Tool } from './index.js';

async function handler(args: Record<string, unknown>): Promise<string> {
  const dirPath = String(args.path || '.');
  const resolved = path.resolve(dirPath);

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const lines = entries.map((e) => {
      const suffix = e.isDirectory() ? '/' : '';
      return `${e.name}${suffix}`;
    });
    return `${resolved}/\n${lines.join('\n')}`;
  } catch (err) {
    return `Error listing ${resolved}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export const listFiles: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories in a given path. Directories are shown with trailing /.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path to list (default: current directory)',
          },
        },
        required: [],
      },
    },
  },
  handler,
};
