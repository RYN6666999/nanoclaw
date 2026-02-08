import fs from 'fs';
import path from 'path';

// Load .env BEFORE any process.env reads (ESM imports hoist, so this must be in config.ts)
const _envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(_envPath)) {
  for (const line of fs.readFileSync(_envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

export const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'Andy';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || '/Users/user';

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'mount-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
export const MAIN_GROUP_FOLDER = 'main';

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '300000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const IPC_POLL_INTERVAL = 1000;

// Obsidian memory integration (defined early so router config can use it)
export const OBSIDIAN_VAULT_PATH =
  process.env.OBSIDIAN_VAULT_PATH || path.join(HOME_DIR, 'Obsidian', 'Vault');
export const OBSIDIAN_MEMORY_DIR = path.join(
  OBSIDIAN_VAULT_PATH,
  'Nano_Memories',
);
export const OBSIDIAN_CURRENT_CONTEXT = path.join(
  OBSIDIAN_MEMORY_DIR,
  'Current_Context.md',
);

// --- External router config from Obsidian ---
export interface RouterConfig {
  default_backend: string;
  backends: {
    local: { enabled: boolean; url: string; model: string; api_key: string };
    openrouter: { enabled: boolean; url: string; model: string };
    gemini: { enabled: boolean; model: string; auto_threshold: number };
    claude: { enabled: boolean; model: string };
    [key: string]: { enabled: boolean; [k: string]: unknown };
  };
  complex_keywords: string[];
  search_keywords: string[];
}

const ROUTER_CONFIG_PATH = path.join(OBSIDIAN_MEMORY_DIR, 'router-config.json');

function loadRouterConfig(): RouterConfig | null {
  try {
    if (fs.existsSync(ROUTER_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(ROUTER_CONFIG_PATH, 'utf-8'));
    }
  } catch {
    // Fall back to defaults
  }
  return null;
}

export const ROUTER_CONFIG = loadRouterConfig();

// Host agent configuration — Obsidian router-config.json overrides .env overrides defaults
export const LOCAL_API_BASE_URL =
  ROUTER_CONFIG?.backends?.local?.url ||
  process.env.LOCAL_API_BASE_URL ||
  'http://localhost:11434/v1';
export const LOCAL_API_KEY =
  ROUTER_CONFIG?.backends?.local?.api_key ||
  process.env.LOCAL_API_KEY ||
  '';
export const DEFAULT_LOCAL_MODEL =
  ROUTER_CONFIG?.backends?.local?.model ||
  process.env.DEFAULT_LOCAL_MODEL ||
  'llama3.2:3b';
export const CLAUDE_CLI_PATH =
  process.env.CLAUDE_CLI_PATH || 'claude';
export const AGENT_TIMEOUT = parseInt(
  process.env.AGENT_TIMEOUT || '300000',
  10,
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

// OpenRouter API (DeepSeek V3 for complex tasks)
export const OPENROUTER_API_BASE_URL =
  ROUTER_CONFIG?.backends?.openrouter?.url ||
  process.env.OPENROUTER_API_BASE_URL ||
  'https://openrouter.io/api/v1';
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
export const OPENROUTER_MODEL =
  ROUTER_CONFIG?.backends?.openrouter?.model ||
  process.env.OPENROUTER_MODEL ||
  'deepseek/deepseek-chat';

// DeepSeek Direct API (官方，繞過 OpenRouter 加價)
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
export const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com/v1';
export const DEEPSEEK_MODEL = 'deepseek-chat';

// LM Studio (Ollama fallback for local)
export const LM_STUDIO_BASE_URL =
  process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';
export const LM_STUDIO_API_KEY = process.env.LM_STUDIO_API_KEY || '';

// Gemini API (long documents, multi-image analysis)
export const GEMINI_API_KEY = process.env.GOOGLE_API_KEY || '';
export const GEMINI_MODEL =
  ROUTER_CONFIG?.backends?.gemini?.model ||
  process.env.GEMINI_MODEL ||
  'gemini-2.0-flash';
export const GEMINI_AUTO_THRESHOLD =
  ROUTER_CONFIG?.backends?.gemini?.auto_threshold ||
  parseInt(process.env.GEMINI_AUTO_THRESHOLD || '50000', 10);
