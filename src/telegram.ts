/**
 * Telegram Channel for NanoClaw
 * Uses grammY for robust polling with built-in retry/backoff.
 */
import fs from 'fs';

import { Bot, GrammyError, HttpError, InputFile } from 'grammy';

import { ASSISTANT_NAME, MAIN_GROUP_FOLDER } from './config.js';
import {
  getMessagesSince,
  storeTelegramMessage,
} from './db.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

const TG_JID_PREFIX = 'tg:';

export function makeTelegramJid(chatId: number): string {
  return `${TG_JID_PREFIX}${chatId}`;
}

export function isTelegramJid(jid: string): boolean {
  return jid.startsWith(TG_JID_PREFIX);
}

export function getTelegramChatId(jid: string): number {
  return parseInt(jid.slice(TG_JID_PREFIX.length), 10);
}

interface TelegramConfig {
  runAgent: (
    group: RegisteredGroup,
    prompt: string,
    chatJid: string,
    streamCallbacks?: {
      onStreamChunk: (chunk: string) => Promise<void>;
      onStreamDone: () => Promise<string>;
    },
    imageBase64?: string,
    imageMimeType?: string,
  ) => Promise<string | null>;
  getRegisteredGroups: () => Record<string, RegisteredGroup>;
  getSessions: () => Record<string, string>;
  saveSessions: () => void;
  lastAgentTimestamp: Record<string, string>;
  saveState: () => void;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
}

let bot: Bot | null = null;

export function getTelegramBot(): Bot | null {
  return bot;
}

