/**
 * Telegram Channel for NanoClaw
 * Uses grammY for robust polling with built-in retry/backoff.
 */
import { Bot, GrammyError, HttpError } from 'grammy';

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

    // Build context from missed messages
    const sinceTimestamp = config.lastAgentTimestamp[chatJid] || '';
    const missedMessages = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);

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

    await ctx.replyWithChatAction('typing');

    const response = await config.runAgent(group, prompt, chatJid);

    if (response) {
      config.lastAgentTimestamp[chatJid] = timestamp;
      config.saveState();

      storeTelegramMessage(
        `bot-${Date.now()}`,
        chatJid,
        'bot',
        ASSISTANT_NAME,
        `${ASSISTANT_NAME}: ${response}`,
        new Date().toISOString(),
        true,
      );

      await sendTelegramMessage(msg.chat.id, response);
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

export async function sendTelegramMessage(
  chatId: number,
  text: string,
): Promise<void> {
  if (!bot) {
    logger.error('Telegram bot not initialized');
    return;
  }
  try {
    await bot.api.sendMessage(chatId, text);
    logger.info({ chatId, length: text.length }, 'Telegram message sent');
  } catch (err) {
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

export async function stopTelegram(): Promise<void> {
  if (bot) {
    await bot.stop();
    logger.info('Telegram bot stopped');
  }
}
