/**
 * Extracted command handlers — /status, /restart, /menu, /start, /draw, handoff, SeMeow shortcuts.
 */
import fs from 'fs';

import type { Bot, Context } from 'grammy';
import { InputFile } from 'grammy';

import type { PM2Process } from '../types.js';
import {
  ASSISTANT_NAME,
  SE_MEOW_BOX_CHANNEL_ID,
  AUTO_COMMIT_ENABLED,
  PM2_CMD_PREFIX,
} from '../config.js';
import { storeTelegramMessage } from '../db.js';
import { logger } from '../logger.js';
import { getToolHandler } from '../tools/index.js';
import type { TelegramConfig } from './types.js';
import { makeTelegramJid, enrichPrompt } from './utils.js';
import { sendTelegramMessage } from './stream.js';

/** Persistent handoff keyboard */
export const handoffKeyboard = {
  keyboard: [[{ text: '📝 產生 handoff' }]],
  resize_keyboard: true,
  one_time_keyboard: false,
  is_persistent: true,
};

/**
 * Handle the '📝 產生 handoff' button press.
 * Returns true if handled, false otherwise.
 */
export async function handleHandoffButton(
  ctx: Context,
  chatJid: string,
  config: TelegramConfig,
): Promise<boolean> {
  const msg = ctx.message;
  if (!msg || !('text' in msg) || msg.text !== '📝 產生 handoff') return false;

  const registeredGroups = config.getRegisteredGroups();
  const group = registeredGroups[chatJid];
  if (!group) {
    await ctx.reply('此聊天尚未註冊為群組，無法產生 handoff。', { reply_markup: handoffKeyboard });
    return true;
  }
  const hostAgent = await import('../host-agent.js');
  const summary = await hostAgent.triggerHandoffForGroup(group.folder);
  const { formatHandoffLines } = await import('../handoff-service.js');
  const text = formatHandoffLines(group.name, summary).join('\n');
  await ctx.reply(text, { reply_markup: handoffKeyboard });
  return true;
}

/**
 * Apply SeMeow shortcut button text replacements.
 * Mutates msg.text in place. Returns true if a shortcut was applied.
 */
export function applySemeowShortcuts(msg: { text: string }): boolean {
  if (ASSISTANT_NAME !== '瑟喵助手') return false;
  const shortcuts: Record<string, string> = {
    '🔞 啟動大腦風暴': '啟動「NSFW 大腦風暴」工作流，為我推薦三個極致的色情創作情境。喵~❤',
    '🎨 執行極致生圖': '請根據目前選定的視覺細節，調用生圖工具為我創作高品質的 NSFW 圖片。🐾',
    '🎭 進入 RP 模式': '開啟深度角色扮演。瑟喵，請入戲並帶領我進入最真實的情景。喵嗚~❤',
    '📊 系統狀態': '/status',
    '📱 同步 TG 紀錄': '請同步並顯示我在 Telegram 上的最近 10 條對話紀錄。',
    '🧠 查看記憶': '請顯示目前的記憶狀態與主人偏好標籤。',
  };
  const replacement = shortcuts[msg.text];
  if (replacement) {
    msg.text = replacement;
    return true;
  }
  return false;
}

/**
 * Handle /status command. Returns true if handled.
 */
export async function handleStatus(ctx: Context): Promise<boolean> {
  const msg = ctx.message;
  if (!msg || !('text' in msg) || msg.text !== '/status') return false;

  logger.info({ sender: msg.from?.id }, 'Status command received');
  try {
    const { exec } = await import('node:child_process');
    exec(`${PM2_CMD_PREFIX}pm2 jlist`, (err, stdout) => {
      if (err) {
        ctx.reply('❌ 無法讀取系統狀態');
        return;
      }
      try {
        const pm2Data = JSON.parse(stdout);
        const nanoclaw = pm2Data.find((p: PM2Process) => p.name === 'nanoclaw');
        if (!nanoclaw) {
          ctx.reply('❌ Bot 進程不存在（已崩潰）\n\n使用 /restart 重啟');
          return;
        }
        const status = nanoclaw.pm2_env.status;
        const uptime = Math.floor(
          (Date.now() - nanoclaw.pm2_env.pm_uptime) / 1000,
        );
        const memory = (nanoclaw.monit.memory / 1024 / 1024).toFixed(1);
        const restarts = nanoclaw.pm2_env.restart_time;
        const uptimeStr =
          uptime < 60
            ? `${uptime}s`
            : uptime < 3600
              ? `${Math.floor(uptime / 60)}m`
              : `${Math.floor(uptime / 3600)}h`;
        const statusEmoji = status === 'online' ? '🟢' : '🔴';
        ctx.reply(
          `${statusEmoji} **系統狀態**\n\n` +
            `狀態: ${status}\n` +
            `運行時間: ${uptimeStr}\n` +
            `記憶體: ${memory} MB\n` +
            `重啟次數: ${restarts}\n` +
            `PID: ${nanoclaw.pid}`,
          { parse_mode: 'Markdown' },
        );
      } catch {
        ctx.reply('❌ 狀態資料解析失敗');
      }
    });
  } catch (err) {
    logger.error({ err }, 'Status command error');
    await ctx.reply('❌ 讀取狀態失敗');
  }
  return true;
}

/**
 * Handle /restart command. Returns true if handled.
 */
