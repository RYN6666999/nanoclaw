/**
 * AlertService — Shared alert dispatcher for heartbeat, decision-agent, etc.
 * Eliminates duplicated sendAlertCallback pattern across modules.
 */
import { logger } from './logger.js';

export type AlertSender = (text: string) => Promise<void>;

let sender: AlertSender | null = null;

/** Register the alert sender (called once from main). */
export function registerAlertSender(fn: AlertSender): void {
  sender = fn;
}

/** Send an alert message. No-op if sender not registered. */
export async function sendAlert(text: string): Promise<boolean> {
  if (!sender) {
    logger.debug('sendAlert called but no sender registered');
    return false;
  }
  try {
    await sender(text);
    return true;
  } catch (err: unknown) {
    logger.warn({ err }, 'AlertService: failed to send alert');
    return false;
  }
}
