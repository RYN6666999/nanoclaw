/**
 * Host Agent for NanoClaw
 * Routes to OpenRouter (primary), Gemini, or Claude CLI.
 */
import fs from 'fs';
import path from 'path';

import {
  AGENT_TIMEOUT,
  ASSISTANT_NAME,
  DATA_DIR,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  GROUPS_DIR,
  OBSIDIAN_MEMORY_DIR,
  OPENROUTER_API_BASE_URL,
  OPENROUTER_API_KEY,
} from './config.js';
import { logger } from './logger.js';
import {
  routeMessage,
  formatRouteSignature,
  getFallbackChain,
} from './model-router.js';
import type { Backend } from './model-router.js';
import { getToolDefinitions, getToolHandler } from './tools/index.js';
import {
  initializeObsidianMemory,
  readObsidianContext,
  writeObsidianContext,
  readWakeFile,
  autoAppendActivityLog,
} from './obsidian-integration.js';
import { RegisteredGroup, HandoffSummary, ToolCall, OpenRouterMessage, HandoffEntry } from './types.js';
import { LoadBalancer } from './backend-metrics.js';

/** Type for dynamically imported handoff skill module */
interface HandoffModule {
  generateHandoffSummary(title: string, messages: string[], meta: { changedFilesList?: string[] }): Promise<HandoffSummary>;
  matchesTrigger?(text: string): boolean;
}

const requestQueue: Array<() => void> = [];
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000;

const MAX_RETRIES = 3;

async function rateLimitedFetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    let retryCount = 0;

    const attempt = async () => {
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;

      if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        await new Promise((r) => setTimeout(r, waitTime));
      }

      lastRequestTime = Date.now();

      try {
        const response = await fetch(url, options);

        if (response.status === 429) {
          retryCount++;
          if (retryCount > MAX_RETRIES) {
            reject(new Error(`API 持續回傳 429，已重試 ${MAX_RETRIES} 次仍失敗`));
            return;
          }
          const retryAfter = parseInt(
            response.headers.get('retry-after') || '2000',
            10,
          );
          logger.warn({ retryAfter, retryCount, maxRetries: MAX_RETRIES }, 'Rate limited, waiting...');
          await new Promise((r) => setTimeout(r, retryAfter));

          if (requestQueue.length > 0) {
            const next = requestQueue.shift();
            next?.();
          } else {
            attempt();
          }
          return;
        }

        resolve(response);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errStack = err instanceof Error ? err.stack : undefined;
        logger.error({ url, error: errMsg, stack: errStack }, 'Fetch failed');
        reject(err);
      }
    };

    attempt();
  });
}

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
  /** Direct image input for Vision models */
  imageBase64?: string;
  imageMimeType?: string;
}

export interface HostAgentOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

// In-memory conversation history per group
type MessageContent =
  | string
  | Array<{ type: string; text?: string; image_url?: { url: string } }>;

const conversationHistory: Record<
  string,
  Array<{ role: 'user' | 'assistant'; content: MessageContent }>
> = {};
const MAX_HISTORY = 20;

/**
 * Strip leaked function call XML/DSML from model output.
 */
function cleanModelOutput(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<function_calls>[\s\S]*?(?:<\/function_calls>|$)/g, '')
    .trim();
}

