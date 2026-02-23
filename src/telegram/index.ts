/**
 * Telegram Channel for NanoClaw
 * Uses grammY for robust polling with built-in retry/backoff.
 *
 * Submodules:
 *   handlers.ts — bot.on() event handlers
 *   stream.ts   — sendTelegramMessage, createTelegramStream
 *   utils.ts    — enrichPrompt, markdownToTelegramHtml, JID helpers
 *   types.ts    — TelegramConfig interface
 *   state.ts    — shared bot instance
 */

import { Bot, GrammyError, HttpError } from 'grammy';

import { logger } from '../logger.js';
import { registerHandlers } from './handlers.js';
import { getBot, setBot } from './state.js';
import type { TelegramConfig } from './types.js';

// Re-export public API
export { makeTelegramJid, isTelegramJid, getTelegramChatId } from './utils.js';
export { sendTelegramMessage, createTelegramStream } from './stream.js';
export type { TelegramConfig } from './types.js';

export function getTelegramBot(): Bot | null {
  return getBot();
}

export async function connectTelegram(
  token: string,
  config: TelegramConfig,
): Promise<void> {
  const bot = new Bot(token);
  setBot(bot);

  // 註冊 Telegram slash menu 指令
  await bot.api.setMyCommands([
    { command: 'handoff', description: '手動產生 session handoff 建議' },
    { command: 'status', description: '顯示系統狀態' },
    { command: 'restart', description: '重啟 bot 進程' },
    { command: 'menu', description: '顯示快捷選單' },
  ]);

  // Global error boundary
  bot.catch((err) => {
    const ctx = err.ctx;
    const e = err.error;
    logger.error({ err: e, ctx }, 'Error caught by grammY');

    if (e instanceof GrammyError) {
      logger.error(
        { code: e.error_code, description: e.description, method: e.method },
        'Telegram API error',
      );
    } else if (e instanceof HttpError) {
      logger.error({ err: e.message }, 'Telegram HTTP/network error');
    } else {
      logger.error(
        { err: e, updateId: ctx?.update?.update_id },
        'Telegram handler error',
      );
    }
  });

  // Register all handlers
  registerHandlers(bot, token, config);

  // Validate token
  const botInfo = await bot.api.getMe();
  logger.info(
    { botUsername: botInfo.username, botId: botInfo.id },
    'Connected to Telegram (grammY)',
  );

  // Start long polling with 409 conflict resolution
  const startPolling = async (attempt = 1): Promise<void> => {
    try {
      await bot.start({
        onStart: () => logger.info('Telegram polling started'),
        drop_pending_updates: true,
        allowed_updates: ['message', 'channel_post'],
      });
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 409) {
        logger.warn(
          { attempt },
          'Telegram 409 conflict detected — forcefully clearing webhook and retrying',
        );

        try {
          await bot.api.deleteWebhook({ drop_pending_updates: true });
          logger.info('Webhook cleared successfully');
        } catch (webhookErr) {
          logger.warn(
            { err: webhookErr },
            'Failed to clear webhook (may not exist)',
          );
        }

        const delay = Math.min(2000 * attempt, 10000);
        await new Promise((r) => setTimeout(r, delay));

        if (attempt < 3) {
          return startPolling(attempt + 1);
        } else {
          logger.error(
            'Failed to start polling after 3 attempts. Please check for duplicate instances.',
          );
          throw new Error(
            'Telegram 409: Multiple bot instances detected. Stop other instances first.',
          );
        }
      }
      throw err;
    }
  };
  startPolling().catch((err) => {
    logger.error({ err }, 'Telegram polling failed permanently');
  });
}

export async function stopTelegram(): Promise<void> {
  const bot = getBot();
  if (bot) {
    await bot.stop();
    logger.info('Telegram bot stopped');
  }
}