export async function connectTelegram(
  token: string,
  config: TelegramConfig,
): Promise<void> {
  bot = new Bot(token);

  // Global error boundary — catches all unhandled errors
  bot.catch((err) => {
    const ctx = err.ctx;
    const e = err.error;

    if (e instanceof GrammyError) {
      logger.error(
        { code: e.error_code, description: e.description, method: e.method },
        'Telegram API error',
      );
    } else if (e instanceof HttpError) {
      logger.error({ err: e.message }, 'Telegram HTTP/network error');
    } else {
      logger.error({ err: e, updateId: ctx?.update?.update_id }, 'Telegram handler error');
    }
  });

  // Handle photo messages
  bot.on('message:photo', async (ctx) => {
    const msg = ctx.message;
    const botId = ctx.me.id;
    if (msg.from.id === botId) return;

    const chatJid = makeTelegramJid(msg.chat.id);
    const timestamp = new Date(msg.date * 1000).toISOString();
    const senderName =
      msg.from.first_name ||
      msg.from.username ||
      String(msg.from.id);
    const sender = String(msg.from.id);
    const caption = msg.caption || '';

    // Store caption as message text
    storeTelegramMessage(
      String(msg.message_id),
      chatJid,
      sender,
      senderName,
      caption || '[圖片]',
      timestamp,
      false,
    );

    // Check if this chat is registered
    const registeredGroups = config.getRegisteredGroups();
    const group = registeredGroups[chatJid];
    if (!group) return;

    // Get highest resolution photo
    const photo = msg.photo[msg.photo.length - 1];
    const file = await ctx.api.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    // Download and convert to base64
    let imageBase64: string;
    try {
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error(`Failed to download photo: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      imageBase64 = buffer.toString('base64');
    } catch (err) {
      logger.error({ err }, 'Failed to download Telegram photo');
      return;
    }

    // Determine MIME type from file path
    const ext = file.file_path?.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
    const mimeType = mimeMap[ext] || 'image/jpeg';

    logger.info(
      { chat: msg.chat.id, fileSize: photo.file_size, mimeType },
      'Processing Telegram photo',
    );

    // Keep typing indicator alive
    await ctx.replyWithChatAction('typing');
    const typingInterval = setInterval(async () => {
      try {
        await bot!.api.sendChatAction(msg.chat.id, 'typing');
      } catch { /* best effort */ }
    }, 4000);

    // Build prompt with caption context
    const prompt = caption
      ? `<messages>\n<message sender="${senderName}" time="${timestamp}">${caption}</message>\n</messages>`
      : `<messages>\n<message sender="${senderName}" time="${timestamp}">[用戶發送了一張圖片，請描述並分析]</message>\n</messages>`;

    const response = await config.runAgent(group, prompt, chatJid, undefined, imageBase64, mimeType);
    clearInterval(typingInterval);

    if (response) {
      config.lastAgentTimestamp[chatJid] = timestamp;
      config.saveState();

      storeTelegramMessage(
        `bot-${Date.now()}`,
        chatJid,
        'bot',
        ASSISTANT_NAME,
        response,
        new Date().toISOString(),
        true,
      );

      await sendTelegramMessage(msg.chat.id, response);
    }
  });

  // Handle text messages
  bot.on('message:text', async (ctx) => {
    const msg = ctx.message;
    const botId = ctx.me.id;
    if (msg.from.id === botId) return;

    const chatJid = makeTelegramJid(msg.chat.id);
    const timestamp = new Date(msg.date * 1000).toISOString();
    const senderName =
      msg.from.first_name ||
      msg.from.username ||
      String(msg.from.id);
    const sender = String(msg.from.id);

    // Store the message
    storeTelegramMessage(
      String(msg.message_id),
      chatJid,
      sender,
      senderName,
      msg.text,
      timestamp,
      false,
    );

    // Auto-register this chat as main group if no main group exists
    const registeredGroups = config.getRegisteredGroups();
    let group = registeredGroups[chatJid];
    if (!group) {
      const mainExists = Object.values(registeredGroups).some(
        (g) => g.folder === MAIN_GROUP_FOLDER,
      );
      if (!mainExists) {
        const chatName =
          msg.chat.title ||
          ('first_name' in msg.chat ? msg.chat.first_name : undefined) ||
          ('username' in msg.chat ? msg.chat.username : undefined) ||
          `Telegram ${msg.chat.id}`;
        config.registerGroup(chatJid, {
          name: chatName,
          folder: MAIN_GROUP_FOLDER,
          trigger: 'all',
          added_at: new Date().toISOString(),
        });
        group = config.getRegisteredGroups()[chatJid];
        logger.info(
          { chatJid, chatName },
          'Auto-registered Telegram chat as main group',
        );
      } else {
        return;
      }
    }

    // Check trigger: 'all' = respond to everything, otherwise match pattern
    if (group.trigger && group.trigger !== 'all') {
      const triggerMatch = msg.text.includes(group.trigger) ||
        msg.text.startsWith('/');  // slash commands always pass
      if (!triggerMatch) return;
    }

    // Build context from missed messages
    const sinceTimestamp = config.lastAgentTimestamp[chatJid] || '';
    const missedMessages = getMessagesSince(chatJid, sinceTimestamp);

    const lines = missedMessages.map((m) => {
      const escapeXml = (s: string) =>
        s
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      return `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}">${escapeXml(m.content)}</message>`;
    });
    const prompt = `<messages>\n${lines.join('\n')}\n</messages>`;

    if (!prompt) return;

    logger.info(
      { chat: msg.chat.id, messageCount: missedMessages.length },
      'Processing Telegram message',
    );

    // Keep "typing..." indicator alive every 4s (TG auto-clears after 5s)
    await ctx.replyWithChatAction('typing');
    const typingInterval = setInterval(async () => {
      try {
        await bot!.api.sendChatAction(msg.chat.id, 'typing');
      } catch {
        // Ignore — best effort
      }
    }, 4000);

    // Create streaming controller for this chat
    const stream = createTelegramStream(msg.chat.id);
    const streamCallbacks = {
      onStreamChunk: (chunk: string) => stream.push(chunk),
      onStreamDone: () => stream.finalize(),
    };

    const response = await config.runAgent(group, prompt, chatJid, streamCallbacks);
    clearInterval(typingInterval);

    if (response) {
      // Finalize stream (flush remaining buffer)
      await stream.finalize();

      config.lastAgentTimestamp[chatJid] = timestamp;
      config.saveState();

      storeTelegramMessage(
        `bot-${Date.now()}`,
        chatJid,
        'bot',
        ASSISTANT_NAME,
        response,
        new Date().toISOString(),
        true,
      );

      // If stream already sent the message, don't send again
      if (!stream.getMessageId()) {
        await sendTelegramMessage(msg.chat.id, response);
      }
    }
  });

  // Validate token
  const botInfo = await bot.api.getMe();
  logger.info(
    { botUsername: botInfo.username, botId: botInfo.id },
    'Connected to Telegram (grammY)',
  );

  // Start long polling with retry on 409 conflict
  const startPolling = async (attempt = 1): Promise<void> => {
    try {
      await bot!.start({
        onStart: () => logger.info('Telegram polling started'),
        drop_pending_updates: true,
      });
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 409) {
        const delay = Math.min(5000 * attempt, 30000);
        logger.warn(
          { attempt, delayMs: delay },
          'Telegram 409 conflict — another poller active, retrying',
        );
        await new Promise((r) => setTimeout(r, delay));
        return startPolling(attempt + 1);
      }
      throw err;
    }
  };
  startPolling().catch((err) => {
    logger.error({ err }, 'Telegram polling failed permanently');
  });
}

