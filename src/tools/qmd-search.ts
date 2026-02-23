/**
 * QMD Search Tool — local semantic search over indexed knowledge bases
 * Searches: obsidian (memories), nanoclaw (codebase), claude-memory
 */
import { exec } from 'child_process';
import type { Tool } from './index.js';

const QMD_BIN = process.env.QMD_BIN || 'qmd';
const TIMEOUT = 20000; // 20s
const MAX_OUTPUT = 3000;

async function handler(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query || '').trim();
  if (!query) return 'Error: query is required';

  const collection = String(args.collection || 'obsidian').trim();
  const limit = Math.min(Number(args.limit || 5), 10);

  // Validate collection name (alphanumeric + hyphen only)
  if (!/^[\w-]+$/.test(collection)) {
    return 'Error: invalid collection name';
  }

  const command = `${QMD_BIN} search ${JSON.stringify(query)} -c ${collection} -n ${limit}`;

  return new Promise((resolve) => {
    exec(
      command,
      { timeout: TIMEOUT, env: { ...process.env, PATH: `/Users/ryan/.bun/bin:${process.env.PATH}` } },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          resolve(`qmd search error: ${stderr || err.message}`);
          return;
        }
        let output = stdout || stderr || '(no results)';
        if (output.length > MAX_OUTPUT) {
          output = output.slice(0, MAX_OUTPUT) + '\n... (truncated)';
        }
        resolve(output);
      },
    );
  });
}

export const qmdSearch: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'qmd_search',
      description:
        'Search local knowledge bases (Obsidian memories, NanoClaw codebase, etc.) using semantic + BM25 search. ' +
        'Use this BEFORE asking the user for context — check memories first. ' +
        'Collections: "obsidian" (all memories & notes), "nanoclaw" (codebase docs), "claude-memory" (Claude session notes). ' +
        'Returns top matching documents with excerpts.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query — use natural language or keywords',
          },
          collection: {
            type: 'string',
            description:
              'Which collection to search. Options: "obsidian" (default), "nanoclaw", "claude-memory", "comfyui"',
            enum: ['obsidian', 'nanoclaw', 'claude-memory', 'comfyui'],
          },
          limit: {
            type: 'number',
            description: 'Max results to return (default: 5, max: 10)',
          },
        },
        required: ['query'],
      },
    },
  },
  handler,
};
