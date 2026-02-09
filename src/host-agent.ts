/**
 * Host Agent for NanoClaw
 * Routes to DeepSeek (primary), OpenRouter, Gemini, or Local LLM.
 */
import fs from 'fs';
import path from 'path';

import {
  AGENT_TIMEOUT,
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_API_KEY,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  GROUPS_DIR,
  LOCAL_API_BASE_URL,
  LOCAL_API_KEY,
  OPENROUTER_API_BASE_URL,
  OPENROUTER_API_KEY,
} from './config.js';
import { logger } from './logger.js';
import { routeMessage, formatRouteSignature, getFallbackChain } from './model-router.js';
import type { Backend } from './model-router.js';
import { getToolDefinitions, getToolHandler } from './tools/index.js';
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
  /** Callback for streaming text chunks to Telegram */
  onStreamChunk?: (chunk: string) => Promise<void>;
  /** Called when streaming is done */
  onStreamDone?: () => Promise<string>;
  /** Base64-encoded image data for vision requests */
  imageBase64?: string;
  /** MIME type of the image (e.g. 'image/jpeg') */
  imageMimeType?: string;
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

/**
 * Strip leaked function call XML/DSML from model output.
 * DeepSeek sometimes outputs raw function call syntax in text instead of tool_calls.
 */
function cleanModelOutput(text: string): string {
  return text
    // DeepSeek DSML function call leaks
    .replace(/<｜DSML｜[^>]*>[\s\S]*?(?:<\/｜DSML｜[^>]*>|$)/g, '')
    // Generic XML function call leaks
    .replace(/<function_calls>[\s\S]*?(?:<\/function_calls>|$)/g, '')
    .replace(/<invoke[\s\S]*?(?:<\/invoke>|$)/g, '')
    // Strip <think> blocks
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim();
}

const AGENT_SOUL_COMPACT = `
## Agent Soul（精實原則）
- 如無必要，勿增實體。複製成功優於造神。
- 任務分級：L1(快軌:直接做) L2(標準:做完驗證) L3(容災:多檔/架構/高風險)
- 3-Strike：失敗1→自修 失敗2→換方案 失敗3→重新設計
- 回答前判斷：此問題是否超出我的能力邊界？超出則建議用戶切換前綴。
`;

