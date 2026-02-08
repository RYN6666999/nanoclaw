/**
 * Model Router for NanoClaw
 * Routes: local (free) → gemini (long docs) → openrouter (complex) → claude (tools)
 * Keywords and backend toggles read from Obsidian router-config.json
 */
import {
  DEFAULT_LOCAL_MODEL,
  DEEPSEEK_API_KEY,
  DEEPSEEK_MODEL,
  GEMINI_API_KEY,
  GEMINI_AUTO_THRESHOLD,
  GEMINI_MODEL,
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL,
  ROUTER_CONFIG,
} from './config.js';

export type Backend = 'local' | 'gemini' | 'openrouter' | 'deepseek-direct' | 'claude';

export type RouteReason = 'prefix' | 'search' | 'complex' | 'long-doc' | 'default' | 'scheduled';

export interface RouteResult {
  backend: Backend;
  model: string;
  prompt: string;
  reason: RouteReason;
  /** The original prefix command if reason=prefix, e.g. "/deepseek" */
  prefix?: string;
}

const PREFIX_MAP: Record<string, { backend: Backend; model: string }> = {
  '/claude': { backend: 'claude', model: 'claude' },
  '/deepseek': { backend: 'deepseek-direct', model: DEEPSEEK_MODEL },
  '/openrouter': { backend: 'openrouter', model: OPENROUTER_MODEL },
  '/gemini': { backend: 'gemini', model: GEMINI_MODEL },
  '/x': { backend: 'openrouter', model: 'x-ai/grok-4.1-fast' },
};

const COMPLEX_KEYWORDS = ROUTER_CONFIG?.complex_keywords || [
  'refactor', 'debug', 'architecture', 'algorithm',
  'optimize', 'performance', 'implement', 'complex', 'sophisticated',
];

const SEARCH_KEYWORDS = ROUTER_CONFIG?.search_keywords || [
  'search', 'find', 'look up', 'what is', 'who is',
  'latest', 'recent', 'news', 'current', 'trending',
  'how to', 'where', 'when', 'research',
];

function isBackendEnabled(backend: Backend): boolean {
  if (!ROUTER_CONFIG) return true;
  const cfg = ROUTER_CONFIG.backends?.[backend];
  return cfg ? cfg.enabled !== false : true;
}

function isComplexTask(text: string): boolean {
  const lower = text.toLowerCase();
  return COMPLEX_KEYWORDS.some((kw) => lower.includes(kw));
}

function needsSearch(text: string): boolean {
  const lower = text.toLowerCase();
  return SEARCH_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Route a message to the appropriate backend.
 * Priority: /prefix commands → long documents (Gemini) → complexity (OpenRouter) → local (free)
 */
export function routeMessage(
  rawPrompt: string,
  isScheduledTask: boolean,
): RouteResult {
  // Scheduled tasks always use Claude CLI (they need tools)
  if (isScheduledTask) {
    return { backend: 'claude', model: 'claude', prompt: rawPrompt, reason: 'scheduled' };
  }

  // Check prefix commands (highest priority)
  const lastMessageText = extractLastMessageText(rawPrompt);

  for (const [prefix, route] of Object.entries(PREFIX_MAP)) {
    if (lastMessageText.startsWith(prefix + ' ') || lastMessageText === prefix) {
      if (!isBackendEnabled(route.backend)) continue;
      const stripped = lastMessageText.startsWith(prefix + ' ')
        ? lastMessageText.slice(prefix.length + 1)
        : '';
      const prompt = stripped
        ? rawPrompt.replace(lastMessageText, stripped)
        : rawPrompt;
      return { backend: route.backend, model: route.model, prompt, reason: 'prefix', prefix };
    }
  }

  // Auto-detect search needs → use DeepSeek direct
  if (DEEPSEEK_API_KEY && needsSearch(lastMessageText)) {
    return {
      backend: 'deepseek-direct',
      model: DEEPSEEK_MODEL,
      prompt: rawPrompt,
      reason: 'search',
    };
  }

  // Auto-detect long documents → use Gemini (100K+ token context window)
  if (GEMINI_API_KEY && isBackendEnabled('gemini') && rawPrompt.length > GEMINI_AUTO_THRESHOLD) {
    return {
      backend: 'gemini',
      model: GEMINI_MODEL,
      prompt: rawPrompt,
      reason: 'long-doc',
    };
  }

  // Auto-detect complex tasks → use DeepSeek direct
  if (DEEPSEEK_API_KEY && isComplexTask(lastMessageText)) {
    return {
      backend: 'deepseek-direct',
      model: DEEPSEEK_MODEL,
      prompt: rawPrompt,
      reason: 'complex',
    };
  }

  // Default: DeepSeek direct (cheapest capable model)
  if (DEEPSEEK_API_KEY) {
    return {
      backend: 'deepseek-direct',
      model: DEEPSEEK_MODEL,
      prompt: rawPrompt,
      reason: 'default',
    };
  }

  // Fallback: local LLM (free, zero cost)
  return {
    backend: 'local',
    model: DEFAULT_LOCAL_MODEL,
    prompt: rawPrompt,
    reason: 'default',
  };
}

const REASON_LABELS: Record<RouteReason, string> = {
  prefix: '',       // will use prefix field instead
  search: '搜尋',
  complex: '複雜',
  'long-doc': '長文',
  default: '預設',
  scheduled: '排程',
};

/**
 * Format route signature for display, e.g. "[/deepseek → deepseek-chat]"
 */
export function formatRouteSignature(route: RouteResult): string {
  const label = route.reason === 'prefix' && route.prefix
    ? route.prefix
    : REASON_LABELS[route.reason];
  return `[${label} → ${route.model}]`;
}

/**
 * Extract the text content from the last <message> in the XML prompt.
 */
function extractLastMessageText(prompt: string): string {
  const matches = [...prompt.matchAll(/<message[^>]*>([\s\S]*?)<\/message>/g)];
  if (matches.length > 0) {
    const lastContent = matches[matches.length - 1][1];
    return lastContent.trim();
  }
  return prompt.trim();
}
