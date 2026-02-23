/**
 * Telegram bot handlers — orchestrator.
 * Wires channel-handler, commands, callback-handler + photo/text message flow.
 */
import type { Bot } from 'grammy';

import {
  ASSISTANT_NAME,
  MAIN_GROUP_FOLDER,
} from '../config.js';
import { getMessagesSince, storeTelegramMessage } from '../db.js';
import { logger } from '../logger.js';
import type { TelegramConfig } from './types.js';
import { makeTelegramJid } from './utils.js';
import { sendTelegramMessage, createTelegramStream } from './stream.js';
import { registerChannelHandler } from './channel-handler.js';
import { registerCallbackHandler } from './callback-handler.js';
import {
  handleHandoffButton,
  applySemeowShortcuts,
  handleStatus,
  handleRestart,
  handleMenu,
  handleDraw,
} from './commands.js';

/**
 * Register all bot handlers on the given Bot instance.
 */
export function registerHandlers(bot: Bot, token: string, config: TelegramConfig): void {
  // ─── Channel Posts ───────────────────────────────────────────────
  registerChannelHandler(bot, token, config);

  // ─── Photo Messages ─────────────────────────────────────────────
  bot.on('message:photo', async (ctx) => {
    const msg = ctx.message;
    const botId = ctx.me.id;
    if (msg.from.id === botId) return;

    const chatJid = makeTelegramJid(msg.chat.id);
    const timestamp = new Date(msg.date * 1000).toISOString();
    const senderName =
      msg.from.first_name || msg.from.username || String(msg.from.id);
    const sender = String(msg.from.id);
    const caption = msg.caption || '';

    storeTelegramMessage(
      String(msg.message_id),
      chatJid,
      sender,
      senderName,
      caption || '[圖片]',
      timestamp,
      false,
    );

    const registeredGroups = config.getRegisteredGroups();
    const group = registeredGroups[chatJid];
    if (!group) return;

    const photo = msg.photo[msg.photo.length - 1];
    const file = await ctx.api.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

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

    const ext = file.file_path?.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const mimeType = mimeMap[ext] || 'image/jpeg';

    logger.info(
      { chat: msg.chat.id, fileSize: photo.file_size, mimeType },
      'Received Telegram photo, routing to Vision model',
    );

    await ctx.replyWithChatAction('typing');
    const typingInterval = setInterval(async () => {
      try {
        await bot.api.sendChatAction(msg.chat.id, 'typing');
      } catch {
        /* best effort */
      }
    }, 4000);

    const prompt = caption
      ? `<messages>\n<message sender="${senderName}" time="${timestamp}">${caption}</message>\n</messages>`
      : `<messages>\n<message sender="${senderName}" time="${timestamp}">描述這張圖片</message>\n</messages>`;

    const response = await config.runAgent(
      group,
      prompt,
      chatJid,
      undefined,
      { imageBase64, imageMimeType: mimeType },
    );
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

      const showKeyboard = ASSISTANT_NAME === '瑟喵助手';
      logger.info(
        { ASSISTANT_NAME, showKeyboard, chatJid },
        'Deciding to show Telegram keyboard',
      );
      await sendTelegramMessage(msg.chat.id, response, {
        showNsfwKeyboard: showKeyboard,
      });
    }
  });

  // ─── Text Messages ──────────────────────────────────────────────
  bot.on('message:text', async (ctx) => {
    const msg = ctx.message;
    const botId = ctx.me.id;
    if (msg.from.id === botId) return;

    const chatJid = makeTelegramJid(msg.chat.id);
    const chatName = msg.chat.type === 'private'
      ? msg.from.first_name || msg.from.username || String(msg.from.id)
      : msg.chat.title || `Chat ${msg.chat.id}`;
    const timestamp = new Date(msg.date * 1000).toISOString();
    const senderName =
      msg.from.first_name || msg.from.username || String(msg.from.id);
    const sender = String(msg.from.id);

    // --- Extracted command handlers ---
    if (await handleHandoffButton(ctx, chatJid, config)) return;
    applySemeowShortcuts(msg);
    if (await handleStatus(ctx)) return;
    if (await handleRestart(ctx)) return;
    if (await handleMenu(ctx)) return;

    // --- Store message & auto-register ---
    storeTelegramMessage(
      String(msg.message_id),
      chatJid,
      sender,
      senderName,
      msg.text,
      timestamp,
      false,
    );

    let group = config.getRegisteredGroups()[chatJid];
    if (!group) {
      if (
        msg.chat.type === 'private' ||
        Object.keys(config.getRegisteredGroups()).length === 0
      ) {
        config.registerGroup(chatJid, {
          name: chatName,
          folder: MAIN_GROUP_FOLDER,
          trigger: 'all',
          added_at: timestamp,
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

    // --- Trigger & silence checks ---
    if (group.trigger && group.trigger !== 'all') {
      const triggerMatch =
        msg.text.includes(group.trigger) || msg.text.startsWith('/');
      if (!triggerMatch) return;
    }

    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
      const botUsername = ctx.me.username ? `@${ctx.me.username}` : null;
      const isMentioned = botUsername
        ? msg.text.includes(botUsername)
        : false;
      const isNameMentioned = msg.text.includes(ASSISTANT_NAME);
      const isReplyToBot =
        msg.reply_to_message?.from?.id === ctx.me.id;
      const isSlashCommand = msg.text.startsWith('/');

      if (!isMentioned && !isNameMentioned && !isReplyToBot && !isSlashCommand) {
        return;
      }
    }

    // --- /draw command ---
    if (await handleDraw(bot, ctx, chatJid, token)) return;

    // --- Build context & process message ---
    const sinceTimestamp = config.lastAgentTimestamp[chatJid] || '';
    const missedMessages = getMessagesSince(chatJid, sinceTimestamp);

    const contextLines = missedMessages.map((m) => {
      const escapeXml = (s: string) =>
        s
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      return `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}">${escapeXml(m.content)}</message>`;
    });
    const prompt = `<messages>\n${contextLines.join('\n')}\n</messages>`;

    if (!prompt) return;

    logger.info(
      { chat: msg.chat.id, messageCount: missedMessages.length },
      'Processing Telegram message',
    );

    // Emoji cycling for "processing" indicator
    const processingEmojis = ['⏳', '🌱', '⚙️', '🔄', '✨'];
    let emojiIndex = 0;
    let emojiMessageId: number | null = null;

    try {
      const emojiMsg = await bot.api.sendMessage(msg.chat.id, `${processingEmojis[0]} 處理中...`);
      emojiMessageId = emojiMsg.message_id;
    } catch { /* ignore */ }

    const emojiInterval = setInterval(async () => {
      if (!emojiMessageId) return;
      emojiIndex = (emojiIndex + 1) % processingEmojis.length;
      try {
        await bot.api.editMessageText(
          msg.chat.id,
          emojiMessageId,
          `${processingEmojis[emojiIndex]} 處理中...`,
        );
      } catch { /* ignore */ }
    }, 3000);

    const showKeyboard = ASSISTANT_NAME === '瑟喵助手';
    const stream = createTelegramStream(msg.chat.id, { showNsfwKeyboard: showKeyboard });
    const streamCallbacks = {
      onStreamChunk: (chunk: string) => stream.push(chunk),
      onStreamDone: () => stream.finalize(),
    };

    const response = await config.runAgent(
      group,
      prompt,
      chatJid,
      streamCallbacks,
    );
    clearInterval(emojiInterval);

    if (emojiMessageId) {
      try {
        await bot.api.deleteMessage(msg.chat.id, emojiMessageId);
      } catch { /* ignore */ }
    }

    if (response) {
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

      if (!stream.getMessageId()) {
        const showKeyboard2 = ASSISTANT_NAME === '瑟喵助手';
        await sendTelegramMessage(msg.chat.id, response, {
          showNsfwKeyboard: showKeyboard2,
        });
      }
    }
  });

  // ─── Callback Queries (handoff buttons) ─────────────────────────
  registerCallbackHandler(bot, config);
}
