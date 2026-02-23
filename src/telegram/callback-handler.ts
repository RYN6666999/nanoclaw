/**
 * Telegram callback_query handler — handoff dry-run / apply buttons.
 */
import type { Bot } from 'grammy';

import { AUTO_COMMIT_ENABLED } from '../config.js';
import { logger } from '../logger.js';
import type { TelegramConfig } from './types.js';

/**
 * Register the callback_query handler on the bot.
 */
export function registerCallbackHandler(bot: Bot, config: TelegramConfig): void {
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
      try { await ctx.answerCallbackQuery({ text: '處理失敗', show_alert: true }); } catch { /* */ }
    }
  });
}