function getSystemPrompt(groupFolder: string, backend?: string): string {
  let prompt = 'You are a helpful assistant.';

  // Load group-specific memory
  const claudeMdPath = path.join(GROUPS_DIR, groupFolder, 'CLAUDE.md');
  try {
    prompt = fs.readFileSync(claudeMdPath, 'utf-8');
  } catch {
    // Use default
  }

  // Append agent-soul principles for capable models (not local)
  if (backend && backend !== 'local') {
    prompt += '\n' + AGENT_SOUL_COMPACT;
  }

  // Local model: inject tuned rules + few-shot examples
  if (backend === 'local') {
    // Local-specific rules (written by cloud model via tune_local tool)
    const rulesPath = path.join(GROUPS_DIR, groupFolder, 'local-rules.md');
    try {
      const rules = fs.readFileSync(rulesPath, 'utf-8');
      if (rules.trim()) {
        prompt += '\n\n' + rules;
      }
    } catch {
      // No local rules yet
    }

    // Few-shot examples (curated by cloud model)
    const examplesPath = path.join(GROUPS_DIR, groupFolder, 'local-examples.json');
    try {
      const examples = JSON.parse(fs.readFileSync(examplesPath, 'utf-8')) as Array<{
        question: string;
        answer: string;
        score: number;
      }>;
      // Inject top 5 highest-scored examples
      const topExamples = examples.filter((e) => e.score >= 4).slice(0, 5);
      if (topExamples.length > 0) {
        prompt += '\n\n## Reference Examples\n';
        for (const ex of topExamples) {
          prompt += `\nQ: ${ex.question}\nA: ${ex.answer}\n`;
        }
      }
    } catch {
      // No examples yet
    }
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
  const systemPrompt = getSystemPrompt(groupFolder, 'local');
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
  input?: HostAgentInput,
): Promise<HostAgentOutput> {
  const systemPrompt = getSystemPrompt(groupFolder, 'openrouter');
  const userText = extractMessagesForLocal(prompt);

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

  const canStream = !!(input?.onStreamChunk);

  // Models known to NOT support function calling
  const NO_TOOLS_MODELS = ['x-ai/grok', 'mistral', 'llama'];
  const supportsTools = !NO_TOOLS_MODELS.some(prefix => model.includes(prefix));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT);

    const body: Record<string, unknown> = { model, messages, stream: canStream };

    // Only send tools to models that support function calling
    if (supportsTools) {
      body.tools = getToolDefinitions();
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${OPENROUTER_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
    }

    let result = '';

    if (canStream) {
      let toolCalls: Array<{
        id: string; type: string;
        function: { name: string; arguments: string };
      }> | null = null;

      for await (const event of parseSSEStream(response)) {
        if (event.type === 'delta' && event.content) {
          result += event.content;
          await input!.onStreamChunk!(event.content);
        } else if (event.type === 'tool_calls') {
          toolCalls = event.tool_calls || null;
        }
      }

      // Handle tool calls (same logic as DeepSeek)
      if (toolCalls && toolCalls.length > 0 && supportsTools) {
        for (const tc of toolCalls) {
          const handler = getToolHandler(tc.function.name);
          let toolResult: string;
          if (!handler) {
            toolResult = `Error: unknown tool "${tc.function.name}"`;
          } else {
            try {
              const args = JSON.parse(tc.function.arguments);
              logger.info({ tool: tc.function.name, args }, 'Executing OpenRouter tool call');
              if (input?.onStreamChunk) await input.onStreamChunk(`\n⚙️ ${tc.function.name}...\n`);
              toolResult = await handler(args);
            } catch (err) {
              toolResult = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
            }
          }
          logger.info({ tool: tc.function.name, resultLength: toolResult.length }, 'OpenRouter tool completed');
          // For now, append tool result as text (OpenRouter doesn't always support multi-turn tool calls)
          result += `\n${toolResult}`;
        }
      }
      result = result.trim();
    } else {
      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
          };
        }>;
      };

      const msg = data.choices?.[0]?.message;
      result = msg?.content || '';

      if (msg?.tool_calls && msg.tool_calls.length > 0 && supportsTools) {
        for (const tc of msg.tool_calls) {
          const handler = getToolHandler(tc.function.name);
          if (handler) {
            try {
              const args = JSON.parse(tc.function.arguments);
              logger.info({ tool: tc.function.name, args }, 'Executing OpenRouter tool call');
              const toolResult = await handler(args);
              result += `\n${toolResult}`;
            } catch (err) {
              logger.error({ tool: tc.function.name, err }, 'OpenRouter tool error');
            }
          }
        }
      }
      result = result.trim();
    }

    history.push({ role: 'assistant', content: result });

    logger.info({ model, group: groupFolder, responseLength: result.length }, 'OpenRouter response received');

    if (userText.length > 100 || result.length > 100) {
      writeObsidianContext(
        `## Last OpenRouter Exchange\n\nUser: ${userText.slice(0, 200)}\n\nAssistant: ${result.slice(0, 200)}`,
      );
    }

    return { status: 'success', result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ model, group: groupFolder, error: message }, 'OpenRouter error');
    return { status: 'error', result: null, error: message };
  }
}

const MAX_TOOL_ROUNDS = 10; // tool call rounds (generous, most tasks use 1-3)

/**
 * Parse SSE stream from DeepSeek API, yielding content deltas and tool calls.
 */
