/**
 * Telegram message sending and streaming utilities.
 */
import fs from 'fs';

import { GrammyError, InputFile } from 'grammy';

import { logger } from '../logger.js';
import { getBot } from './state.js';
import { markdownToTelegramHtml } from './utils.js';

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  options?: { showNsfwKeyboard?: boolean },
): Promise<void> {
  const bot = getBot();
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
          caption: caption.slice(0, 1024),
        });
        logger.info({ chatId, imagePath }, 'Telegram photo sent');
        fs.unlinkSync(imagePath);
        return;
      }
    } catch (err) {
      logger.error({ chatId, imagePath, err }, 'Failed to send Telegram photo');
    }
  }

  // Build reply markup for workflow shortcuts
  const replyMarkup = options?.showNsfwKeyboard
    ? {
        keyboard: [
          [{ text: '💬 聊天基礎' }, { text: '🔥 聊天進階' }],
          [{ text: '🎨 指定生圖' }, { text: '📱 頻道管理' }],
          [{ text: '🛠️ 安裝技能' }, { text: '🧠 更新記憶' }],
          [{ text: '📝 產生 handoff' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        is_persistent: true,
      }
    : {
        keyboard: [[{ text: '📝 產生 handoff' }]],
        resize_keyboard: true,
        one_time_keyboard: false,
        is_persistent: true,
      };

  const html = markdownToTelegramHtml(text);
  try {
    await bot.api.sendMessage(chatId, html, {
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    });
    logger.info({ chatId, length: text.length }, 'Telegram message sent');
  } catch (err) {
    if (err instanceof GrammyError && err.error_code === 400) {
      logger.warn({ chatId }, 'HTML parse failed, falling back to plain text');
      try {
        await bot.api.sendMessage(chatId, text, { reply_markup: replyMarkup });
        return;
      } catch (fallbackErr) {
        logger.error(
          { chatId, err: fallbackErr },
          'Plain text fallback also failed',
        );
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
export function createTelegramStream(
  chatId: number,
  options?: { showNsfwKeyboard?: boolean },
) {
  const bot = getBot();
  if (!bot) throw new Error('Telegram bot not initialized');

  let messageId: number | null = null;
  let buffer = '';
  let lastEditTime = 0;
  let editTimer: ReturnType<typeof setTimeout> | null = null;
  const MIN_EDIT_INTERVAL = 1500;
  const botRef = bot;

  const replyMarkup = options?.showNsfwKeyboard
    ? {
        keyboard: [
          [{ text: '💬 聊天基礎' }, { text: '🔥 聊天進階' }],
          [{ text: '🎨 指定生圖' }, { text: '📱 頻道管理' }],
          [{ text: '🛠️ 安裝技能' }, { text: '🧠 更新記憶' }],
          [{ text: '📝 產生 handoff' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        is_persistent: true,
      }
    : {
        keyboard: [[{ text: '📝 產生 handoff' }]],
        resize_keyboard: true,
        one_time_keyboard: false,
        is_persistent: true,
      };

  async function flush() {
    if (!messageId || !buffer) return;
    const html = markdownToTelegramHtml(buffer);
    try {
      await botRef.api.editMessageText(chatId, messageId, html, {
        parse_mode: 'HTML',
      });
      lastEditTime = Date.now();
    } catch (err) {
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
    async push(chunk: string) {
      buffer += chunk;

      if (!messageId) {
        try {
          const html = markdownToTelegramHtml(buffer);
          const msg = await botRef.api.sendMessage(chatId, html, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          });
          messageId = msg.message_id;
          lastEditTime = Date.now();
        } catch {
          const msg = await botRef.api.sendMessage(chatId, buffer, {
            reply_markup: replyMarkup,
          });
          messageId = msg.message_id;
          lastEditTime = Date.now();
        }
        return;
      }

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

    async finalize(): Promise<string> {
      if (editTimer) {
        clearTimeout(editTimer);
        editTimer = null;
      }
      await flush();
      logger.info(
        { chatId, length: buffer.length },
        'Telegram stream completed',
      );
      return buffer;
    },

    getBuffer(): string {
      return buffer;
    },

    getMessageId(): number | null {
      return messageId;
    },
  };
}
