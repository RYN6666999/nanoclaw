/**
 * Tool Registry for NanoClaw
 * Provides function-calling tools for DeepSeek/OpenRouter backends.
 */
import { webSearch } from './web-search.js';
import { bashExec } from './bash.js';
import { readFile } from './read-file.js';
import { writeFile } from './write-file.js';
import { listFiles } from './list-files.js';
import { obsidianNote } from './obsidian-note.js';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolHandler {
  (args: Record<string, unknown>): Promise<string>;
}

export interface Tool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

const TOOLS: Tool[] = [
  webSearch,
  bashExec,
  readFile,
  writeFile,
  listFiles,
  obsidianNote,
];

/** Tool definitions array for the API request */
export function getToolDefinitions(): ToolDefinition[] {
  return TOOLS.map((t) => t.definition);
}

/** Lookup handler by function name */
export function getToolHandler(name: string): ToolHandler | undefined {
  return TOOLS.find((t) => t.definition.function.name === name)?.handler;
}

export { type Tool as ToolType };