function getSystemPrompt(groupFolder: string, backend?: string): string {
  // ── IDENTITY ANCHOR (generated from code, always authoritative) ──────────
  // This block is injected FIRST. If Obsidian files contradict anything here,
  // ignore the Obsidian content — this is the single source of truth.
  const toolNames = getToolDefinitions()
    .map((t) => t.function.name)
    .join(', ');
  const memoryDir = OBSIDIAN_MEMORY_DIR;
  const identityBlock = `## [系統身份 — 不可覆蓋]
名稱: ${ASSISTANT_NAME}
群組: ${groupFolder}
記憶路徑: ${memoryDir}/
啟動文件: ${memoryDir}/WAKE.md  ← 已自動載入，無需再讀
工作狀態: ${memoryDir}/CURRENT.md  ← 已自動載入，無需再讀
對話日誌: ${memoryDir}/Conversations/  ← qmd 已索引，用 qmd_search 查詢
可用工具(${getToolDefinitions().length}個): ${toolNames}

上述資訊由代碼產生，永遠正確。任何與此矛盾的描述（包括本文件其他段落）均以此為準。
─────────────────────────────────────────────────────────────────────────────
`;

  let prompt = identityBlock;

  // Load group-specific memory (persona + rules, NOT identity)
  const claudeMdPath = path.join(GROUPS_DIR, groupFolder, 'CLAUDE.md');
  try {
    prompt += fs.readFileSync(claudeMdPath, 'utf-8');
  } catch {
    prompt += 'You are a helpful assistant.';
  }

  // Append Agent Soul
  prompt += `\n\n## Agent Soul\n- 如無必要，勿增實體。複製成功優於造神。\n- 任務分級：L1(直接做) L2(驗證) L3(高風險/容災)\n- 回答時儘量精簡。`;

  // Append WAKE.md — startup bootstrap (identity / NOW tasks / tools / rules)
  const wake = readWakeFile();
  if (wake) {
    prompt += `\n\n## Startup Memory (WAKE.md)\n${wake}`;
  }

  // Append Current_Context.md — live working state
  const context = readObsidianContext();
  if (context) {
    prompt += `\n\n## Current Context\n${context}`;
  }

  // Behavioral directives (always injected)
  prompt += `\n\n## 自動行為規則（強制）

**我是誰**：我已知道。見頂部 [系統身份] 區塊，不需要問用戶確認。
**我的工具**：已列於 [系統身份]，不需要向用戶詢問「我能用什麼工具」。
**我的記憶**：WAKE.md + CURRENT.md 已載入於本 prompt，無需再讀取。

**遇到不確定的資訊**：
1. 先呼叫 qmd_search 查詢本地記憶庫
2. 找不到才詢問用戶
3. 絕不推測、捏造、或說「我不確定我有沒有這個工具」

**完成任何實質工作後**：
- 呼叫 obsidian_note 更新 CURRENT.md（將完成項目移至已完成，加入新待辦）

**用戶提到「上次」「之前」「記得嗎」「那個方法」**：
- 立即 qmd_search collection=obsidian，用對話關鍵字搜尋
- 找到就引用原文，找不到才說「找不到記錄」`;

  return prompt;
}

/**
 * Extract plain text from message XML.
 */
function extractPromptText(prompt: string): string {
  const matches = [...prompt.matchAll(/<message[^>]*>([\s\S]*?)<\/message>/g)];
  if (matches.length === 0) return prompt;
  return matches.map((m) => m[1].trim()).join('\n');
}

async function* parseSSEStream(response: Response): AsyncGenerator<{
  type: 'delta' | 'tool_calls' | 'done';
  content?: string;
  tool_calls?: ToolCall[];
}> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';
  const toolCallAccum: Record<number, ToolCall> = {};

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
        if (Object.keys(toolCallAccum).length > 0) {
          yield {
            type: 'tool_calls',
            tool_calls: Object.values(toolCallAccum),
          };
        }
        return;
      }

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) yield { type: 'delta', content: delta.content };
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallAccum[idx])
              toolCallAccum[idx] = {
                id: tc.id,
                function: { name: '', arguments: '' },
              };
            if (tc.id) toolCallAccum[idx].id = tc.id;
            if (tc.function?.name)
              toolCallAccum[idx].function.name += tc.function.name;
            if (tc.function?.arguments)
              toolCallAccum[idx].function.arguments += tc.function.arguments;
          }
        }
      } catch (err: unknown) {
        logger.error({ payload: data, error: err instanceof Error ? err.message : String(err) }, 'Failed to parse SSE JSON chunk from OpenRouter');
      }
    }
  }
}

const MAX_TOOL_ROUNDS = 5;

