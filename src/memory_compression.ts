import Database from 'better-sqlite3';
import { STORE_DIR } from './config.js';

let db: Database.Database;

const CONFIG = {
  RAW_MESSAGE_RETENTION: 5,
  COMPRESSION_INTERVAL: 10,
  MAX_SUMMARY_LENGTH: 500,
  SIMILARITY_THRESHOLD: 0.7,
};

export interface ConversationSummary {
  id: number;
  chat_jid: string;
  summary_text: string;
  message_range_start: string;
  message_range_end: string;
  message_count: number;
  created_at: string;
  token_estimate: number;
}

export interface RawMessage {
  id: string;
  chat_jid: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  token_count?: number;
}

export function initMemoryCompression(database: Database.Database): void {
  db = database;
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_jid TEXT NOT NULL,
      summary_text TEXT NOT NULL,
      message_range_start TEXT NOT NULL,
      message_range_end TEXT NOT NULL,
      message_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      token_estimate INTEGER DEFAULT 0
    );
    
    CREATE INDEX IF NOT EXISTS idx_summaries_chat ON conversation_summaries(chat_jid, created_at);
    
    CREATE TABLE IF NOT EXISTS conversation_context (
      chat_jid TEXT PRIMARY KEY,
      recent_messages TEXT,
      summary_ids TEXT,
      total_messages INTEGER DEFAULT 0,
      last_compression TEXT,
      updated_at TEXT
    );
    
    CREATE TABLE IF NOT EXISTS message_tokens (
      message_id TEXT PRIMARY KEY,
      chat_jid TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      compressed INTEGER DEFAULT 0,
      created_at TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_message_tokens ON message_tokens(chat_jid, created_at);
  `);
}

export function storeMessageWithTracking(
  messageId: string,
  chatJid: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  timestamp: string,
  tokenCount: number
): void {
  db.prepare(`
    INSERT INTO message_tokens (message_id, chat_jid, token_count, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET token_count = excluded.token_count
  `).run(messageId, chatJid, tokenCount, timestamp);
  
  updateConversationContext(chatJid, {
    id: messageId,
    chat_jid: chatJid,
    role,
    content,
    timestamp,
    token_count: tokenCount,
  });
  
  checkAndCompress(chatJid);
}

function updateConversationContext(chatJid: string, message: RawMessage): void {
  const existing = db.prepare(`
    SELECT recent_messages, total_messages FROM conversation_context WHERE chat_jid = ?
  `).get(chatJid) as { recent_messages: string; total_messages: number } | undefined;
  
  let recentMessages: RawMessage[] = [];
  let totalMessages = 0;
  
  if (existing) {
    recentMessages = JSON.parse(existing.recent_messages || '[]');
    totalMessages = existing.total_messages;
  }
  
  recentMessages.push(message);
  totalMessages++;
  
  if (recentMessages.length > CONFIG.RAW_MESSAGE_RETENTION) {
    recentMessages = recentMessages.slice(-CONFIG.RAW_MESSAGE_RETENTION);
  }
  
  db.prepare(`
    INSERT INTO conversation_context (chat_jid, recent_messages, total_messages, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(chat_jid) DO UPDATE SET
      recent_messages = excluded.recent_messages,
      total_messages = excluded.total_messages,
      updated_at = excluded.updated_at
  `).run(chatJid, JSON.stringify(recentMessages), totalMessages, new Date().toISOString());
}

function checkAndCompress(chatJid: string): void {
  const stats = db.prepare(`
    SELECT COUNT(*) as count FROM message_tokens 
    WHERE chat_jid = ? AND compressed = 0
  `).get(chatJid) as { count: number };
  
  if (stats.count >= CONFIG.COMPRESSION_INTERVAL) {
    compressConversation(chatJid);
  }
}

export function compressConversation(chatJid: string): void {
  const messagesToCompress = db.prepare(`
    SELECT message_id, token_count FROM message_tokens 
    WHERE chat_jid = ? AND compressed = 0
    ORDER BY created_at ASC
    LIMIT ?
  `).all(chatJid, CONFIG.COMPRESSION_INTERVAL) as { message_id: string; token_count: number }[];
  
  if (messagesToCompress.length === 0) return;
  
  const messageIds = messagesToCompress.map(m => m.message_id);
  const totalTokens = messagesToCompress.reduce((sum, m) => sum + m.token_count, 0);
  
  const messageContents = db.prepare(`
    SELECT content, timestamp FROM messages 
    WHERE id IN (${messageIds.map(() => '?').join(',')})
    ORDER BY timestamp ASC
  `).all(...messageIds) as { content: string; timestamp: string }[];
  
  const summaryText = generateSummary(messageContents);
  
  const startTime = messageContents[0]?.timestamp;
  const endTime = messageContents[messageContents.length - 1]?.timestamp;
  
  const result = db.prepare(`
    INSERT INTO conversation_summaries 
    (chat_jid, summary_text, message_range_start, message_range_end, message_count, created_at, token_estimate)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(chatJid, summaryText, startTime, endTime, messageIds.length, new Date().toISOString(), estimateTokenCount(summaryText));
  
  const placeholders = messageIds.map(() => '?').join(',');
  db.prepare(`
    UPDATE message_tokens SET compressed = 1 WHERE message_id IN (${placeholders})
  `).run(...messageIds);
  
  updateContextWithSummary(chatJid, result.lastInsertRowid as number);
  
  console.log(`[Memory Compression] Compressed ${messageIds.length} messages (~${totalTokens} tokens) into summary (~${estimateTokenCount(summaryText)} tokens) for ${chatJid}`);
}

function generateSummary(messages: { content: string; timestamp: string }[]): string {
  const contents = messages.map(m => m.content);
  
  const keyPoints = contents
    .filter((_, i) => i % 2 === 0)
    .map(c => c.split(/[.!?。！？]/)[0].trim())
    .filter(c => c.length > 5)
    .slice(0, 5);
  
  return `對話主題: ${keyPoints.join(' | ')}`;
}

function updateContextWithSummary(chatJid: string, summaryId: number): void {
  const context = db.prepare(`
    SELECT summary_ids FROM conversation_context WHERE chat_jid = ?
  `).get(chatJid) as { summary_ids: string } | undefined;
  
  let summaryIds: number[] = [];
  if (context?.summary_ids) {
    summaryIds = JSON.parse(context.summary_ids);
  }
  
  summaryIds.push(summaryId);
  
  if (summaryIds.length > 10) {
    summaryIds = summaryIds.slice(-10);
  }
  
  db.prepare(`
    UPDATE conversation_context 
    SET summary_ids = ?, last_compression = ?
    WHERE chat_jid = ?
  `).run(JSON.stringify(summaryIds), new Date().toISOString(), chatJid);
}

export function getCompressedContext(chatJid: string): {
  summaries: ConversationSummary[];
  recentMessages: RawMessage[];
  totalOriginalTokens: number;
  compressedTokens: number;
} {
  const context = db.prepare(`
    SELECT summary_ids, recent_messages FROM conversation_context WHERE chat_jid = ?
  `).get(chatJid) as { summary_ids: string; recent_messages: string } | undefined;
  
  let summaries: ConversationSummary[] = [];
  let recentMessages: RawMessage[] = [];
  
  if (context?.summary_ids) {
    const summaryIds = JSON.parse(context.summary_ids);
    if (summaryIds.length > 0) {
      const placeholders = summaryIds.map(() => '?').join(',');
      summaries = db.prepare(`
        SELECT * FROM conversation_summaries WHERE id IN (${placeholders}) ORDER BY created_at ASC
      `).all(...summaryIds) as ConversationSummary[];
    }
  }
  
  if (context?.recent_messages) {
    recentMessages = JSON.parse(context.recent_messages);
  }
  
  const totalOriginalTokens = summaries.reduce((sum, s) => sum + (s.token_estimate * 10), 0) +
    recentMessages.reduce((sum, m) => sum + (m.token_count || 0), 0);
  const compressedTokens = summaries.reduce((sum, s) => sum + s.token_estimate, 0) +
    recentMessages.reduce((sum, m) => sum + (m.token_count || 0), 0);
  
  return {
    summaries,
    recentMessages,
    totalOriginalTokens,
    compressedTokens,
  };
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export function forceCompression(chatJid: string): { 
  messagesCompressed: number; 
  tokenReduction: number;
  summaryId: number | null;
} {
  const before = db.prepare(`
    SELECT COUNT(*) as count FROM message_tokens WHERE chat_jid = ? AND compressed = 0
  `).get(chatJid) as { count: number };
  
  if (before.count === 0) {
    return { messagesCompressed: 0, tokenReduction: 0, summaryId: null };
  }
  
  compressConversation(chatJid);
  
  const context = getCompressedContext(chatJid);
  
  return {
    messagesCompressed: before.count,
    tokenReduction: context.totalOriginalTokens - context.compressedTokens,
    summaryId: context.summaries[context.summaries.length - 1]?.id || null,
  };
}

export function getCompressionStats(chatJid: string): {
  totalMessages: number;
  compressedMessages: number;
  summariesCount: number;
  estimatedTokenSavings: number;
} {
  const total = db.prepare(`
    SELECT COUNT(*) as count FROM message_tokens WHERE chat_jid = ?
  `).get(chatJid) as { count: number };
  
  const compressed = db.prepare(`
    SELECT COUNT(*) as count FROM message_tokens WHERE chat_jid = ? AND compressed = 1
  `).get(chatJid) as { count: number };
  
  const summaries = db.prepare(`
    SELECT COUNT(*) as count FROM conversation_summaries WHERE chat_jid = ?
  `).get(chatJid) as { count: number };
  
  const context = getCompressedContext(chatJid);
  
  return {
    totalMessages: total.count,
    compressedMessages: compressed.count,
    summariesCount: summaries.count,
    estimatedTokenSavings: context.totalOriginalTokens - context.compressedTokens,
  };
}

export function clearCompressionData(chatJid: string): void {
  db.prepare(`DELETE FROM conversation_summaries WHERE chat_jid = ?`).run(chatJid);
  db.prepare(`DELETE FROM conversation_context WHERE chat_jid = ?`).run(chatJid);
  db.prepare(`DELETE FROM message_tokens WHERE chat_jid = ?`).run(chatJid);
}
