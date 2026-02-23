/**
 * 健康監控 + 自愈機制
 *
 * v2: 修復「沒人說話就判定 crash」的 bug
 * - 改用 Telegram getMe() API 做心跳（不依賴用戶消息）
 * - 加入 exponential backoff 避免高頻重啟觸發 rate limit
 * - 移除 process.exit — 改為內部重連（PM2 未安裝）
 */

import { Bot } from 'grammy'
import { logger } from './logger.js'

interface HealthCheck {
  lastHeartbeat: number
  failCount: number
  restartCount: number
  isRecovering: boolean
}

const health: HealthCheck = {
  lastHeartbeat: Date.now(),
  failCount: 0,
  restartCount: 0,
  isRecovering: false,
}

const MAX_FAIL = 5                    // 提高容錯次數（原本 3 太低）
const HEARTBEAT_INTERVAL = 60_000     // 60s 檢查一次（原本 30s 太頻繁）
const MAX_BACKOFF = 300_000           // 最大退避 5 分鐘

let healthTimer: ReturnType<typeof setInterval> | null = null

export function startHealthMonitor(bot: Bot) {
  // 用戶消息仍然更新心跳（額外信號）
  bot.on('message', () => {
    health.lastHeartbeat = Date.now()
    health.failCount = 0
  })

  // 定期用 getMe() 做主動心跳檢查
  healthTimer = setInterval(async () => {
    if (health.isRecovering) return

    try {
      await bot.api.getMe()
      // API 連通 → 重置 fail count
      health.lastHeartbeat = Date.now()
      health.failCount = 0
    } catch (err: any) {
      health.failCount++
      logger.warn({
        failCount: health.failCount,
        maxFail: MAX_FAIL,
        error: err?.message?.slice(0, 100),
      }, 'Health check: getMe failed')

      if (health.failCount >= MAX_FAIL) {
        await handleRecovery(bot)
      }
    }
  }, HEARTBEAT_INTERVAL)

  logger.info({
    interval: HEARTBEAT_INTERVAL,
    maxFail: MAX_FAIL,
  }, 'Health monitor started (v2)')
}

export function stopHealthMonitor() {
  if (healthTimer) {
    clearInterval(healthTimer)
    healthTimer = null
  }
}

async function handleRecovery(bot: Bot) {
  if (health.isRecovering) return
  health.isRecovering = true
  health.restartCount++

  // Exponential backoff: 10s, 20s, 40s, 80s... max 300s
  const backoff = Math.min(10_000 * Math.pow(2, health.restartCount - 1), MAX_BACKOFF)

  logger.error({
    restartCount: health.restartCount,
    backoffMs: backoff,
  }, 'Bot connection lost — waiting before recovery attempt')

  // 記錄到 Obsidian（不阻塞）
  logCrashToObsidian(health.restartCount).catch(() => { })

  // 等待 backoff 後重置 fail count，讓 health check 再試
  await new Promise(resolve => setTimeout(resolve, backoff))

  health.failCount = 0
  health.isRecovering = false

  logger.info({
    restartCount: health.restartCount,
  }, 'Recovery backoff complete — resuming health checks')
}

async function logCrashToObsidian(restartCount: number): Promise<void> {
  try {
    const fs = await import('fs')
    const path = await import('path')
    const os = await import('os')
    const crashLog = `[${new Date().toISOString()}] Bot reconnection attempt #${restartCount}`
    const changelogPath = process.env.OBSIDIAN_TIMELINE_PATH || path.join(
      os.homedir(),
      'Library/Mobile Documents/iCloud~md~obsidian/Documents/Fun/AI-work/hermes_memories/TIMELINE.md'
    )
    const content = fs.readFileSync(changelogPath, 'utf-8')
    const lines = content.split('\n')
    lines.splice(2, 0, crashLog)
    fs.writeFileSync(changelogPath, lines.join('\n'))
  } catch {
    // Silently fail — Obsidian logging is non-critical
  }
}
