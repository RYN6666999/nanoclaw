/**
 * Telegram bot handlers — channel_post, message:photo, message:text, callback_query.
 */
import fs from 'fs';

import type { Bot } from 'grammy';
import { GrammyError, InputFile } from 'grammy';

import {
  ASSISTANT_NAME,
  MAIN_GROUP_FOLDER,
  SE_MEOW_BOX_CHANNEL_ID,
  AUTO_COMMIT_ENABLED,
  PM2_CMD_PREFIX,
} from '../config.js';
import { getMessageById, getMessagesSince, storeTelegramMessage } from '../db.js';
import { logger } from '../logger.js';
import { getToolHandler } from '../tools/index.js';
import type { TelegramConfig } from './types.js';
import { makeTelegramJid, enrichPrompt } from './utils.js';
import { sendTelegramMessage, createTelegramStream } from './stream.js';

/**
 * Register all bot handlers on the given Bot instance.
 */
export function registerHandlers(bot: Bot, token: string, config: TelegramConfig): void {
  // Persistent handoff keyboard
  const handoffKeyboard = {
    keyboard: [[{ text: '📝 產生 handoff' }]],
    resize_keyboard: true,
    one_time_keyboard: false,
    is_persistent: true,
  };

  // ─── Channel Posts ───────────────────────────────────────────────
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

        const lines: string[] = [];
        lines.push(`**Handoff 建議 - ${group.name}**`);
        lines.push(`優先度：${summary.priority}`);
        if (summary.summary) {
          lines.push(`\n**承先啟後脈絡提示詞：**\n${summary.summary}`);
        }
        if (summary.obsidianLog) {
          lines.push(`\n**已同步至 Obsidian：**\n${summary.obsidianLog}`);
        }
        if (summary.changedFilesList && summary.changedFilesList.length) {
          lines.push('\n**變更檔案：**');
          lines.push(summary.changedFilesList.slice(0, 20).join('\n'));
        }
        if (summary.commitSuggestion && summary.commitSuggestion.shouldCommit) {
          lines.push(`\n**建議 commit:** ${summary.commitSuggestion.message}`);
        } else {
          lines.push('\n無自動 commit 建議');
        }

        const keyboard = {
          inline_keyboard: [
            [
              { text: 'Dry-run', callback_data: `handoff:dry:${chatJid}` },
              { text: 'Apply', callback_data: `handoff:apply:${chatJid}` },
            ],
          ],
        };

        await ctx.reply(lines.join('\n'), { reply_markup: keyboard });
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

    // --- Handoff keyboard trigger ---
    if (msg.text === '📝 產生 handoff') {
      const registeredGroups = config.getRegisteredGroups();
      const group = registeredGroups[chatJid];
      if (!group) {
        await ctx.reply('此聊天尚未註冊為群組，無法產生 handoff。', { reply_markup: handoffKeyboard });
        return;
      }
      const hostAgent = await import('../host-agent.js');
      const summary = await hostAgent.triggerHandoffForGroup(group.folder);
      const lines: string[] = [];
      lines.push(`**Handoff 建議 - ${group.name}**`);
      lines.push(`優先度：${summary.priority}`);
      if (summary.summary) {
        lines.push(`\n**承先啟後脈絡提示詞：**\n${summary.summary}`);
      }
      if (summary.obsidianLog) {
        lines.push(`\n**已同步至 Obsidian：**\n${summary.obsidianLog}`);
      }
      if (summary.changedFilesList && summary.changedFilesList.length) {
        lines.push('\n**變更檔案：**');
        lines.push(summary.changedFilesList.slice(0, 20).join('\n'));
      }
      if (summary.commitSuggestion && summary.commitSuggestion.shouldCommit) {
        lines.push(`\n**建議 commit:** ${summary.commitSuggestion.message}`);
      } else {
        lines.push('\n無自動 commit 建議');
      }
      await ctx.reply(lines.join('\n'), { reply_markup: handoffKeyboard });
      return;
    }

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

    // --- SeMeow shortcut buttons ---
    if (ASSISTANT_NAME === '瑟喵助手') {
      if (msg.text === '🔞 啟動大腦風暴') {
        msg.text =
          '啟動「NSFW 大腦風暴」工作流，為我推薦三個極致的色情創作情境。喵~❤';
      } else if (msg.text === '🎨 執行極致生圖') {
        msg.text =
          '請根據目前選定的視覺細節，調用生圖工具為我創作高品質的 NSFW 圖片。🐾';
      } else if (msg.text === '🎭 進入 RP 模式') {
        msg.text =
          '開啟深度角色扮演。瑟喵，請入戲並帶領我進入最真實的情景。喵嗚~❤';
      } else if (msg.text === '📊 系統狀態') {
        msg.text = '/status';
      } else if (msg.text === '📱 同步 TG 紀錄') {
        msg.text = '請同步並顯示我在 Telegram 上的最近 10 條對話紀錄。';
      } else if (msg.text === '🧠 查看記憶') {
        msg.text = '請顯示目前的記憶狀態與主人偏好標籤。';
      }
    }

    // --- /status command ---
    if (msg.text === '/status') {
      logger.info({ sender: msg.from.id }, 'Status command received');
      try {
        const { exec } = await import('node:child_process');
        exec(
          `${PM2_CMD_PREFIX}pm2 jlist`,
          (err, stdout) => {
            if (err) {
              ctx.reply('❌ 無法讀取系統狀態');
              return;
            }
            try {
              const pm2Data = JSON.parse(stdout);
              const nanoclaw = pm2Data.find((p: any) => p.name === 'nanoclaw');
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
            } catch (parseErr) {
              ctx.reply('❌ 狀態資料解析失敗');
            }
          },
        );
      } catch (err) {
        logger.error({ err }, 'Status command error');
        await ctx.reply('❌ 讀取狀態失敗');
      }
      return;
    }

    // --- /restart command ---
    if (msg.text === '/restart') {
      logger.info({ sender: msg.from.id }, 'Restart command received');
      await ctx.reply('🔄 正在重啟 bot...');
      try {
        const { exec } = await import('node:child_process');
        exec(
          `${PM2_CMD_PREFIX}pm2 restart nanoclaw`,
          (err, stdout) => {
            if (err) {
              ctx.reply(`❌ 重啟失敗: ${err.message}`);
            } else {
              ctx.reply(`✅ Bot 已重啟\n${stdout.trim()}`);
            }
          },
        );
      } catch (err) {
        logger.error({ err }, 'Restart command error');
        await ctx.reply('❌ 重啟失敗');
      }
      return;
    }

    // --- /menu, /start commands ---
    if (msg.text === '/menu' || msg.text === '/start') {
      logger.info(
        { sender: msg.from.id },
        'Menu command received',
      );
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
        return;
      } else {
        await ctx.reply('使用 /status 查看系統狀態，或直接向我提問。');
        logger.info('Default menu response sent');
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
    if (msg.text.startsWith('/draw ') || msg.text.startsWith('/draw\n')) {
      const userPrompt = msg.text.slice(5).trim();
      if (!userPrompt) {
        await sendTelegramMessage(
          msg.chat.id,
          '用法: /draw <描述>（支援中文）',
        );
        return;
      }
      await ctx.replyWithChatAction('typing');
      const typingInt = setInterval(async () => {
        try {
          await bot.api.sendChatAction(msg.chat.id, 'typing');
        } catch {
          /* */
        }
      }, 4000);

      try {
        const cleanPrompt = userPrompt
          .replace(/^#\s*生成圖片[：:]\s*/u, '')
          .trim();
        const isNsfwBot = ASSISTANT_NAME === '瑟喵助手';
        const { finalPrompt, original } = await enrichPrompt(
          cleanPrompt,
          isNsfwBot,
        );
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
      return;
    }

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
  bot.on('callback_query:data', async (ctx) => {
    try {
      const data = ctx.callbackQuery.data || '';
      if (!data.startsWith('handoff:')) return ctx.answerCallbackQuery({ text: 'Unknown action', show_alert: false });
      const parts = data.split(':');
      const action = parts[1];
      const chatJid = parts.slice(2).join(':');
      await ctx.answerCallbackQuery({ text: '處理中...', show_alert: false });

      const registeredGroups = config.getRegisteredGroups();
      const group = registeredGroups[chatJid];
      if (!group) {
        await ctx.reply('找不到對應群組，請先註冊該聊天');
        return;
      }

      const hostAgent = await import('../host-agent.js');
      const summary = await hostAgent.triggerHandoffForGroup(group.folder);

      if (action === 'dry') {
        const lines: string[] = [];
        lines.push(`**Handoff (dry-run) - ${group.name}**`);
        lines.push(`優先度：${summary.priority}`);
        if (summary.changedFilesList && summary.changedFilesList.length) {
          lines.push('變更檔案：');
          lines.push(summary.changedFilesList.slice(0, 50).join('\n'));
        }
        if (summary.commitSuggestion && summary.commitSuggestion.shouldCommit) {
          lines.push(`建議 commit: ${summary.commitSuggestion.message}`);
        } else {
          lines.push('無自動 commit 建議');
        }
        await ctx.reply(lines.join('\n'));
        return;
      }

      if (action === 'apply') {
        if (!AUTO_COMMIT_ENABLED) {
          await ctx.reply('AUTO_COMMIT_ENABLED 未啟用，無法執行自動 commit。請在 .env 設定後重試。');
          return;
        }
        const autoCommit = await import('../auto-commit.js');
        const handoffs = autoCommit.loadHandoffs();
        const actions = autoCommit.applyHandoffs(handoffs, { apply: true, autoCommitEnabled: true });
        const outLines = actions.map((a: any) => `group:${a.group} committed:${a.committed} msg:${a.message}`);
        await ctx.reply('自動 commit 已執行：\n' + outLines.join('\n'));
        return;
      }
    } catch (e) {
      logger.error({ err: e }, 'Callback handler error');
      try { await ctx.answerCallbackQuery({ text: '處理失敗', show_alert: true }); } catch {}
    }
  });
}
