import type { RegisteredGroup } from '../types.js';

export interface TelegramConfig {
  runAgent: (
    group: RegisteredGroup,
    prompt: string,
    chatJid: string,
    streamCallbacks?: {
      onStreamChunk: (chunk: string) => Promise<void>;
      onStreamDone: () => Promise<string>;
    },
    imageData?: { imageBase64: string; imageMimeType: string },
  ) => Promise<string | null>;
  getRegisteredGroups: () => Record<string, RegisteredGroup>;
  getSessions: () => Record<string, string>;
  saveSessions: () => void;
  lastAgentTimestamp: Record<string, string>;
  saveState: () => void;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
}
