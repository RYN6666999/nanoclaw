/**
 * Heartbeat — NanoClaw 自我感知系統
 * 每 30 分鐘更新 HEARTBEAT.md，記錄系統當前狀態。
 * Bot 醒來後可讀取此文件快速了解最近的活動狀況。
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

import { OBSIDIAN_MEMORY_DIR, ASSISTANT_NAME, MAIN_GROUP_FOLDER, PM2_CMD_PREFIX, PM2_LOG_DIR } from './config.js';
import { logger } from './logger.js';
import { sendAlert } from './alert-service.js';

const HEARTBEAT_FILE = path.join(OBSIDIAN_MEMORY_DIR, 'HEARTBEAT.md');
const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MEMORY_THRESHOLD_MB = 400;

let lastConvTime: string | null = null;
let totalConversations = 0;
let lastPm2Status: Record<string, { status: string; restart_time: number; memory: number }> = {};

/** Call this after each successful conversation to keep heartbeat stats fresh */
export function heartbeatRecordConversation(groupFolder: string): void {
  lastConvTime = new Date().toISOString();
  totalConversations++;
}

/** Detect anomalies in PM2 processes and send alerts */
function detectAnomalies(pm2Procs: any[]): void {

  for (const proc of pm2Procs) {
    const procName = proc.name;
    const currentStatus = proc.pm2_env?.status || 'unknown';
    const currentRestarts = proc.pm2_env?.restart_time || 0;
    const currentMemoryMb = (proc.monit?.memory || 0) / 1024 / 1024;

    const lastState = lastPm2Status[procName];

    // Check 1: Status not online
    if (currentStatus !== 'online') {
      sendAlert(
        `⚠️ [Heartbeat] ${procName} 異常\n狀態: ${currentStatus}\n請檢查日誌: tail -f ${PM2_LOG_DIR}/${procName}-error.log`,
      );
    }

    // Check 2: New restarts detected
    if (
      lastState &&
      currentRestarts > lastState.restart_time
    ) {
      const newRestarts = currentRestarts - lastState.restart_time;
      sendAlert(
        `⚠️ [Heartbeat] ${procName} 發生崩潰\n重啟次數: ${lastState.restart_time} → ${currentRestarts} (新增 ${newRestarts} 次)\n請檢查日誌: tail -f ${PM2_LOG_DIR}/${procName}-error.log`,
      );
    }

    // Check 3: Memory > threshold
    if (currentMemoryMb > MEMORY_THRESHOLD_MB) {
      sendAlert(
        `⚠️ [Heartbeat] ${procName} 記憶體過高\n當前: ${currentMemoryMb.toFixed(0)}MB (閾值: ${MEMORY_THRESHOLD_MB}MB)\n請考慮重啟或檢查記憶體洩漏`,
      );
    }

    // Update last known state
    lastPm2Status[procName] = {
      status: currentStatus,
      restart_time: currentRestarts,
      memory: currentMemoryMb,
    };
  }
}

/** Write current system state to HEARTBEAT.md */
function writeHeartbeat(): void {
  try {
    const now = new Date();
    const ts = now.toISOString().slice(0, 16).replace('T', ' ');
    const today = now.toISOString().slice(0, 10);

    // PM2 process info (best effort)
    let pm2Status = '(PM2 不可用)';
    let botProcs: any[] = [];
    try {
      const pm2Out = execSync(
        `${PM2_CMD_PREFIX}pm2 jlist`,
        { timeout: 3000 },
      ).toString();
      const procs: any[] = JSON.parse(pm2Out);
      botProcs = procs.filter((p) =>
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

      // Detect anomalies
      detectAnomalies(botProcs);

      // Check daily goals (runs once per day at 09:00)
      checkGoals();
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

let lastGoalCheckDate: string | null = null;

/**
 * Check long-term goals from WAKE.md and send reminders.
 * Called once per day at 09:00 (or on first heartbeat if after 09:00).
 */
function checkGoals(): void {

  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const hour = now.getHours();

    // Only check once per day and after 09:00
    if (lastGoalCheckDate === today || hour < 9) return;
    lastGoalCheckDate = today;

    const wakePath = path.join(OBSIDIAN_MEMORY_DIR, 'WAKE.md');
    if (!fs.existsSync(wakePath)) return;

    const wakeContent = fs.readFileSync(wakePath, 'utf-8');
    // Extract ⑥ 長期目標 section
    const sectionMatch = wakeContent.match(/## ⑥[^\n]*目標[^\n]*\n([\s\S]*?)(?=\n## ⑦|---|\n$)/);
    if (!sectionMatch) return;

    const goalsSection = sectionMatch[1];
    const lines = goalsSection.split('\n').filter((l) => l.match(/^- \[[\sx]\]/));

    // Find uncompleted goals with deadline <= today + 3 days
    const upcomingGoals = lines
      .filter((l) => l.includes('[ ]') && l.includes('截止:'))
      .filter((l) => {
        const dateMatch = l.match(/截止:\s*(\d{4}-\d{2}-\d{2})/);
        if (!dateMatch) return false;
        const deadline = new Date(dateMatch[1]);
        const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        return deadline <= inThreeDays;
      });

    if (upcomingGoals.length > 0) {
      const goalList = upcomingGoals
        .map((l) => `  • ${l.slice(6).trim()}`)
        .join('\n');
      sendAlert(
        `📋 [Heartbeat] 即將到期的目標\n\n${goalList}\n\n請在 WAKE.md 更新進度`,
      );
    }
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) },
      'Failed to check goals');
  }
}