async function runOpenRouter(
  model: string,
  prompt: string,
  groupFolder: string,
  input?: HostAgentInput,
): Promise<HostAgentOutput> {
  const systemPrompt = getSystemPrompt(groupFolder, 'openrouter');
  const userText = extractPromptText(prompt);

  const historyKey = `openrouter_${groupFolder}`;
  if (!conversationHistory[historyKey]) conversationHistory[historyKey] = [];
  const history = conversationHistory[historyKey];

  // Build user message — Vision or plain text
  const userMessage = input?.imageBase64
    ? {
      role: 'user' as const,
      content: [
        {
          type: 'image_url',
          image_url: {
            url: `data:${input.imageMimeType || 'image/jpeg'};base64,${input.imageBase64}`,
          },
        },
        { type: 'text', text: userText || '描述這張圖片' },
      ],
    }
    : { role: 'user' as const, content: userText };

  history.push(userMessage);
  while (history.length > MAX_HISTORY) history.shift();

  // Inject per-turn behavioral anchor as the last system message before user input.
  // Keeps critical rules close to the decision point regardless of history length.
  const toolNames = getToolDefinitions()
    .map((t) => t.function.name)
    .join(', ');
  const behaviorAnchor = `[本輪強制規則]
1. 有工具可用時直接呼叫，禁止在回覆文字中描述「我打算呼叫 X」
2. 可用工具只有: ${toolNames} — 不得呼叫清單以外的工具
3. 查本機檔案/執行命令→bash；查筆記記憶→qmd_search；分析圖片→用戶需直接傳照片
4. 不反問用戶，不確定時先用 qmd_search 或 bash 自行查詢`;

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(0, -1),
    { role: 'system', content: behaviorAnchor },
    history[history.length - 1],
  ].filter(Boolean) as OpenRouterMessage[];
  const canStream = !!input?.onStreamChunk;
  const tools = getToolDefinitions();

  try {
    let finalResult = '';
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await rateLimitedFetch(
        `${OPENROUTER_API_BASE_URL}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            'X-Title': 'NanoClaw',
          },
          body: JSON.stringify({
            model,
            messages,
            stream: canStream,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? 'auto' : undefined,
            ...(model.includes('grok-3-mini')
              ? { reasoning: { effort: 'auto' } }
              : {}),
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, text: errorText }, 'OpenRouter API Error');
        throw new Error(`OpenRouter Error: ${response.status} ${errorText}`);
      }

      if (canStream) {
        let streamedContent = '';
        let toolCalls = null;
        for await (const event of parseSSEStream(response)) {
          if (event.type === 'delta' && event.content) {
            streamedContent += event.content;
            await input!.onStreamChunk!(event.content);
          } else if (event.type === 'tool_calls') {
            toolCalls = event.tool_calls;
          }
        }

        if (toolCalls && toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: streamedContent || null,
            tool_calls: toolCalls,
          });
          for (const tc of toolCalls) {
            const handler = getToolHandler(tc.function.name);
            const toolResult = handler
              ? await handler(JSON.parse(tc.function.arguments))
              : 'Unknown tool';
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: toolResult,
            });
          }
          continue;
        }
        finalResult = streamedContent;
        break;
      } else {
        const data = (await response.json()) as { choices?: { message: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] };
        const msg = data.choices?.[0]?.message;
        if (!msg) {
          finalResult = '[No response from model]';
          break;
        }
        if (msg.tool_calls) {
          messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
          for (const tc of msg.tool_calls) {
            const handler = getToolHandler(tc.function.name);
            const toolResult = handler
              ? await handler(JSON.parse(tc.function.arguments))
              : 'Unknown tool';
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: toolResult,
            });
          }
          continue;
        }
        finalResult = msg.content ?? '';
        break;
      }
    }
    history.push({ role: 'assistant', content: finalResult });
    return { status: 'success', result: finalResult };
  } catch (err) {
    return { status: 'error', result: null, error: String(err) };
  }
}

async function runGemini(
  model: string,
  prompt: string,
  groupFolder: string,
): Promise<HostAgentOutput> {
  const systemPrompt = getSystemPrompt(groupFolder, 'gemini');
  const userText = extractPromptText(prompt);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
        }),
      },
    );
    if (!response.ok) throw new Error(`Gemini Error: ${response.status}`);
    const data = (await response.json()) as { candidates?: { content: { parts: { text: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { status: 'success', result: cleanModelOutput(text) };
  } catch (err) {
    return { status: 'error', result: null, error: String(err) };
  }
}

async function runGeminiVision(
  imageBase64: string,
  mimeType: string,
  textPrompt: string,
  groupFolder: string,
): Promise<HostAgentOutput> {
  const systemPrompt = getSystemPrompt(groupFolder, 'gemini');
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            {
              role: 'user',
              parts: [
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
                { text: textPrompt || '描述圖片' },
              ],
            },
          ],
        }),
      },
    );
    const data = (await response.json()) as { candidates?: { content: { parts: { text: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { status: 'success', result: text };
  } catch (err) {
    return { status: 'error', result: null, error: String(err) };
  }
}

async function runClaudeCli(): Promise<HostAgentOutput> {
  return { status: 'error', result: '請在終端使用 claude。', error: 'frozen' };
}

async function runOpenCode(): Promise<HostAgentOutput> {
  return {
    status: 'error',
    result: '請在終端使用 opencode。',
    error: 'frozen',
  };
}

async function dispatchBackend(
  backend: Backend,
  model: string,
  prompt: string,
  groupFolder: string,
  input: HostAgentInput,
): Promise<HostAgentOutput> {
  const start = LoadBalancer.startRequest(backend);
  let result: HostAgentOutput;
  try {
    switch (backend) {
      case 'gemini':
        result = await runGemini(model, prompt, groupFolder);
        break;
      case 'openrouter':
        result = await runOpenRouter(model, prompt, groupFolder, input);
        break;
      case 'opencode':
        result = await runOpenCode();
        break;
      case 'claude':
        result = await runClaudeCli();
        break;
      default:
        result = {
          status: 'error',
          result: null,
          error: `Unknown backend: ${backend}`,
        };
    }
  } catch (err) {
    result = { status: 'error', result: null, error: String(err) };
  } finally {
    LoadBalancer.endRequest(backend, start, result!.status === 'error');
  }
  return result!;
}

export async function runHostAgent(
  group: RegisteredGroup,
  input: HostAgentInput,
): Promise<HostAgentOutput> {
  const startTime = Date.now();
  const route = routeMessage(input.prompt, input.isScheduledTask || false);
  let usedBackend = route.backend;
  let usedModel = route.model;

  let output = await dispatchBackend(
    usedBackend,
    usedModel,
    route.prompt,
    input.groupFolder,
    input,
  );

  let isDegraded = false;
  let fallbackModelName = '';

  if (output.status === 'error') {
    logger.error(
      {
        originalBackend: route.backend,
        originalModel: route.model,
        error: output.error,
      },
      'Primary model dispatch failed, initiating fallback chain.',
    );

    for (const fb of getFallbackChain(usedBackend)) {
      usedBackend = fb.backend;
      usedModel = fb.model;
      output = await dispatchBackend(
        usedBackend,
        usedModel,
        route.prompt,
        input.groupFolder,
        input,
      );
      if (output.status === 'success') {
        isDegraded = true;
        fallbackModelName = usedModel;
        break;
      }
      const isApiError = /^(OpenRouter|Gemini|API|Error:|Unknown)/.test(
        output.error || '',
      );
      if (isApiError && output.error) {
        logger.warn(
          {
            fallbackBackend: usedBackend,
            fallbackModel: usedModel,
            error: output.error,
          },
          'Fallback attempt failed.',
        );
      }
    }
  }

  if (isDegraded && output.status === 'success') {
    const notification = `\n\n⚠️ [系統提示：主要模型呼叫失敗，已自動切換至 ${fallbackModelName}]`;
    output.result = (output.result || '') + notification;
  }

  // Post-response hooks (non-blocking)
  if (output.status === 'success' && !input.isScheduledTask) {
    const history = conversationHistory[`openrouter_${input.groupFolder}`] || [];

    // 非同步：檢查是否需要產生 session handoff summary
    (async () => {
      try {
        const handoffPath = '../skills/session-handoff-summary/skill.js';
        const handoffModule = (await import(handoffPath)) as HandoffModule;
        const lastTexts: string[] = history
          .slice(-6)
          .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
          .filter(Boolean);
        const combined = lastTexts.join('\n');
        const triggered = handoffModule.matchesTrigger
          ? handoffModule.matchesTrigger(combined)
          : false;

        if (triggered) {
          // detect git changed files (non-blocking best-effort)
          let changedFilesList: string[] = [];
          try {
            const { execSync } = await import('child_process');
            const gitOut = String(execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }));
            changedFilesList = gitOut
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
              .map((l) => l.replace(/^\S+\s+/, '').trim())
              .filter((p) => p.length > 0)
              .filter((p) => (input.groupFolder ? p.startsWith(input.groupFolder) : true));
          } catch (e) {
            // ignore git errors
            changedFilesList = [];
          }

          const summary = await handoffModule.generateHandoffSummary(
            `Handoff - ${input.groupFolder}`,
            lastTexts,
            { changedFilesList },
          );
          logger.info({ summary }, 'Session handoff generated (non-blocking)');
          
          // Send the summary back to Telegram if possible
          try {
            const { sendTelegramMessage } = await import('./telegram/index.js');
            const groupsRaw = fs.readFileSync(path.join(DATA_DIR, 'registered_groups.json'), 'utf-8');
            const groups: Record<string, RegisteredGroup> = JSON.parse(groupsRaw);
            const chatJid = Object.keys(groups).find(k => groups[k].folder === input.groupFolder);
            if (chatJid) {
              const chatId = parseInt(chatJid.split('@')[0], 10);
              const { formatHandoffLines } = await import('./handoff-service.js');
              const text = formatHandoffLines(input.groupFolder, summary, { label: '自動 Handoff 建議' }).join('\n');
              await sendTelegramMessage(chatId, text);
            }
          } catch (e) {
            logger.warn({ error: String(e) }, 'Failed to send auto handoff to Telegram');
          }

          try {
            const outPath = path.join(process.cwd(), 'logs', 'handoff_suggestions.json');
            const obj = { time: new Date().toISOString(), group: input.groupFolder, summary };
            let arr: HandoffEntry[] = [];
            try {
              const raw = fs.readFileSync(outPath, 'utf-8');
              arr = JSON.parse(raw || '[]');
            } catch {}
            arr.push(obj);
            fs.writeFileSync(outPath, JSON.stringify(arr, null, 2));
          } catch (e) {
            logger.warn({ error: String(e) }, 'Failed to persist handoff suggestion');
          }
        }
      } catch (e) {
        logger.warn({ error: String(e) }, 'Handoff module check failed');
      }
    })();

 
  }

  logger.info(
    {
      backend: usedBackend,
      model: usedModel,
      duration: Date.now() - startTime,
    },
    'Agent completed',
  );
  return output;
}

export async function ensureBackendsAvailable(): Promise<void> {
  if (OPENROUTER_API_KEY) {
    try {
      const res = await fetch(`${OPENROUTER_API_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) logger.info('OpenRouter API available');
    } catch {
      logger.warn('OpenRouter API not available');
    }
  }
  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'test' }] }],
          }),
          signal: AbortSignal.timeout(5000),
        },
      );
      if (res.ok || res.status === 400) logger.info('Gemini API available');
    } catch {
      logger.warn('Gemini API not available');
    }
  }
  initializeObsidianMemory();

 
}