/**
 * Convert LLM Markdown output to Telegram-compatible HTML.
 * Telegram supports: <b>, <i>, <code>, <pre>, <a href="">, <s>, <u>
 */
function markdownToTelegramHtml(md: string): string {
  const escHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = md.split('\n');
  const out: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (const line of lines) {
    // Code block fence
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        // Close code block
        out.push(`<pre>${escHtml(codeBlockLines.join('\n'))}</pre>`);
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Skip markdown table separator rows (|---|---|)
    if (/^\|[\s\-:|]+\|$/.test(line.trim())) continue;

    // Convert table rows: | a | b | → a  b
    let processed = line;
    if (/^\|.*\|$/.test(processed.trim())) {
      processed = processed
        .trim()
        .slice(1, -1)              // remove outer pipes
        .split('|')
        .map((cell) => cell.trim())
        .join('  ');
    }

    // Escape HTML entities first
    processed = escHtml(processed);

    // Inline code (before bold/italic to avoid conflicts)
    processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold: **text** or __text__
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    processed = processed.replace(/__(.+?)__/g, '<b>$1</b>');

    // Italic: *text* or _text_ (but not inside words like file_name)
    processed = processed.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '<i>$1</i>');
    processed = processed.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<i>$1</i>');

    // Strikethrough: ~~text~~
    processed = processed.replace(/~~(.+?)~~/g, '<s>$1</s>');

    // Markdown links: [text](url)
    processed = processed.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2">$1</a>',
    );

    // Headers: # → bold
    processed = processed.replace(/^#{1,6}\s+(.+)/, '<b>$1</b>');

    out.push(processed);
  }

  // Unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    out.push(`<pre>${escHtml(codeBlockLines.join('\n'))}</pre>`);
  }

  return out.join('\n');
}

