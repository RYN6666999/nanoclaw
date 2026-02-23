/**
 * Telegram channel_post handler — SeMeow-Box channel integration.
 */
import type { Bot } from 'grammy';

import {
  ASSISTANT_NAME,
  SE_MEOW_BOX_CHANNEL_ID,
} from '../config.js';
import { getMessageById, storeTelegramMessage } from '../db.js';
import { logger } from '../logger.js';
import type { TelegramConfig } from './types.js';
import { makeTelegramJid } from './utils.js';
import { sendTelegramMessage, createTelegramStream } from './stream.js';

/**
 * Register the channel_post handler on the bot.
 */
export function registerChannelHandler(bot: Bot, _token: string, config: TelegramConfig): void {
  bot.on('channel_post', async (ctx) => {
    logger.info({ channelPost: ctx.channelPost }, 'Received channel_post event');
    const msg = ctx.channelPost;
    if (msg.chat.id !== SE_MEOW_BOX_CHANNEL_ID) {
      return;
    }

    const chatJid = makeTelegramJid(msg.chat.id);

    // /handoff command — manually trigger session handoff summary
    if (msg.text === '/handoff' || (msg.text && msg.text.startsWith('/handoff '))) {
      await ctx.replyWithChatAction('typing');
      try {
        const registeredGroups = config.getRegisteredGroups();
        const group = registeredGroups[chatJid];
        if (!group) {
          await ctx.reply('此聊天尚未註冊為群組，無法產生 handoff。');
          return;
        }

        const hostAgent = await import('../host-agent.js');
        const summary = await hostAgent.triggerHandoffForGroup(group.folder);
        const { formatHandoffLines } = await import('../handoff-service.js');
        const text = formatHandoffLines(group.name, summary).join('\n');

        const keyboard = {
          inline_keyboard: [
            [
              { text: 'Dry-run', callback_data: `handoff:dry:${chatJid}` },
              { text: 'Apply', callback_data: `handoff:apply:${chatJid}` },
            ],
          ],
        };

        await ctx.reply(text, { reply_markup: keyboard });
      } catch (err) {
        logger.error({ err }, 'Manual handoff failed');
        await ctx.reply('產生 handoff 失敗，請查看日誌。');
      }
      return;
    }

    const timestamp = new Date(msg.date * 1000).toISOString();
    const senderName = msg.author_signature || 'Channel';
    const sender = String(msg.chat.id);
    const content = msg.text || msg.caption || '[Unsupported Message Type]';

    storeTelegramMessage(
      String(msg.message_id),
      chatJid,
      sender,
      senderName,
      content,
      timestamp,
      false,
    );

    logger.info(
      { channelId: msg.chat.id, messageId: msg.message_id },
      'Stored channel post from SeMeow-Box',
    );

    // Check if this is a reply to another message
    const replyToMsg = msg.reply_to_message;
    if (replyToMsg && content && content.trim()) {
      const replyToMsgId = String(replyToMsg.message_id);
      const originalMsg = getMessageById(replyToMsgId, chatJid);

      if (originalMsg) {
        logger.info(
          { replyToMsgId, originalContent: originalMsg.content.slice(0, 50) },
          'Detected reply to channel message, processing with context',
        );

        const escapeXml = (s: string) =>
          s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        const prompt = `<messages>
<message sender="${escapeXml(originalMsg.sender_name)}" time="${originalMsg.timestamp}">${escapeXml(originalMsg.content)}</message>
<message sender="${escapeXml(senderName)}" time="${timestamp}">${escapeXml(content)}</message>
</messages>`;

        const registeredGroups = config.getRegisteredGroups();
        const seMeowJid = Object.entries(registeredGroups).find(
          ([, g]) => g.folder === 'SeMeow',
        )?.[0];

        if (!seMeowJid) {
          logger.warn('SeMeow group not registered');
          return;
        }

        const group = registeredGroups[seMeowJid];
        if (!group) {
          logger.warn('SeMeow group not found');
          return;
        }

        await ctx.replyWithChatAction('typing');
        const typingInterval = setInterval(async () => {
          try {
            await bot.api.sendChatAction(msg.chat.id, 'typing');
          } catch {
            /* best effort */
          }
        }, 4000);

        const stream = createTelegramStream(msg.chat.id);
        const streamCallbacks = {
          onStreamChunk: (chunk: string) => stream.push(chunk),
          onStreamDone: () => stream.finalize(),
        };

        const response = await config.runAgent(
          group,
          prompt,
          seMeowJid,
          streamCallbacks,
        );
        clearInterval(typingInterval);

        if (response) {
          await stream.finalize();
          config.lastAgentTimestamp[seMeowJid] = timestamp;
          config.saveState();
          storeTelegramMessage(
            `bot-${Date.now()}`,
            seMeowJid,
            'bot',
            ASSISTANT_NAME,
            response,
            new Date().toISOString(),
            true,
          );
          if (!stream.getMessageId()) {
            await sendTelegramMessage(msg.chat.id, response);
          }
        }
      }
    }
  });
}
