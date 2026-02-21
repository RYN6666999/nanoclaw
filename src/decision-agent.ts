/**
 * Decision Agent — Autonomous goal tracking and proactive system management
 * Runs every 15 minutes to evaluate system state and decide on autonomous actions
 */
import fs from 'fs';
import path from 'path';
import { OBSIDIAN_MEMORY_DIR, OPENROUTER_API_KEY, OPENROUTER_API_BASE_URL } from './config.js';
import { logger } from './logger.js';

const DECISION_FILE = path.join(OBSIDIAN_MEMORY_DIR, 'DECISIONS.md');
const DECISION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_DECISION_LINES = 100;

// Action cooldowns (in milliseconds)
const COOLDOWNS: Record<string, number> = {
  GOAL_REMINDER: 4 * 60 * 60 * 1000,      // 4 hours
  HEALTH_ALERT: 30 * 60 * 1000,            // 30 minutes
  DAILY_BRIEFING: 20 * 60 * 60 * 1000,    // 20 hours
  STALE_ALERT: 48 * 60 * 60 * 1000,       // 48 hours
  GOAL_CHECKIN: 6 * 24 * 60 * 60 * 1000,  // 6 days
};

// Track last action time for cooldown management
const lastActionTime: Record<string, number> = {};

// Store reference to sendAlert callback
let sendAlertCallback: ((text: string) => Promise<void>) | null = null;

/**
 * Parse HEARTBEAT.md to extract system status summary
 */
function getSystemStatusSummary(): string {
  try {
    const heartbeatPath = path.join(OBSIDIAN_MEMORY_DIR, 'HEARTBEAT.md');
    if (!fs.existsSync(heartbeatPath)) return '(No system status available)';
    const content = fs.readFileSync(heartbeatPath, 'utf-8');
    const lines = content.split('\n').slice(0, 30).join('\n');
    return lines.slice(0, 500); // Truncate to 500 chars
  } catch {
    return '(Failed to read system status)';
  }
}

/**
 * Parse WAKE.md to extract long-term goals (## ⑥ section)
 */
