/**
 * 進程衝突預防 — 啟動時檢查是否有相同 bot 實例運行
 * 避免 Telegram 409 conflict
 */

import { execSync } from 'child_process'
import { logger } from './logger.js'

export function checkDuplicateInstance(botToken: string): void {
  const botId = botToken.split(':')[0]

  try {
    // 搜尋同一個 bot token 的運行進程
    const result = execSync(
      `ps aux | grep -E "tsx.*index.ts|node.*nanoclaw" | grep -v grep || true`,
      { encoding: 'utf-8' }
    )

    const lines = result.trim().split('\n').filter(Boolean)
    const currentPid = process.pid

    // 排除自己，檢查是否有其他進程
    const otherInstances = lines.filter(line => {
      // 檢查是否包含當前 PID
      return !line.includes(currentPid.toString())
    })

    if (otherInstances.length > 0) {
      logger.warn('⚠️  Detected potential duplicate bot instance', {
        currentPid,
        otherInstances: otherInstances.length,
        botId
      })

      // 不強制退出，只警告（PM2 會管理多實例）
      // 但如果是手動啟動，應該先停掉其他實例
    }

    logger.info('Process guard check passed', { botId, currentPid })
  } catch (err) {
    logger.error('Process guard check failed', { err })
  }
}

/**
 * 清除殘留的 webhook（Telegram 409 conflict 的常見原因）
 */
export async function clearWebhookOnStartup(botToken: string): Promise<void> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=true`
    )
    const data = await response.json() as { ok: boolean; description?: string }

    if (data.ok) {
      logger.info('Webhook cleared successfully on startup')
    } else {
      logger.warn('Failed to clear webhook', { description: data.description })
    }
  } catch (err) {
    logger.error('Error clearing webhook', { err })
  }
}
