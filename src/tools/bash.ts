/**
 * Bash Tool — execute shell commands with timeout and output limits
 */
import { exec } from 'child_process';
import type { Tool } from './index.js';

const MAX_OUTPUT = 4000; // chars
const TIMEOUT = 30000;   // 30s

async function handler(args: Record<string, unknown>): Promise<string> {
  const command = String(args.command || '');
  if (!command) return 'Error: command is required';

  // Safety: block destructive commands
  const blocked = ['rm -rf /', 'mkfs', 'dd if=', ':(){', 'fork bomb'];
  for (const b of blocked) {
    if (command.includes(b)) return `Error: command blocked for safety: ${b}`;
  }

  return new Promise((resolve) => {
    exec(command, { timeout: TIMEOUT, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      let output = '';
      if (stdout) output += stdout;
      if (stderr) output += (output ? '\n--- stderr ---\n' : '') + stderr;
      if (err && !output) output = `Error: ${err.message}`;

      if (output.length > MAX_OUTPUT) {
        output = output.slice(0, MAX_OUTPUT) + '\n... (truncated)';
      }

      resolve(output || '(no output)');
    });
  });
}

export const bashExec: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Execute a bash shell command. Returns stdout and stderr. Use for system commands, git, npm, curl, etc. 30s timeout.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The bash command to execute',
          },
        },
        required: ['command'],
      },
    },
  },
  handler,
};
