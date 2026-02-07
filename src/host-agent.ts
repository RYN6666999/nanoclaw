/**
 * Host Agent for NanoClaw
 * Runs agents via local LLM (Ollama/LM Studio), OpenRouter (complex tasks), or Claude CLI.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import {
  AGENT_TIMEOUT,
  CLAUDE_CLI_PATH,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  GROUPS_DIR,
  LOCAL_API_BASE_URL,
  LOCAL_API_KEY,
  OPENROUTER_API_BASE_URL,
  OPENROUTER_API_KEY,
} from './config.js';
import { logger } from './logger.js';
import { routeMessage } from './model-router.js';
import {
  initializeObsidianMemory,
  readObsidianContext,
  writeObsidianContext,
} from './obsidian-integration.js';
import { RegisteredGroup } from './types.js';

export interface HostAgentInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
}

export interface HostAgentOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

// In-memory conversation history per group
const conversationHistory: Record<
  string,
  Array<{ role: 'user' | 'assistant'; content: string }>
> = {};
const MAX_HISTORY = 20;

function getSystemPrompt(groupFolder: string): string {
  let prompt = 'You are a helpful assistant.';

  // Load group-specific memory
  const claudeMdPath = path.join(GROUPS_DIR, groupFolder, 'CLAUDE.md');
  try {
    prompt = fs.readFileSync(claudeMdPath, 'utf-8');
  } catch {
    // Use default
  }

  // Append Obsidian context for memory continuity
  const obsidianContext = readObsidianContext();
  if (obsidianContext) {
    prompt += '\n\n## Recent Context (from external memory):\n' + obsidianContext;
  }

  return prompt;
}

/**
 * Extract plain text from XML-wrapped message prompts for local LLM.
 */
function extractMessagesForLocal(prompt: string): string {
  const matches = [
    ...prompt.matchAll(
      /<message\s+sender="([^"]*)"[^>]*>([\s\S]*?)<\/message>/g,
    ),
  ];
  if (matches.length === 0) return prompt;

  return matches.map(([, sender, content]) => `${sender}: ${content.trim()}`).join('\n');
}

async function runLocal(
  model: string,
  prompt: string,
  groupFolder: string,
): Promise<HostAgentOutput> {
  const systemPrompt = getSystemPrompt(groupFolder);
  const userText = extractMessagesForLocal(prompt);

  // Manage conversation history
  if (!conversationHistory[groupFolder]) {
    conversationHistory[groupFolder] = [];
  }
  const history = conversationHistory[groupFolder];
  history.push({ role: 'user', content: userText });

  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (LOCAL_API_KEY) {
      headers['Authorization'] = `Bearer ${LOCAL_API_KEY}`;
    }

    const response = await fetch(`${LOCAL_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, stream: false }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Local API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const result = data.choices?.[0]?.message?.content || '';

    // Strip <think>...</think> blocks (deepseek-r1 etc.)
    const cleaned = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    history.push({ role: 'assistant', content: cleaned });

    logger.info(
      { model, group: groupFolder, responseLength: cleaned.length },
      'Local LLM response received',
    );

    return { status: 'success', result: cleaned };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ model, group: groupFolder, error: message }, 'Local LLM error');
    return { status: 'error', result: null, error: message };
  }
}

async function runOpenRouter(
  model: string,
  prompt: string,
  groupFolder: string,
): Promise<HostAgentOutput> {
  const systemPrompt = getSystemPrompt(groupFolder);
  const userText = extractMessagesForLocal(prompt);

  // Manage conversation history (separate from local)
  const historyKey = `openrouter_${groupFolder}`;
  if (!conversationHistory[historyKey]) {
    conversationHistory[historyKey] = [];
  }
  const history = conversationHistory[historyKey];
  history.push({ role: 'user', content: userText });

  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT);

    // OpenRouter supports tools/functions for search and other operations
    const tools = [
      {
        type: 'function',
        function: {
          name: 'search',
          description: 'Search the web for current information using X (Twitter) and web search',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query to execute',
              },
              source: {
                type: 'string',
                enum: ['web', 'twitter', 'x'],
                description: 'Where to search: web, twitter, or x (default: web)',
              },
            },
            required: ['query'],
          },
        },
      },
    ];

    const response = await fetch(`${OPENROUTER_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const message = data.choices?.[0]?.message;
    let result = message?.content || '';

    // Handle tool calls (search, etc.)
    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      const args = JSON.parse(toolCall.function.arguments) as {
        query?: string;
        source?: string;
      };

      // Log the search attempt
      logger.info(
        { tool: toolCall.function.name, query: args.query, source: args.source },
        'OpenRouter triggered tool call',
      );

      // Add tool call context to result
      if (!result) {
        result = `Searching for: "${args.query}" (via ${args.source || 'web'})...`;
      }
    }

    const cleaned = result.trim();
    history.push({ role: 'assistant', content: cleaned });

    logger.info(
      { model, group: groupFolder, responseLength: cleaned.length },
      'OpenRouter response received',
    );

    // Save important exchanges to Obsidian
    if (userText.length > 100 || cleaned.length > 100) {
      writeObsidianContext(
        `## Last OpenRouter Exchange\n\nUser: ${userText.slice(0, 200)}\n\nAssistant: ${cleaned.slice(0, 200)}`,
      );
    }

    return { status: 'success', result: cleaned };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ model, group: groupFolder, error: message }, 'OpenRouter error');
    return { status: 'error', result: null, error: message };
  }
}