function getGoalsText(): string {
  try {
    const wakePath = path.join(OBSIDIAN_MEMORY_DIR, 'WAKE.md');
    if (!fs.existsSync(wakePath)) return '(No goals defined)';
    const content = fs.readFileSync(wakePath, 'utf-8');
    const match = content.match(/## ⑥[^\n]*目標[^\n]*\n([\s\S]*?)(?=\n## ⑦|---|\n$)/);
    return match ? match[1].trim().slice(0, 500) : '(No goals section found)';
  } catch {
    return '(Failed to read goals)';
  }
}

/**
 * Get hours since last user interaction
 */
function getHoursSinceLastConversation(): number {
  try {
    const contextPath = path.join(OBSIDIAN_MEMORY_DIR, 'Current_Context.md');
    if (!fs.existsSync(contextPath)) return 999; // Default to very old
    const content = fs.readFileSync(contextPath, 'utf-8');
    const lastMatch = content.match(/@LAST: (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
    if (!lastMatch) return 999;
    const lastTime = new Date(lastMatch[1].replace(' ', 'T'));
    const hours = (Date.now() - lastTime.getTime()) / (1000 * 60 * 60);
    return Math.round(hours * 10) / 10;
  } catch {
    return 999;
  }
}

/**
 * Get list of actions currently on cooldown
 */
function getActiveCooldowns(): string[] {
  const active: string[] = [];
  const now = Date.now();
  for (const [action, duration] of Object.entries(COOLDOWNS)) {
    if (lastActionTime[action] && now - lastActionTime[action] < duration) {
      active.push(action);
    }
  }
  return active;
}

/**
 * Check if action is allowed (not on cooldown and in whitelist)
 */
function isActionAllowed(actionType: string): boolean {
  // Whitelist
  const WHITELIST = ['GOAL_REMINDER', 'HEALTH_ALERT', 'DAILY_BRIEFING', 'STALE_ALERT', 'GOAL_CHECKIN'];
  if (!WHITELIST.includes(actionType)) return false;

  // Cooldown check
  const now = Date.now();
  const lastTime = lastActionTime[actionType];
  if (lastTime && now - lastTime < COOLDOWNS[actionType]) {
    return false;
  }
  return true;
}

/**
 * Append decision record to DECISIONS.md
 */
function recordDecision(decision: string, result: string): void {
  try {
    if (!fs.existsSync(OBSIDIAN_MEMORY_DIR)) return;

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace('T', ' ');
    const line = `${timestamp} | ${decision} | ${result}\n`;

    if (!fs.existsSync(DECISION_FILE)) {
      fs.writeFileSync(DECISION_FILE, '# 決策日誌 (Decision Log)\n\n', 'utf-8');
    }

    // Append new line
    fs.appendFileSync(DECISION_FILE, line, 'utf-8');

    // Keep only last MAX_DECISION_LINES entries
    const content = fs.readFileSync(DECISION_FILE, 'utf-8');
    const lines = content.split('\n');
    if (lines.length > MAX_DECISION_LINES + 2) {
      const header = lines.slice(0, 2).join('\n') + '\n';
      const entries = lines.slice(-(MAX_DECISION_LINES + 1)).join('\n');
      fs.writeFileSync(DECISION_FILE, header + entries, 'utf-8');
    }
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Failed to record decision');
  }
}

/**
 * Call GLM-flash to decide what action to take
 */
async function makeDecision(): Promise<{ action: string; type?: string; reason: string }> {
  if (!OPENROUTER_API_KEY) {
    return { action: 'WAIT', reason: 'No API key configured' };
  }

  try {
    const systemPrompt = `你是 NanoClaw 決策核心。根據當前系統狀態，決定是否需要主動行動。

規則：
1. 優先選 WAIT——不確定就不動
2. 只能從以下行動清單選擇：
   GOAL_REMINDER, HEALTH_ALERT, DAILY_BRIEFING, STALE_ALERT, GOAL_CHECKIN
3. 輸出格式：
   WAIT: {一行理由}
   或
   ACT:{行動類型}:{簡短說明（20字內）}

不要解釋，直接輸出。`;

    const now = new Date().toISOString();
    const hoursSince = getHoursSinceLastConversation();
    const cooldowns = getActiveCooldowns();

    const userPrompt = `當前時間: ${now}
距上次用戶對話: ${hoursSince} 小時
系統狀態: ${getSystemStatusSummary()}
待追蹤目標: ${getGoalsText()}
冷卻中的行動: ${cooldowns.length > 0 ? cooldowns.join(', ') : '(無)'}

現在應該做什麼？`;

    const response = await fetch(`${OPENROUTER_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'X-Title': 'NanoClaw-DecisionAgent',
      },
      body: JSON.stringify({
        model: 'z-ai/glm-4.7-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 100,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { action: 'WAIT', reason: `API error: ${response.status}` };
    }

    const data = (await response.json()) as any;
    const answer = data.choices?.[0]?.message?.content?.trim() || '';

    // Parse response
    if (answer.startsWith('WAIT:')) {
      return { action: 'WAIT', reason: answer.slice(5).trim() };
    } else if (answer.startsWith('ACT:')) {
      const parts = answer.slice(4).split(':');
      return {
        action: 'ACT',
        type: parts[0].trim(),
        reason: parts.slice(1).join(':').trim(),
      };
    } else {
      return { action: 'WAIT', reason: `Unparseable response: ${answer.slice(0, 50)}` };
    }
  } catch (err) {
    return { action: 'WAIT', reason: `Error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Execute allowed actions
 */
async function executeAction(type: string, reason: string): Promise<boolean> {
  if (!isActionAllowed(type)) {
    recordDecision(`WAIT`, `cooldown active (${type})`);
    return false;
  }

  try {
    // Map action types to messages
    const messages: Record<string, string> = {
      GOAL_REMINDER: `📋 [Decision Agent] 即將到期的目標\n\n${reason}\n\n請在 WAKE.md 更新進度`,
      HEALTH_ALERT: `⚠️ [Decision Agent] 系統告警\n\n${reason}`,
      DAILY_BRIEFING: `📊 [Decision Agent] 今日摘要\n\n${reason}`,
      STALE_ALERT: `👋 [Decision Agent] 主人，你還在嗎？\n\n距上次對話已超過 24 小時。`,
      GOAL_CHECKIN: `🎯 [Decision Agent] 週回顧\n\n${reason}`,
    };

    const message = messages[type] || `[Decision Agent] ${type}: ${reason}`;

    if (sendAlertCallback) {
      await sendAlertCallback(message);
      lastActionTime[type] = Date.now();
      recordDecision(`ACT:${type}`, 'sent');
      return true;
    }
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, `Failed to execute action ${type}`);
  }

  return false;
}

/**
 * Main decision loop
 */
async function decisionLoop(): Promise<void> {
  try {
    const decision = await makeDecision();

    if (decision.action === 'WAIT') {
      recordDecision('WAIT', decision.reason);
    } else if (decision.action === 'ACT' && decision.type) {
      await executeAction(decision.type, decision.reason);
    }
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Decision loop error');
  }
}

let decisionAgentStarted = false;

/**
 * Start the decision agent loop
 */
export function startDecisionAgent(sendAlert?: (text: string) => Promise<void>): void {
  if (decisionAgentStarted) return;
  decisionAgentStarted = true;

  if (sendAlert) {
    sendAlertCallback = sendAlert;
  }

  // Run decision loop immediately on startup
  decisionLoop();

  // Then run every 15 minutes
  setInterval(() => decisionLoop(), DECISION_INTERVAL_MS);
  logger.info({ intervalMin: 15 }, 'Decision agent started');
}