async function* parseSSEStream(response: Response): AsyncGenerator<{
  type: 'delta' | 'tool_calls' | 'done';
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  // Accumulate tool call fragments across chunks
  const toolCallAccum: Record<number, { id: string; type: string; function: { name: string; arguments: string } }> = {};
  let hasToolCalls = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        if (hasToolCalls) {
          yield {
            type: 'tool_calls',
            tool_calls: Object.values(toolCallAccum),
          };
        }
        yield { type: 'done' };
        return;
      }

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{
            delta?: {
              content?: string | null;
              tool_calls?: Array<{
                index: number;
                id?: string;
                type?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            finish_reason?: string | null;
          }>;
        };

        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        // Content delta
        if (delta.content) {
          yield { type: 'delta', content: delta.content };
        }

        // Tool call deltas (streamed incrementally)
        if (delta.tool_calls) {
          hasToolCalls = true;
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallAccum[idx]) {
              toolCallAccum[idx] = {
                id: tc.id || '',
                type: tc.type || 'function',
                function: { name: tc.function?.name || '', arguments: '' },
              };
            } else {
              if (tc.id) toolCallAccum[idx].id = tc.id;
              if (tc.function?.name) toolCallAccum[idx].function.name = tc.function.name;
            }
            if (tc.function?.arguments) {
              toolCallAccum[idx].function.arguments += tc.function.arguments;
            }
          }
        }

        // Check finish_reason for tool_calls (some models emit this instead of [DONE])
        const finishReason = parsed.choices?.[0]?.finish_reason;
        if (finishReason === 'tool_calls' && hasToolCalls) {
          yield {
            type: 'tool_calls',
            tool_calls: Object.values(toolCallAccum),
          };
          return;
        }
      } catch {
        // Skip malformed JSON chunks
      }
    }
  }
}