async function runGemini(
  model: string,
  prompt: string,
  groupFolder: string,
): Promise<HostAgentOutput> {
  const systemPrompt = getSystemPrompt(groupFolder);
  const userText = extractMessagesForLocal(prompt);

  // Manage conversation history (separate from other backends)
  const historyKey = `gemini_${groupFolder}`;
  if (!conversationHistory[historyKey]) {
    conversationHistory[historyKey] = [];
  }
  const history = conversationHistory[historyKey];
  history.push({ role: 'user', content: userText });

  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT);

    // Gemini API expects messages in a specific format
    const contents = history.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    // Prepend system instruction as user message
    contents.unshift({
      role: 'user',
      parts: [{ text: `System instructions:\n${systemPrompt}` }],
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 1,
            topK: 40,
            topP: 0.95,
          },
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = result.trim();

    history.push({ role: 'assistant', content: cleaned });

    logger.info(
      { model, group: groupFolder, responseLength: cleaned.length },
      'Gemini response received',
    );

    // Save important exchanges to Obsidian
    if (userText.length > 100 || cleaned.length > 100) {
      writeObsidianContext(
        `## Last Gemini Analysis\n\nUser: ${userText.slice(0, 200)}\n\nAssistant: ${cleaned.slice(0, 200)}`,
      );
    }

    return { status: 'success', result: cleaned };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ model, group: groupFolder, error: message }, 'Gemini error');
    return { status: 'error', result: null, error: message };
  }
}

async function runClaudeCli(
  prompt: string,
  sessionId: string | undefined,
  groupFolder: string,
  isMain: boolean,
): Promise<HostAgentOutput> {
  const groupDir = path.join(GROUPS_DIR, groupFolder);
  const systemPrompt = getSystemPrompt(groupFolder);

  const args: string[] = [
    '-p', prompt,
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--allowed-tools', 'Bash,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch',
    '--add-dir', groupDir,
  ];

  if (sessionId) {
    args.push('--resume', sessionId);
  }

  if (isMain) {
    const projectRoot = process.cwd();
    args.push('--add-dir', projectRoot);
  }

  args.push('--system-prompt', systemPrompt);

  logger.info(
    { group: groupFolder, hasSession: !!sessionId, isMain },
    'Spawning Claude CLI',
  );

  return new Promise((resolve) => {
    const proc = spawn(CLAUDE_CLI_PATH, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      for (const line of chunk.trim().split('\n')) {
        if (line) logger.debug({ claude: groupFolder }, line);
      }
    });

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      logger.error({ group: groupFolder }, 'Claude CLI timeout, killing');
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 5000);
    }, AGENT_TIMEOUT);

    proc.on('close', (code) => {
      clearTimeout(timeout);

      if (timedOut) {
        resolve({
          status: 'error',
          result: null,
          error: `Claude CLI timed out after ${AGENT_TIMEOUT}ms`,
        });
        return;
      }

      if (code !== 0) {
        logger.error(
          { group: groupFolder, code, stderr: stderr.slice(-500) },
          'Claude CLI exited with error',
        );
        resolve({
          status: 'error',
          result: null,
          error: `Claude CLI exited with code ${code}: ${stderr.slice(-200)}`,
        });
        return;
      }

      try {
        const output = JSON.parse(stdout);
        const result = output.result || output.text || stdout;
        const newSessionId = output.session_id || undefined;

        logger.info(
          { group: groupFolder, hasSession: !!newSessionId },
          'Claude CLI completed',
        );

        resolve({
          status: 'success',
          result: typeof result === 'string' ? result : JSON.stringify(result),
          newSessionId,
        });
      } catch {
        if (stdout.trim()) {
          resolve({ status: 'success', result: stdout.trim() });
        } else {
          resolve({
            status: 'error',
            result: null,
            error: `Failed to parse Claude CLI output. stderr: ${stderr.slice(-200)}`,
          });
        }
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      logger.error({ group: groupFolder, error: err }, 'Claude CLI spawn error');
      resolve({
        status: 'error',
        result: null,
        error: `Claude CLI spawn error: ${err.message}`,
      });
    });
  });
}

