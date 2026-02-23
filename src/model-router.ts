/**
 * Model Router for NanoClaw v2.0
 * 赫爾密斯四層智力梯隊：
 *   Tier 1 (默認): gemini-2.5-flash-lite (58分) — 日常對話
 *   Tier 2 (/flash): gemini-2.5-flash (72分) — 一般 Coding
 *   Tier 3 (/pro): gemini-3.1-pro-preview (97分) — 複雜推理
 *   Tier 4 (/codex): openai/gpt-5.3-codex (94分) — 極致 Coding
 * 瑟喵架構：Grok-3-Mini 日常 / Euryale 深度RP / Gemini Vision
 */
import {
  DEFAULT_LOCAL_MODEL,
  // DEEPSEEK_API_KEY,
  // DEEPSEEK_MODEL,
  GEMINI_API_KEY,
  GEMINI_AUTO_THRESHOLD,
  GEMINI_MODEL,
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL,
  ROUTER_CONFIG,
} from './config.js';

export type Backend = 'openrouter' | 'gemini' | 'claude' | 'opencode';

export type RouteReason =
  | 'prefix'
  | 'search'
  | 'complex'
  | 'long-doc'
  | 'nsfw-rp'
  | 'default'
  | 'scheduled'
  | 'fallback';

export interface RouteResult {
  backend: Backend;
  model: string;
  prompt: string;
  reason: RouteReason;
  prefix?: string;
}

// === v2.0 赫爾密斯四層模型 ===
const GEMINI_FLASH_LITE = 'gemini-2.5-flash-lite';  // Tier 1 預設：日常對話
const GEMINI_FLASH_T2 = 'gemini-2.5-flash';         // Tier 2：一般 Coding
// Tier 3: gemini-3.1-pro-preview (直接在 PREFIX_MAP)
// Tier 4: openai/gpt-5.3-codex (直接在 PREFIX_MAP)
// === 瑟喵模型常數 ===
const GROK_MINI = 'x-ai/grok-3-mini';          // 瑟喵日常：$0.30/1M，131K ctx
const EURYALE = 'sao10k/l3.3-euryale-70b';     // 深度RP：$0.65/1M，131K ctx
const GROK_2 = 'x-ai/grok-2-1212';

const PREFIX_MAP: Record<string, { backend: Backend; model: string }> = {
  '/claude': { backend: 'claude', model: 'claude' },
  '/openrouter': { backend: 'openrouter', model: OPENROUTER_MODEL },
  '/gemini': { backend: 'gemini', model: GEMINI_MODEL },
  '/x': { backend: 'openrouter', model: GROK_2 },
  '/code': { backend: 'opencode', model: 'opencode' },
  '/rp': { backend: 'openrouter', model: EURYALE }, // 強制深度RP
  '/mini': { backend: 'openrouter', model: GROK_MINI }, // 強制Grok Mini
  '/flash': { backend: 'gemini', model: GEMINI_FLASH_T2 }, // Tier 2
  '/pro': { backend: 'gemini', model: 'gemini-3.1-pro-preview' },
  '/codex': { backend: 'openrouter', model: 'openai/gpt-5.3-codex' },
};

const COMPLEX_KEYWORDS = ROUTER_CONFIG?.complex_keywords || [
  'refactor',
  'debug',
  'architecture',
  'algorithm',
  'optimize',
  'performance',
  'implement',
  'complex',
  'sophisticated',
];

// 深度RP關鍵字 → Lumimaid 70B（情感流暢度特化）
const DEEP_RP_KEYWORDS = [
  // 中文觸發
  '入戲',
  '角色扮演',
  '扮演',
  '情境',
  '場景',
  '帶我',
  '帶領我',
  '繼續',
  '繼續演',
  '撫摸',
  '喘息',
  '低語',
  '呻吟',
  '親吻',
  '緊緊',
  '靠近',
  '感受',
  '體溫',
  '主人想要',
  '主人需要',
  '把我',
  '讓我感覺',
  // 英文觸發
  'roleplay',
  'in character',
  'stay in character',
  'act as',
  'pretend',
  'touch me',
  'kiss',
  'whisper',
  'moan',
  'embrace',
];