async function runDeepSeekDirect(
  model: string,
  prompt: string,
  groupFolder: string,
  input?: HostAgentInput,
): Promise<HostAgentOutput> {
  const systemPrompt = getSystemPrompt(groupFolder, 'deepseek-direct');
  const userText = extractMessagesForLocal(prompt);

  const historyKey = `deepseek_${groupFolder}`;
  if (!conversationHistory[historyKey]) {
    conversationHistory[historyKey] = [];
  }
  const history = conversationHistory[historyKey];
  history.push({ role: 'user', content: userText });

  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  const tools = getToolDefinitions();
  const canStream = !!(input?.onStreamChunk);

  try {
    let finalResult = '';

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT);

      // Tool rounds use non-streaming; final response streams if callback available
      const isToolRound = round < MAX_TOOL_ROUNDS - 1;
      const useStream = canStream; // stream all rounds, handle tool_calls from stream

      const body: Record<string, unknown> = {
        model,
        messages,
        stream: useStream,
      };

      if (tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      logger.info({ model, toolCount: tools.length, round, stream: useStream }, 'DeepSeek API request');

      const response = await fetch(`${DEEPSEEK_API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API error ${response.status}: ${errorText}`);
      }

      if (useStream) {
        // Streaming path
        let streamedContent = '';
        let toolCalls: Array<{
          id: string;
          type: string;
          function: { name: string; arguments: string };
        }> | null = null;

        for await (const event of parseSSEStream(response)) {
          if (event.type === 'delta' && event.content) {
            streamedContent += event.content;
            await input!.onStreamChunk!(event.content);
          } else if (event.type === 'tool_calls') {
            toolCalls = event.tool_calls || null;
          }
        }

        if (toolCalls && toolCalls.length > 0) {
          // Handle tool calls
          messages.push({
            role: 'assistant',
            content: streamedContent || null,
            tool_calls: toolCalls,
          });

          for (const tc of toolCalls) {
            const handler = getToolHandler(tc.function.name);
            let toolResult: string;

            if (!handler) {
              toolResult = `Error: unknown tool "${tc.function.name}"`;
            } else {
              try {
                const args = JSON.parse(tc.function.arguments);
                logger.info({ tool: tc.function.name, args, round }, 'Executing tool call');
                // Notify user about tool execution
                if (input?.onStreamChunk) {
                  await input.onStreamChunk(`\n⚙️ ${tc.function.name}...\n`);
                }
                toolResult = await handler(args);
              } catch (err) {
                toolResult = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
              }
            }

            messages.push({ role: 'tool', tool_call_id: tc.id, content: toolResult });
            logger.info({ tool: tc.function.name, resultLength: toolResult.length, round }, 'Tool call completed');
          }
          continue;
        }

        // No tool calls — streaming text is the final result
        finalResult = streamedContent.trim();
        break;
      } else {
        // Non-streaming path (fallback)
        const data = (await response.json()) as {
          choices?: Array<{
            message?: {
              role?: string;
              content?: string | null;
              tool_calls?: Array<{
                id: string;
                type: string;
                function: { name: string; arguments: string };
              }>;
            };
            finish_reason?: string;
          }>;
        };

        const choice = data.choices?.[0];
        const msg = choice?.message;
        if (!msg) throw new Error('No message in DeepSeek response');

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          messages.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: msg.tool_calls,
          });

          for (const tc of msg.tool_calls) {
            const handler = getToolHandler(tc.function.name);
            let toolResult: string;

            if (!handler) {
              toolResult = `Error: unknown tool "${tc.function.name}"`;
            } else {
              try {
                const args = JSON.parse(tc.function.arguments);
                logger.info({ tool: tc.function.name, args, round }, 'Executing tool call');
                toolResult = await handler(args);
              } catch (err) {
                toolResult = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
              }
            }

            messages.push({ role: 'tool', tool_call_id: tc.id, content: toolResult });
            logger.info({ tool: tc.function.name, resultLength: toolResult.length, round }, 'Tool call completed');
          }
          continue;
        }

        finalResult = (msg.content || '').trim();
        break;
      }
    }

    // If loop exhausted all rounds on tool calls with no final text,
    // make one more call WITHOUT tools to force a text response
    if (!finalResult && messages.length > 2) {
      logger.info({ model, group: groupFolder }, 'Tool rounds exhausted, forcing final response');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT);

      const finalBody: Record<string, unknown> = {
        model,
        messages,
        stream: !!canStream,
        // No tools — force text response
      };

      const finalResponse = await fetch(`${DEEPSEEK_API_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(finalBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (finalResponse.ok) {
        if (canStream) {
          for await (const event of parseSSEStream(finalResponse)) {
            if (event.type === 'delta' && event.content) {
              finalResult += event.content;
              await input!.onStreamChunk!(event.content);
            }
          }
          finalResult = finalResult.trim();
        } else {
          const data = (await finalResponse.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          finalResult = data.choices?.[0]?.message?.content?.trim() || '';
        }
      }
    }

    history.push({ role: 'assistant', content: finalResult });

    logger.info(
      { model, group: groupFolder, responseLength: finalResult.length },
      'DeepSeek direct response received',
    );

    if (userText.length > 100 || finalResult.length > 100) {
      writeObsidianContext(
        `## Last DeepSeek Exchange\n\nUser: ${userText.slice(0, 200)}\n\nAssistant: ${finalResult.slice(0, 200)}`,
      );
    }

    return { status: 'success', result: finalResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ model, group: groupFolder, error: message }, 'DeepSeek direct error');
    return { status: 'error', result: null, error: message };
  }
}

async function runGemini(
  model: string,
  prompt: string,
  groupFolder: string,
): Promise<HostAgentOutput> {
  const systemPrompt = getSystemPrompt(groupFolder, 'gemini');
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

/**
 * Gemini Vision: analyze image with optional text prompt.
 */
async function runGeminiVision(
  imageBase64: string,
  mimeType: string,
  textPrompt: string,
  groupFolder: string,
): Promise<HostAgentOutput> {
  if (!GEMINI_API_KEY) {
    return { status: 'error', result: null, error: 'Gemini API key not configured' };
  }

  const systemPrompt = getSystemPrompt(groupFolder, 'gemini');

  const parts: Array<Record<string, unknown>> = [];

  // System instruction as text
  parts.push({ text: `System instructions:\n${systemPrompt}` });

  // Image
  parts.push({
    inline_data: {
      mime_type: mimeType,
      data: imageBase64,
    },
  });

  // User text (caption or default)
  parts.push({ text: textPrompt || '描述這張圖片' });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.7 },
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini Vision API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    logger.info(
      { group: groupFolder, responseLength: result.length },
      'Gemini Vision response received',
    );

    return { status: 'success', result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ group: groupFolder, error: message }, 'Gemini Vision error');
    return { status: 'error', result: null, error: message };
  }
}

