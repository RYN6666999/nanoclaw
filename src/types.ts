export interface AdditionalMount {
  hostPath: string; // Absolute path on host (supports ~ for home)
  containerPath: string; // Path inside container (under /workspace/extra/)
  readonly?: boolean; // Default: true for safety
}

/**
 * Mount Allowlist - Security configuration for additional mounts
 * This file should be stored at ~/.config/nanoclaw/mount-allowlist.json
 * and is NOT mounted into any container, making it tamper-proof from agents.
 */
export interface MountAllowlist {
  // Directories that can be mounted into containers
  allowedRoots: AllowedRoot[];
  // Glob patterns for paths that should never be mounted (e.g., ".ssh", ".gnupg")
  blockedPatterns: string[];
  // If true, non-main groups can only mount read-only regardless of config
  nonMainReadOnly: boolean;
}

export interface AllowedRoot {
  // Absolute path or ~ for home (e.g., "~/projects", "/var/repos")
  path: string;
  // Whether read-write mounts are allowed under this root
  allowReadWrite: boolean;
  // Optional description for documentation
  description?: string;
}

export interface ContainerConfig {
  additionalMounts?: AdditionalMount[];
  timeout?: number; // Default: 300000 (5 minutes)
  env?: Record<string, string>;
}

export interface RegisteredGroup {
  name: string;
  folder: string;
  trigger: string;
  added_at: string;
  containerConfig?: ContainerConfig;
}

export interface Session {
  [folder: string]: string;
}

export interface NewMessage {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
}

export interface ScheduledTask {
  id: string;
  group_folder: string;
  chat_jid: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode: 'group' | 'isolated';
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}

export interface TaskRunLog {
  task_id: string;
  run_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  result: string | null;
  error: string | null;
}

/** Session handoff summary returned by the handoff skill */
export interface HandoffSummary {
  title?: string;
  summary?: string;
  priority?: string;
  userPreferences?: string[];
  pitfalls?: { description: string; solution: string }[];
  goalAlignment?: { progress: string; assessment: string };
  commitSuggestion?: { shouldCommit: boolean; message: string };
  obsidianLog?: string;
  nextSessionPrompt?: string;
  changedFilesList?: string[];
}

/** OpenRouter-compatible tool call in SSE response */
export interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

/** OpenRouter-compatible chat message */
export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** PM2 process descriptor from `pm2 jlist` */
export interface PM2Process {
  name: string;
  pid: number;
  pm2_env: { status: string; pm_uptime: number; restart_time: number };
  monit: { memory: number; cpu: number };
}

/** Persisted handoff entry in handoff_suggestions.json */
export interface HandoffEntry {
  time: string;
  group: string;
  summary: HandoffSummary;
}

/** OpenRouter API response shape (chat completions) */
export interface OpenRouterResponse {
  choices?: Array<{
    message?: { content?: string; tool_calls?: ToolCall[] };
    delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
  }>;
}

/** Brave Search API response shape */
export interface BraveSearchResponse {
  web?: Array<{ title?: string; url?: string; description?: string }>;
}

/** DuckDuckGo instant answer API response shape */
export interface DDGSearchResponse {
  RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  AbstractText?: string;
  AbstractURL?: string;
}

/** Auto-commit action result */
export interface HandoffAction {
  group: string;
  message: string;
  committed: boolean;
}