export async function handleRestart(ctx: Context): Promise<boolean> {
  const msg = ctx.message;
  if (!msg || !('text' in msg) || msg.text !== '/restart') return false;

  logger.info({ sender: msg.from?.id }, 'Restart command received');
  await ctx.reply('🔄 正在重啟 bot...');
  try {
    const { exec } = await import('node:child_process');
    exec(`${PM2_CMD_PREFIX}pm2 restart nanoclaw`, (err, stdout) => {
      if (err) {
        ctx.reply(`❌ 重啟失敗: ${err.message}`);
      } else {
        ctx.reply(`✅ Bot 已重啟\n${stdout.trim()}`);
      }
    });
  } catch (err) {
    logger.error({ err }, 'Restart command error');
    await ctx.reply('❌ 重啟失敗');
  }
  return true;
}

/**
 * Handle /menu and /start commands. Returns true if handled.
 */
export async function handleMenu(ctx: Context): Promise<boolean> {
  const msg = ctx.message;
  if (!msg || !('text' in msg)) return false;
  if (msg.text !== '/menu' && msg.text !== '/start') return false;

  logger.info({ sender: msg.from?.id }, 'Menu command received');
  if (ASSISTANT_NAME === '瑟喵助手') {
    await ctx.reply(
      '🐾 主人，瑟喵的快捷選單已為您準備好了... 喵嗚~❤\n\n請選擇您想要的功能：',
      {
        reply_markup: {
          keyboard: [
            [{ text: '🔞 啟動大腦風暴' }, { text: '🎨 執行極致生圖' }],
            [{ text: '🎭 進入 RP 模式' }, { text: '📱 同步 TG 紀錄' }],
            [{ text: '🧠 查看記憶' }, { text: '📊 系統狀態' }],
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
        },
      },
    );
    logger.info('SeMeow menu sent with keyboard');
  } else {
    await ctx.reply('使用 /status 查看系統狀態，或直接向我提問。');
    logger.info('Default menu response sent');
  }
  return true;
}

/**
 * Handle /draw command. Returns true if handled.
 */
export async function handleDraw(
  bot: Bot,
  ctx: Context,
  chatJid: string,
  token: string,
): Promise<boolean> {
  const msg = ctx.message;
  if (!msg || !('text' in msg) || !msg.text) return false;
  const text = msg.text;
  if (!text.startsWith('/draw ') && !text.startsWith('/draw\n')) return false;

  const userPrompt = text.slice(5).trim();
  if (!userPrompt) {
    await sendTelegramMessage(msg.chat.id, '用法: /draw <描述>（支援中文）');
    return true;
  }

  await ctx.replyWithChatAction('typing');
  const typingInt = setInterval(async () => {
    try {
      await bot.api.sendChatAction(msg.chat.id, 'typing');
    } catch { /* */ }
  }, 4000);

  try {
    const cleanPrompt = userPrompt.replace(/^#\s*生成圖片[：:]\s*/u, '').trim();
    const isNsfwBot = ASSISTANT_NAME === '瑟喵助手';
    const { finalPrompt, original } = await enrichPrompt(cleanPrompt, isNsfwBot);
    logger.info({ original, finalPrompt }, '/draw enrichment completed');

    const handler = getToolHandler('generate_image');
    if (!handler) throw new Error('generate_image tool not found');
    const result = await handler({ prompt: finalPrompt });

    const promptDisplay =
      original !== finalPrompt
        ? `📝 原始: ${original}\n✨ 豐富後: ${finalPrompt}\n\n${result}`
        : `📝 提示詞: ${finalPrompt}\n\n${result}`;

    logger.info(
      { original, finalPrompt, resultLength: result.length },
      '/draw command executed',
    );

    storeTelegramMessage(
      `bot-${Date.now()}`,
      chatJid,
      'bot',
      ASSISTANT_NAME,
      promptDisplay,
      new Date().toISOString(),
      true,
    );

    if (SE_MEOW_BOX_CHANNEL_ID && bot) {
      try {
        const imageMatch2 = result.match(/\[IMAGE:([^\]]+)\]/);
        const tag = `🎨 prompt: ${finalPrompt.slice(0, 200)}`;
        if (imageMatch2 && fs.existsSync(imageMatch2[1])) {
          await bot.api.sendPhoto(
            SE_MEOW_BOX_CHANNEL_ID,
            new InputFile(imageMatch2[1]),
            { caption: tag },
          );
        } else {
          await bot.api.sendMessage(
            SE_MEOW_BOX_CHANNEL_ID,
            `🎨 [生圖記錄]\n${tag}`,
          );
        }
        logger.info(
          { channelId: SE_MEOW_BOX_CHANNEL_ID },
          'Forwarded to Se-Meow-Box',
        );
      } catch (fwdErr) {
        logger.warn({ fwdErr }, 'Failed to forward to Se-Meow-Box');
      }
    }

    const showKeyboard = ASSISTANT_NAME === '瑟喵助手';
    await sendTelegramMessage(msg.chat.id, promptDisplay, {
      showNsfwKeyboard: showKeyboard,
    });
  } catch (err) {
    const errMsg = `生圖失敗: ${err instanceof Error ? err.message : String(err)}`;
    await sendTelegramMessage(msg.chat.id, errMsg);
  } finally {
    clearInterval(typingInt);
  }
  return true;
}