// Frozen backends — return error with suggestion to use terminal directly
async function runClaudeCli(): Promise<HostAgentOutput> {
  return { status: 'error', result: '此功能已凍結。請直接在終端使用 Claude Code。', error: 'frozen' };
}

async function runOpenCode(): Promise<HostAgentOutput> {
  return { status: 'error', result: '此功能已凍結。請直接在終端使用 OpenCode。', error: 'frozen' };
}

/**
 * Dispatch a single backend call.
 */
async function dispatchBackend(
  backend: Backend,
  model: string,
  prompt: string,
  groupFolder: string,
  input: HostAgentInput,
): Promise<HostAgentOutput> {
  switch (backend) {
    case 'local':
      return runLocal(model, prompt, groupFolder);
    case 'deepseek-direct':
      return runDeepSeekDirect(model, prompt, groupFolder, input);
    case 'gemini':
      return runGemini(model, prompt, groupFolder);
    case 'openrouter':
      return runOpenRouter(model, prompt, groupFolder, input);
    case 'opencode':
      return runOpenCode();
    case 'claude':
      return runClaudeCli();
    default:
      return { status: 'error', result: null, error: `Unknown backend: ${backend}` };
  }
}

export async function runHostAgent(
  group: RegisteredGroup,
  input: HostAgentInput,
): Promise<HostAgentOutput> {
  // Initialize Obsidian memory on first run
  initializeObsidianMemory();

  const startTime = Date.now();

  // Vision shortcut: image → Gemini Vision directly (skip model-router)
  if (input.imageBase64 && input.imageMimeType) {
    logger.info({ group: group.name }, 'Routing image to Gemini Vision');
    const userText = extractMessagesForLocal(input.prompt);
    let output = await runGeminiVision(
      input.imageBase64,
      input.imageMimeType,
      userText,
      input.groupFolder,
    );
    if (output.result) {
      output.result = cleanModelOutput(output.result);
      output.result = `${output.result}\n[圖片 → ${GEMINI_MODEL}]`;
    }
    const duration = Date.now() - startTime;
    logger.info({ group: group.name, backend: 'gemini-vision', duration, status: output.status }, 'Vision completed');
    return output;
  }

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

  let output = await dispatchBackend(route.backend, route.model, route.prompt, input.groupFolder, input);
  let usedBackend = route.backend;
  let usedModel = route.model;

  // Fallback chain: if primary fails, try alternatives (including prefix commands)
  if (output.status === 'error') {
    const fallbacks = getFallbackChain(route.backend);
    for (const fb of fallbacks) {
      logger.warn(
        { group: group.name, failedBackend: usedBackend, tryingBackend: fb.backend, tryingModel: fb.model },
        'Backend failed, trying fallback',
      );
      output = await dispatchBackend(fb.backend, fb.model, route.prompt, input.groupFolder, input);
      usedBackend = fb.backend;
      usedModel = fb.model;
      if (output.status === 'success') {
        route.reason = 'fallback';
        route.backend = fb.backend;
        route.model = fb.model;
        break;
      }
    }
  }

  // Clean leaked XML/function call syntax from output
  if (output.result) {
    output.result = cleanModelOutput(output.result);
  }

  // Append route signature to result
  if (output.result) {
    output.result = `${output.result}\n${formatRouteSignature(route)}`;
  }

  const duration = Date.now() - startTime;
  logger.info(
    {
      group: group.name,
      backend: usedBackend,
      model: usedModel,
      reason: route.reason,
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

  // Initialize Obsidian memory
  initializeObsidianMemory();
}
