/**
 * Shared Telegram bot instance — isolated to prevent circular dependencies.
 */
import type { Bot } from 'grammy';

let bot: Bot | null = null;

export function getBot(): Bot | null {
  return bot;
}

export function setBot(b: Bot | null): void {
  bot = b;
}
