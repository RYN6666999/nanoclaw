/**
 * Telegram Channel for NanoClaw
 * Connects to Telegram via Bot API and routes messages to the agent.
 */
import TelegramBot from 'node-telegram-bot-api';

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

let bot: TelegramBot | null = null;

export function getTelegramBot(): TelegramBot | null {
  return bot;
}

export async function connectTelegram(
  token: string,
  config: TelegramConfig,
): Promise<void> {
  bot = new TelegramBot(token, { polling: true });

  const botInfo = await bot.getMe();
  logger.info(
    { botUsername: botInfo.username, botId: botInfo.id },
    'Connected to Telegram',
  );

  bot.on('message', async (msg) => {
    if (!msg.text) return;
    if (msg.from?.id === botInfo.id) return;

    const chatJid = makeTelegramJid(msg.chat.id);
    const timestamp = new Date(msg.date * 1000).toISOString();
    const senderName =
      msg.from?.first_name ||
      msg.from?.username ||
      String(msg.from?.id || 'unknown');
    const sender = String(msg.from?.id || 'unknown');

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
          msg.chat.first_name ||
          msg.chat.username ||
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

    await bot!.sendChatAction(msg.chat.id, 'typing');

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

  bot.on('polling_error', (err) => {
    logger.error({ err: err.message }, 'Telegram polling error');
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
    await bot.sendMessage(chatId, text);
    logger.info({ chatId, length: text.length }, 'Telegram message sent');
  } catch (err) {
    logger.error({ chatId, err }, 'Failed to send Telegram message');
  }
}
