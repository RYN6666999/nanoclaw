/**
 * Telegram Channel for NanoClaw
 * Uses grammY for robust polling with built-in retry/backoff.
 */
import fs from 'fs';

import { Bot, GrammyError, HttpError, InputFile } from 'grammy';

import {
  ASSISTANT_NAME,
  MAIN_GROUP_FOLDER,
  OPENROUTER_API_KEY,
  SE_MEOW_BOX_CHANNEL_ID,
  AUTO_COMMIT_ENABLED,
  PM2_CMD_PREFIX,
} from './config.js';
import { getMessageById, getMessagesSince, storeTelegramMessage } from './db.js';
import { logger } from './logger.js';
import { getToolHandler } from './tools/index.js';
import { storePendingImage } from './tools/vision.js';
import { RegisteredGroup, HandoffSummary } from './types.js';

const TG_JID_PREFIX = 'tg:';

/**
 * 用 DeepSeek 翻譯 + 豐富提示詞（中文 → 英文 + 詳細描述）
 */
async function enrichPrompt(
  userPrompt: string,
  nsfw = false,
): Promise<{ finalPrompt: string; original: string }> {
  const systemPrompt = nsfw
    ? `You are an expert adult image generation prompt engineer for FLUX.1-schnell.
Given a user description (may be Chinese), you must:
1. Translate to English if needed
2. Enrich with explicit adult details: body features, clothing state, expression, pose, skin texture, lighting, camera angle
3. Add quality tags: masterpiece, best quality, highly detailed, 8k uhd, photorealistic
4. Keep it under 150 words

Return ONLY the final English prompt, no explanation.`
    : `你是圖片生成提示詞專家。
用戶給你一個圖片描述（可能是中文），你需要：
1. 翻譯成英文（如果已是英文則保持）
2. 豐富提示詞細節：加入風格、質感、光線、構圖、色彩等專業描述
3. 符合 FLUX.1-schnell 模型的最佳實踐

只回傳最終的英文提示詞，無需其他解釋。`;

  // 固定用 OpenRouter Grok（DeepSeek 餘額不足）
  const apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
  const apiKey = OPENROUTER_API_KEY;
  const model = 'x-ai/grok-3-mini';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status, model },
        'Enrichment failed, using original',
      );
      return { finalPrompt: userPrompt, original: userPrompt };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const enriched = data.choices?.[0]?.message?.content?.trim() || userPrompt;

    return { finalPrompt: enriched, original: userPrompt };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Enrichment error, using original',
    );
    return { finalPrompt: userPrompt, original: userPrompt };
  }
}

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
    imageData?: { imageBase64: string; imageMimeType: string },
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
  // Persistent handoff keyboard
  const handoffKeyboard = {
    keyboard: [[{ text: '📝 產生 handoff' }]],
    resize_keyboard: true,
    one_time_keyboard: false,
    is_persistent: true,
  };

  bot = new Bot(token);

  // 註冊 Telegram slash menu 指令
  await bot.api.setMyCommands([
    { command: 'handoff', description: '手動產生 session handoff 建議' },
    { command: 'status', description: '顯示系統狀態' },
    { command: 'restart', description: '重啟 bot 進程' },
    { command: 'menu', description: '顯示快捷選單' }
  ]);

  // Global error boundary — catches all unhandled errors
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

  // Handle channel posts
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

        const hostAgent = await import('./host-agent.js');
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

        // Send summary with inline buttons: Dry-run and Apply
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

        // Build contextual prompt
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

        // Get registered group for SeMeow
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

        // Keep typing indicator alive
        await ctx.replyWithChatAction('typing');
        const typingInterval = setInterval(async () => {
          try {
            await bot!.api.sendChatAction(msg.chat.id, 'typing');
          } catch {
            /* best effort */
          }
        }, 4000);

        try {
          const response = await config.runAgent(
            group,
            prompt,
            chatJid,
          );

          if (response) {
            // Send response as reply to user's message
            await bot!.api.sendMessage(msg.chat.id, response, {
              reply_to_message_id: msg.message_id,
            });

            // Store bot response
            storeTelegramMessage(
              `bot-${Date.now()}`,
              chatJid,
              'bot',
              ASSISTANT_NAME,
              response,
              new Date().toISOString(),
              true,
            );

            logger.info({ responseLength: response.length }, 'Channel reply sent');
          }
        } catch (err) {
          logger.error({ err }, 'Failed to process channel reply');
        } finally {
          clearInterval(typingInterval);
        }
      }
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
      msg.from.first_name || msg.from.username || String(msg.from.id);
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

    // Keep typing indicator alive
    await ctx.replyWithChatAction('typing');
    const typingInterval = setInterval(async () => {
      try {
        await bot!.api.sendChatAction(msg.chat.id, 'typing');
      } catch {
        /* best effort */
      }
    }, 4000);

    // Build prompt — caption or default vision instruction
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

  // Handle text messages
  bot.on('message:text', async (ctx) => {
    const msg = ctx.message;
    const botId = ctx.me.id;
    if (msg.from.id === botId) return;

    // 永遠顯示 handoff persistent keyboard
    try {
      // await ctx.reply(' ', { reply_markup: handoffKeyboard });
    } catch {}
    // handoff 按鈕觸發 handoff summary
    if (msg.text === '📝 產生 handoff') {
      await ctx.replyWithChatAction('typing');
      try {
        const chatJid = makeTelegramJid(msg.chat.id);
        const registeredGroups = config.getRegisteredGroups();
        const group = registeredGroups[chatJid];
        if (!group) {
          await ctx.reply('此聊天尚未註冊為群組，無法產生 handoff。', { reply_markup: handoffKeyboard });
          return;
        }
        const hostAgent = await import('./host-agent.js');
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
      } catch (err) {
        logger.error({ err }, 'Persistent handoff failed');
        await ctx.reply('產生 handoff 失敗，請查看日誌。', { reply_markup: handoffKeyboard });
      }
      return;
    }

    const chatJid = makeTelegramJid(msg.chat.id);
    const timestamp = new Date(msg.date * 1000).toISOString();
    const senderName =
      msg.from.first_name || msg.from.username || String(msg.from.id);
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

    // Handle NSFW workflow shortcut buttons (SeMeow bot)
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

    // /status command — show system health
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

    // /restart command — restart bot process via PM2
    if (msg.text === '/restart') {
      logger.info({ sender: msg.from.id }, 'Restart command received');
      await ctx.reply('🔄 正在重啟 bot...');

      try {
        const { exec } = await import('node:child_process');
        exec(
          `${PM2_CMD_PREFIX}pm2 restart nanoclaw`,
          (err, stdout) => {
            if (err) {
              logger.error({ err }, 'Failed to restart via PM2');
              ctx.reply('❌ 重啟失敗，請檢查伺服器');
            } else {
              logger.info('Bot restarted via PM2');
              // 新實例會自動連線，不需要回覆
            }
          },
        );
      } catch (err) {
        logger.error({ err }, 'Restart command error');
        await ctx.reply('❌ 重啟失敗');
      }
      return;
    }

    // /menu command — show quick reply keyboard (SeMeow bot)
    if (msg.text === '/menu' || msg.text === '/start') {
      logger.info(
        { assistantName: ASSISTANT_NAME, command: msg.text },
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

    // Check trigger: 'all' = respond to everything, otherwise match pattern
    if (group.trigger && group.trigger !== 'all') {
      const triggerMatch =
        msg.text.includes(group.trigger) || msg.text.startsWith('/'); // slash commands always pass
      if (!triggerMatch) return;
    }

    // Group chat smart silence: only respond when directly addressed
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

    // /status command — show system health report
    if (msg.text === '/status' || msg.text === '/system') {
      import('./observability.js').then(async (mod) => {
        const report = await mod.Observability.getHealthReport();
        await sendTelegramMessage(msg.chat.id, report);
      });
      return;
    }

    // /draw command — bypass model, call generate_image directly
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
          await bot!.api.sendChatAction(msg.chat.id, 'typing');
        } catch {
          /* */
        }
      }, 4000);

      try {
        // 清除 CLAUDE.md 可能帶來的前綴（如「# 生成圖片：」）
        const cleanPrompt = userPrompt
          .replace(/^#\s*生成圖片[：:]\s*/u, '')
          .trim();
        // 翻譯 + 豐富提示詞（SeMeow自動NSFW加持）
        const isNsfwBot = ASSISTANT_NAME === '瑟喵助手';
        const { finalPrompt, original } = await enrichPrompt(
          cleanPrompt,
          isNsfwBot,
        );
        logger.info({ original, finalPrompt }, '/draw enrichment completed');

        // 生成圖片
        const handler = getToolHandler('generate_image');
        if (!handler) throw new Error('generate_image tool not found');
        const result = await handler({ prompt: finalPrompt });

        // 顯示最終提示詞 + 圖片
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
        // @Se-Meow-Box：生圖後自動轉發到頻道（必須在發給用戶之前，否則檔案會被刪除）
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

    // Emoji cycling for "processing" indicator
    const processingEmojis = ['⏳', '🌱', '⚙️', '🔄', '✨'];
    let emojiIndex = 0;
    let emojiMessageId: number | null = null;

    // Send initial emoji message
    try {
      const emojiMsg = await bot!.api.sendMessage(msg.chat.id, `${processingEmojis[0]} 處理中...`);
      emojiMessageId = emojiMsg.message_id;
    } catch { /* ignore */ }

    // Cycle emojis every 3 seconds
    const emojiInterval = setInterval(async () => {
      if (!emojiMessageId) return;
      emojiIndex = (emojiIndex + 1) % processingEmojis.length;
      try {
        await bot!.api.editMessageText(
          msg.chat.id,
          emojiMessageId,
          `${processingEmojis[emojiIndex]} 處理中...`,
        );
      } catch { /* ignore */ }
    }, 3000);

    // Create streaming controller for this chat
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

    // Clean up emoji message if it exists
    if (emojiMessageId) {
      try {
        await bot!.api.deleteMessage(msg.chat.id, emojiMessageId);
      } catch { /* ignore */ }
    }

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
        const showKeyboard = ASSISTANT_NAME === '瑟喵助手';
        await sendTelegramMessage(msg.chat.id, response, {
          showNsfwKeyboard: showKeyboard,
        });
      }
    }
  });

  // Validate token
  const botInfo = await bot.api.getMe();
  logger.info(
    { botUsername: botInfo.username, botId: botInfo.id },
    'Connected to Telegram (grammY)',
  );

  // Handle callback queries for handoff buttons
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

      const hostAgent = await import('./host-agent.js');
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
        // Use auto-commit module directly to avoid shelling out
        const autoCommit = await import('./auto-commit.js');
        const handoffs = autoCommit.loadHandoffs();
        const actions = autoCommit.applyHandoffs(handoffs, { apply: true, autoCommitEnabled: true });
        const outLines = actions.map(a => `group:${a.group} committed:${a.committed} msg:${a.message}`);
        await ctx.reply('自動 commit 已執行：\n' + outLines.join('\n'));
        return;
      }
    } catch (e) {
      logger.error({ err: e }, 'Callback handler error');
      try { await ctx.answerCallbackQuery({ text: '處理失敗', show_alert: true }); } catch {}
    }
  });

  // Bot instance accessible via getTelegramBot()

  // Start long polling with aggressive 409 conflict resolution
  const startPolling = async (attempt = 1): Promise<void> => {
    try {
      await bot!.start({
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

        // Aggressively clear any existing webhook or polling session
        try {
          await bot!.api.deleteWebhook({ drop_pending_updates: true });
          logger.info('Webhook cleared successfully');
        } catch (webhookErr) {
          logger.warn(
            { err: webhookErr },
            'Failed to clear webhook (may not exist)',
          );
        }

        // Wait a bit for Telegram to release the lock
        const delay = Math.min(2000 * attempt, 10000);
        await new Promise((r) => setTimeout(r, delay));

        // Retry (max 3 attempts, then fail fast)
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
        .slice(1, -1) // remove outer pipes
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
  options?: { showNsfwKeyboard?: boolean },
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

  // Build reply markup for NSFW workflow shortcuts (SeMeow bot)
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
    // Fallback: if HTML parse fails, send as plain text
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
  if (!bot) throw new Error('Telegram bot not initialized');

  let messageId: number | null = null;
  let buffer = '';
  let lastEditTime = 0;
  let editTimer: ReturnType<typeof setTimeout> | null = null;
  const MIN_EDIT_INTERVAL = 1500; // Telegram rate limit ~1/sec, use 1.5s for safety
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
      logger.info(
        { chatId, length: buffer.length },
        'Telegram stream completed',
      );
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