export async function sendTelegramMessage(
  chatId: number,
  text: string,
): Promise<void> {
  if (!bot) {
    logger.error('Telegram bot not initialized');
    return;
  }

  // Check for [IMAGE:/path] markers — send as photo
  const imageMatch = text.match(/\[IMAGE:([^\]]+)\]/);
  if (imageMatch) {
    const imagePath = imageMatch[1];
    const caption = text.replace(/\[IMAGE:[^\]]+\]\n?/, '').trim();

    try {
      if (fs.existsSync(imagePath)) {
        await bot.api.sendPhoto(chatId, new InputFile(imagePath), {
          caption: caption.slice(0, 1024), // TG caption limit
        });
        logger.info({ chatId, imagePath }, 'Telegram photo sent');
        // Clean up temp file
        fs.unlinkSync(imagePath);
        return;
      }
    } catch (err) {
      logger.error({ chatId, imagePath, err }, 'Failed to send Telegram photo');
      // Fall through to send as text
    }
  }

  const html = markdownToTelegramHtml(text);
  try {
    await bot.api.sendMessage(chatId, html, { parse_mode: 'HTML' });
    logger.info({ chatId, length: text.length }, 'Telegram message sent');
  } catch (err) {
    // Fallback: if HTML parse fails, send as plain text
    if (err instanceof GrammyError && err.error_code === 400) {
      logger.warn({ chatId }, 'HTML parse failed, falling back to plain text');
      try {
        await bot.api.sendMessage(chatId, text);
        return;
      } catch (fallbackErr) {
        logger.error({ chatId, err: fallbackErr }, 'Plain text fallback also failed');
        return;
      }
    }
    if (err instanceof GrammyError) {
      logger.error(
        { chatId, code: err.error_code, description: err.description },
        'Failed to send Telegram message',
      );
    } else {
      logger.error({ chatId, err }, 'Failed to send Telegram message');
    }
  }
}

/**
 * Stream a message to Telegram — send initial message then update it.
 * Returns a controller for pushing chunks and finalizing.
 */
export function createTelegramStream(chatId: number) {
  if (!bot) throw new Error('Telegram bot not initialized');

  let messageId: number | null = null;
  let buffer = '';
  let lastEditTime = 0;
  let editTimer: ReturnType<typeof setTimeout> | null = null;
  const MIN_EDIT_INTERVAL = 1500; // Telegram rate limit ~1/sec, use 1.5s for safety
  const botRef = bot;

  async function flush() {
    if (!messageId || !buffer) return;
    const html = markdownToTelegramHtml(buffer);
    try {
      await botRef.api.editMessageText(chatId, messageId, html, { parse_mode: 'HTML' });
      lastEditTime = Date.now();
    } catch (err) {
      // If HTML fails, try plain text
      if (err instanceof GrammyError && err.error_code === 400) {
        try {
          await botRef.api.editMessageText(chatId, messageId, buffer);
          lastEditTime = Date.now();
        } catch {
          // Ignore edit failures during streaming
        }
      }
    }
  }

  return {
    /** Push a text chunk. Will buffer and edit at rate-limited intervals. */
    async push(chunk: string) {
      buffer += chunk;

      // First chunk: send initial message
      if (!messageId) {
        try {
          const html = markdownToTelegramHtml(buffer);
          const msg = await botRef.api.sendMessage(chatId, html, { parse_mode: 'HTML' });
          messageId = msg.message_id;
          lastEditTime = Date.now();
        } catch {
          const msg = await botRef.api.sendMessage(chatId, buffer);
          messageId = msg.message_id;
          lastEditTime = Date.now();
        }
        return;
      }

      // Rate-limited edit
      const timeSinceLastEdit = Date.now() - lastEditTime;
      if (timeSinceLastEdit >= MIN_EDIT_INTERVAL) {
        if (editTimer) clearTimeout(editTimer);
        await flush();
      } else if (!editTimer) {
        editTimer = setTimeout(async () => {
          editTimer = null;
          await flush();
        }, MIN_EDIT_INTERVAL - timeSinceLastEdit);
      }
    },

    /** Finalize: flush remaining buffer and return the full text. */
    async finalize(): Promise<string> {
      if (editTimer) {
        clearTimeout(editTimer);
        editTimer = null;
      }
      await flush();
      logger.info({ chatId, length: buffer.length }, 'Telegram stream completed');
      return buffer;
    },

    /** Get current buffer content */
    getBuffer(): string {
      return buffer;
    },

    /** Get the message ID (for storing in DB) */
    getMessageId(): number | null {
      return messageId;
    },
  };
}

export async function stopTelegram(): Promise<void> {
  if (bot) {
    await bot.stop();
    logger.info('Telegram bot stopped');
  }
}