// Manual handoff trigger: generate summary for a group on demand
export async function triggerHandoffForGroup(groupFolder: string): Promise<HandoffSummary> {
  const key = `openrouter_${groupFolder}`;
  const history = conversationHistory[key] || [];
  const lastTexts: string[] = history
    .slice(-20)
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .filter(Boolean);

  try {
    const handoffPath = '../skills/session-handoff-summary/skill.js';
    const handoffModule = (await import(handoffPath)) as HandoffModule;

    // detect git changed files
    let changedFilesList: string[] = [];
    try {
      const { execSync } = await import('child_process');
      const gitOut = String(execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }));
      changedFilesList = gitOut
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => l.replace(/^\S+\s+/, '').trim())
        .filter((p) => p.length > 0)
        .filter((p) => (groupFolder ? p.startsWith(groupFolder) : true));
    } catch {}

    const summary = await handoffModule.generateHandoffSummary(
      `Handoff - ${groupFolder}`,
      lastTexts,
      { changedFilesList },
    );

    // persist suggestion
    try {
      const outPath = path.join(process.cwd(), 'logs', 'handoff_suggestions.json');
      const obj = { time: new Date().toISOString(), group: groupFolder, summary };
      let arr: HandoffEntry[] = [];
      try {
        const raw = fs.readFileSync(outPath, 'utf-8');
        arr = JSON.parse(raw || '[]');
      } catch {}
      arr.push(obj);
      fs.writeFileSync(outPath, JSON.stringify(arr, null, 2));
    } catch {}

    return summary;
  } catch (e) {
    throw e;
  }
}
