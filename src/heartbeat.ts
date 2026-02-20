/**
 * Heartbeat — NanoClaw 自我感知系統
 * 每 30 分鐘更新 HEARTBEAT.md，記錄系統當前狀態。
 * Bot 醒來後可讀取此文件快速了解最近的活動狀況。
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

import { OBSIDIAN_MEMORY_DIR, ASSISTANT_NAME, MAIN_GROUP_FOLDER } from './config.js';
import { logger } from './logger.js';

const HEARTBEAT_FILE = path.join(OBSIDIAN_MEMORY_DIR, 'HEARTBEAT.md');
const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let lastConvTime: string | null = null;
let totalConversations = 0;

/** Call this after each successful conversation to keep heartbeat stats fresh */
export function heartbeatRecordConversation(groupFolder: string): void {
  lastConvTime = new Date().toISOString();
  totalConversations++;
}

/** Write current system state to HEARTBEAT.md */
function writeHeartbeat(): void {
  try {
    const now = new Date();
    const ts = now.toISOString().slice(0, 16).replace('T', ' ');
    const today = now.toISOString().slice(0, 10);

    // PM2 process info (best effort)
    let pm2Status = '(PM2 不可用)';
    try {
      const pm2Out = execSync(
        'export PATH="/opt/homebrew/bin:$PATH" && pm2 jlist',
        { timeout: 3000 },
      ).toString();
      const procs: any[] = JSON.parse(pm2Out);
      const botProcs = procs.filter((p) =>
        p.name.startsWith('nanoclaw'),
      );
      pm2Status = botProcs
        .map((p) => {
          const uptimeSec = Math.floor(
            (Date.now() - p.pm2_env.pm_uptime) / 1000,
          );
          const uptimeStr =
            uptimeSec < 3600
              ? `${Math.floor(uptimeSec / 60)}m`
              : `${Math.floor(uptimeSec / 3600)}h`;
          const mem = (p.monit?.memory / 1024 / 1024).toFixed(0);
          return `  - ${p.name}: ${p.pm2_env.status} | uptime ${uptimeStr} | ${mem}MB | restarts ${p.pm2_env.restart_time}`;
        })
        .join('\n');
    } catch {
      // non-critical
    }

    // Conversation stats
    const lastConv = lastConvTime
      ? lastConvTime.slice(0, 16).replace('T', ' ')
      : '(尚無)';

    // Conversations directory — count today's entries
    const convDir = path.join(OBSIDIAN_MEMORY_DIR, 'Conversations');
    let todayCount = 0;
    try {
      const todayFile = path.join(convDir, `${today}.md`);
      if (fs.existsSync(todayFile)) {
        const content = fs.readFileSync(todayFile, 'utf-8');
        todayCount = (content.match(/^## \d{2}:\d{2}/gm) || []).length;
      }
    } catch {
      // non-critical
    }

    const content = `# HEARTBEAT.md — ${ASSISTANT_NAME} 系統心跳

> 更新時間: ${ts}

## 運行狀態

\`\`\`
Bot 名稱: ${ASSISTANT_NAME}
主群組: ${MAIN_GROUP_FOLDER}
\`\`\`

## PM2 進程

${pm2Status || '  (無 nanoclaw 進程)'}

## 對話統計

- 本次啟動後對話次數: ${totalConversations}
- 今日對話條目: ${todayCount}
- 最後對話時間: ${lastConv}

## 記憶狀態

- Obsidian 記憶目錄: ${OBSIDIAN_MEMORY_DIR}
- WAKE.md: ${fs.existsSync(path.join(OBSIDIAN_MEMORY_DIR, 'WAKE.md')) ? '✅ 存在' : '❌ 缺失'}
- Current_Context.md: ${fs.existsSync(path.join(OBSIDIAN_MEMORY_DIR, 'Current_Context.md')) ? '✅ 存在' : '❌ 缺失'}
- MEMORY.md: ${fs.existsSync(path.join(OBSIDIAN_MEMORY_DIR, 'MEMORY.md')) ? '✅ 存在' : '❌ 缺失（下次蒸餾後生成）'}

---
_下次更新: ${new Date(Date.now() + HEARTBEAT_INTERVAL_MS).toISOString().slice(0, 16).replace('T', ' ')}_
`;

    if (!fs.existsSync(OBSIDIAN_MEMORY_DIR)) return;
    fs.writeFileSync(HEARTBEAT_FILE, content, 'utf-8');
    logger.debug('HEARTBEAT.md updated');
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Failed to write heartbeat',
    );
  }
}

let heartbeatStarted = false;

/** Start the heartbeat loop. Call once from main(). */
export function startHeartbeat(): void {
  if (heartbeatStarted) return;
  heartbeatStarted = true;

  // Write immediately on startup
  writeHeartbeat();
  setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);
  logger.info({ intervalMin: 30 }, 'Heartbeat started');
}