export async function runHostAgent(
  group: RegisteredGroup,
  input: HostAgentInput,
): Promise<HostAgentOutput> {
  // Initialize Obsidian memory on first run
  initializeObsidianMemory();

  const startTime = Date.now();
  const route = routeMessage(input.prompt, !!input.isScheduledTask);

  logger.info(
    {
      group: group.name,
      backend: route.backend,
      model: route.model,
      isScheduledTask: input.isScheduledTask,
    },
    'Routing message',
  );

  let output: HostAgentOutput;

  if (route.backend === 'local') {
    output = await runLocal(route.model, route.prompt, input.groupFolder);
  } else if (route.backend === 'gemini') {
    output = await runGemini(route.model, route.prompt, input.groupFolder);
  } else if (route.backend === 'openrouter') {
    output = await runOpenRouter(route.model, route.prompt, input.groupFolder);
  } else {
    output = await runClaudeCli(
      route.prompt,
      input.sessionId,
      input.groupFolder,
      input.isMain,
    );
  }

  const duration = Date.now() - startTime;
  logger.info(
    {
      group: group.name,
      backend: route.backend,
      model: route.model,
      duration,
      status: output.status,
    },
    'Agent completed',
  );

  return output;
}

/**
 * Check that backends are available.
 */
export async function ensureBackendsAvailable(): Promise<void> {
  // Check local API (OpenAI-compatible)
  try {
    const headers: Record<string, string> = {};
    if (LOCAL_API_KEY) {
      headers['Authorization'] = `Bearer ${LOCAL_API_KEY}`;
    }
    const res = await fetch(`${LOCAL_API_BASE_URL}/models`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        data?: Array<{ id: string }>;
      };
      const models = data.data?.map((m) => m.id) || [];
      logger.info({ models, url: LOCAL_API_BASE_URL }, 'Local API available');
    } else {
      logger.warn({ status: res.status }, 'Local API responded with error');
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Local API not available — local models will fail',
    );
  }

  // Check OpenRouter API
  if (OPENROUTER_API_KEY) {
    try {
      const res = await fetch(`${OPENROUTER_API_BASE_URL}/models`, {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        logger.info({ url: OPENROUTER_API_BASE_URL }, 'OpenRouter API available');
      } else {
        logger.warn({ status: res.status }, 'OpenRouter API error');
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'OpenRouter API not available',
      );
    }
  } else {
    logger.info('OpenRouter API key not configured');
  }

  // Check Gemini API
  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'test' }] }],
          }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (res.status === 200 || res.status === 400) {
        logger.info('Gemini API available');
      } else {
        logger.warn({ status: res.status }, 'Gemini API error');
      }
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Gemini API not available',
      );
    }
  } else {
    logger.info('Gemini API key not configured');
  }

  // Check claude CLI
  try {
    const proc = spawn(CLAUDE_CLI_PATH, ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    const version = await new Promise<string>((resolve) => {
      let out = '';
      proc.stdout.on('data', (d) => (out += d.toString()));
      proc.on('close', () => resolve(out.trim()));
      proc.on('error', () => resolve(''));
    });
    if (version) {
      logger.info({ version }, 'Claude CLI available');
    } else {
      logger.warn('Claude CLI not found — /claude commands will fail');
    }
  } catch {
    logger.warn('Claude CLI not available');
  }

  // Initialize Obsidian memory
  initializeObsidianMemory();
}