function isBackendEnabled(backend: Backend): boolean {
  if (!ROUTER_CONFIG) return true;
  const cfg = ROUTER_CONFIG.backends?.[backend as string];
  return cfg ? cfg.enabled !== false : true;
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function routeMessage(
  rawPrompt: string,
  isScheduledTask: boolean,
): RouteResult {
  if (isScheduledTask)
    return {
      backend: 'claude',
      model: 'claude',
      prompt: rawPrompt,
      reason: 'scheduled',
    };
  const lastMessageText = extractLastMessageText(rawPrompt);
  for (const [prefix, route] of Object.entries(PREFIX_MAP)) {
    if (
      lastMessageText.startsWith(prefix + ' ') ||
      lastMessageText === prefix
    ) {
      if (!isBackendEnabled(route.backend)) continue;
      const stripped = lastMessageText.startsWith(prefix + ' ')
        ? lastMessageText.slice(prefix.length + 1)
        : '';
      const prompt = stripped
        ? rawPrompt.replace(lastMessageText, stripped)
        : rawPrompt;
      return {
        backend: route.backend,
        model: route.model,
        prompt,
        reason: 'prefix',
        prefix,
      };
    }
  }

  // 長文 → Gemini（1M context，最適合）
  if (
    GEMINI_API_KEY &&
    isBackendEnabled('gemini') &&
    rawPrompt.length >
      (ROUTER_CONFIG?.backends?.gemini?.auto_threshold || 50000)
  ) {
    return {
      backend: 'gemini',
      model: GEMINI_MODEL,
      prompt: rawPrompt,
      reason: 'long-doc',
    };
  }

  // 深度RP關鍵字 → Euryale v3（RP專職，131K context）
  if (
    OPENROUTER_API_KEY &&
    matchesKeywords(lastMessageText, DEEP_RP_KEYWORDS)
  ) {
    return {
      backend: 'openrouter',
      model: EURYALE,
      prompt: rawPrompt,
      reason: 'nsfw-rp',
    };
  }

  // v2.0 赫爾密斯預設 → gemini-2.5-flash-lite（Tier 1，日常模式）
  // 瑟喵預設 → Grok 3-Mini（模擬人設，日常對話）
  const isHermes = (process.env.ASSISTANT_NAME || '').includes('赫');
  return {
    backend: isHermes ? 'gemini' : 'openrouter',
    model: isHermes ? GEMINI_FLASH_LITE : GROK_MINI,
    prompt: rawPrompt,
    reason: 'default',
  };
}

const REASON_LABELS: Record<RouteReason, string> = {
  prefix: '',
  search: '搜尋',
  complex: '複雜',
  'long-doc': '長文',
  'nsfw-rp': '情感',
  default: '預設',
  scheduled: '排程',
  fallback: '降級',
};
const FALLBACK_CHAIN: Array<{ backend: Backend; model: string }> = [
  {
    backend: 'openrouter',
    model: 'google/gemini-2.0-flash-lite-preview-02-05:free',
  },
  { backend: 'openrouter', model: 'opencode/glm-5-free' },
  // { backend: "openrouter", model: "deepseek/deepseek-chat" },
  { backend: 'gemini', model: 'gemini-2.0-flash' },
];

function hasApiKey(backend: Backend): boolean {
  switch (backend) {
    case 'openrouter':
      return !!OPENROUTER_API_KEY;
    case 'gemini':
      return !!GEMINI_API_KEY;
    case 'claude':
      return true;
    default:
      return false;
  }
}

export function getFallbackChain(
  failedBackend: Backend,
): Array<{ backend: Backend; model: string }> {
  return FALLBACK_CHAIN.filter(
    (f) =>
      f.backend !== failedBackend &&
      isBackendEnabled(f.backend) &&
      hasApiKey(f.backend),
  );
}

export function formatRouteSignature(route: RouteResult): string {
  const label =
    route.reason === 'prefix' && route.prefix
      ? route.prefix
      : REASON_LABELS[route.reason];
  return `[${label} → ${route.model}]`;
}

function extractLastMessageText(prompt: string): string {
  const matches = [...prompt.matchAll(/<message[^>]*>([\s\S]*?)<\/message>/g)];
  if (matches.length > 0) return matches[matches.length - 1][1].trim();
  return prompt.trim();
}
