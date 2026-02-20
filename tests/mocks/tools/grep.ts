/**
 * Grep Tool — search file contents by regex pattern
 */
import { exec } from 'child_process';
import type { Tool } from './index.js';

const MAX_OUTPUT = 4000;

async function handler(args: Record<string, unknown>): Promise<string> {
  const pattern = String(args.pattern || '');
  const searchPath = String(args.path || '.');
  const caseInsensitive = Boolean(args.case_insensitive);
  const filesOnly = Boolean(args.files_only);
  const maxResults = Number(args.max_results || 20);

  if (!pattern) return 'Error: pattern is required';

  const flags: string[] = [
    '--color=never',
    '-n',         // line numbers
    '-r',         // recursive
  ];

  if (caseInsensitive) flags.push('-i');
  if (filesOnly) flags.push('-l');

  // Exclude common noise
  flags.push(
    '--exclude-dir=node_modules',
    '--exclude-dir=.git',
    '--exclude-dir=dist',
    '--exclude-dir=build',
    '--exclude=*.map',
  );

  const cmd = `grep ${flags.join(' ')} -m ${maxResults} -E ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)}`;

  return new Promise((resolve) => {
    exec(cmd, { timeout: 15000, maxBuffer: 512 * 1024 }, (err, stdout, stderr) => {
      if (stdout) {
        let output = stdout;
        if (output.length > MAX_OUTPUT) {
          output = output.slice(0, MAX_OUTPUT) + '\n... (truncated)';
        }
        resolve(output);
      } else if (err && (err as NodeJS.ErrnoException).code === 'ERR_CHILD_PROCESS_STDIO_FINAL_ERROR' || (!stdout && !stderr)) {
        resolve(`No matches found for pattern: ${pattern}`);
      } else {
        resolve(stderr || `No matches found for pattern: ${pattern}`);
      }
    });
  });
}

export const grepSearch: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search file contents using regex patterns. Recursive by default. Returns matching lines with file paths and line numbers.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Regex pattern to search for (extended regex)',
          },
          path: {
            type: 'string',
            description: 'File or directory to search in (default: current directory)',
          },
          case_insensitive: {
            type: 'boolean',
            description: 'Case insensitive search (default: false)',
          },
          files_only: {
            type: 'boolean',
            description: 'Only return file names, not matching lines (default: false)',
          },
          max_results: {
            type: 'number',
            description: 'Maximum matches per file (default: 20)',
          },
        },
        required: ['pattern'],
      },
    },
  },
  handler,
};
