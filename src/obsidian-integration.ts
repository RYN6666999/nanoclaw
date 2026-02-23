/**
 * Obsidian Memory Integration for NanoClaw
 * Reads/writes external memory to survive model/session switches
 */
import fs from 'fs';
import path from 'path';
import {
  OBSIDIAN_CURRENT_CONTEXT,
  OBSIDIAN_MEMORY_DIR,
  OPENROUTER_API_KEY,
  OPENROUTER_API_BASE_URL,
} from './config.js';
import { logger } from './logger.js';

const WAKE_FILE = 'WAKE.md';
const MEMORY_FILE = 'MEMORY.md';
const DISTILL_MARKER_FILE = '.last_distill';
const CONTEXT_MAX_CHARS = 3000;
const DISTILL_INTERVAL_DAYS = 7;

/**
 * Ensure Obsidian memory directory exists
 */
export function initializeObsidianMemory(): void {
  try {
    if (!fs.existsSync(OBSIDIAN_MEMORY_DIR)) {
      fs.mkdirSync(OBSIDIAN_MEMORY_DIR, { recursive: true });
      logger.info({ path: OBSIDIAN_MEMORY_DIR }, 'Created Obsidian memory directory');
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Failed to initialize Obsidian memory directory',
    );
  }
}

/**
 * Read current context from Obsidian
 * Returns the memory content if found, empty string otherwise
 */
export function readObsidianContext(): string {
  try {
    if (!fs.existsSync(OBSIDIAN_CURRENT_CONTEXT)) {
      return '';
    }
    const content = fs.readFileSync(OBSIDIAN_CURRENT_CONTEXT, 'utf-8');
    logger.debug({ size: content.length }, 'Read Obsidian context');
    return content;
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Failed to read Obsidian context',
    );
    return '';
  }
}

/**
 * Write context to Obsidian memory
 * Called when transitioning between models or before clearing session
 */
export function writeObsidianContext(context: string): void {
  try {
    // Ensure directory exists
    if (!fs.existsSync(OBSIDIAN_MEMORY_DIR)) {
      fs.mkdirSync(OBSIDIAN_MEMORY_DIR, { recursive: true });
    }

    // Write with timestamp
    const timestamp = new Date().toISOString();
    const content = `# Nano Claw Context (${timestamp})\n\n${context}\n\n---\nLast updated: ${timestamp}\n`;

    fs.writeFileSync(OBSIDIAN_CURRENT_CONTEXT, content, 'utf-8');
    logger.debug({ size: context.length }, 'Wrote Obsidian context');
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Failed to write Obsidian context',
    );
  }
}

/**
 * Read WAKE.md — the startup bootstrap file for the bot.
 * Returns trimmed content (capped to avoid bloating system prompt).
 */
export function readWakeFile(): string {
  try {
    const wakePath = path.join(OBSIDIAN_MEMORY_DIR, WAKE_FILE);
    if (!fs.existsSync(wakePath)) return '';
    const raw = fs.readFileSync(wakePath, 'utf-8');
    // Strip HTML comments and collapse blank lines to save tokens
    const trimmed = raw
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return trimmed.length > CONTEXT_MAX_CHARS
      ? trimmed.slice(0, CONTEXT_MAX_CHARS) + '\n...(truncated)'
      : trimmed;
  } catch {
    return '';
  }
}

/**
 * Append a one-line activity record to CURRENT.md.
 * Called automatically after each agent response — no LLM needed.
 * Format: @LAST: YYYY-MM-DD HH:MM | [group] | [summary]
 */
export function autoAppendActivityLog(
  groupFolder: string,
  userPrompt: string,
  toolsUsed: string[],
): void {
  try {
    if (!fs.existsSync(OBSIDIAN_CURRENT_CONTEXT)) return;

    const now = new Date();
    const ts = now.toISOString().slice(0, 16).replace('T', ' ');
    const summary = userPrompt.replace(/\s+/g, ' ').slice(0, 80);
    const tools = toolsUsed.length ? ` [tools: ${toolsUsed.join(', ')}]` : '';
    const line = `\n@LAST: ${ts} | ${groupFolder} | ${summary}${tools}`;

    // Keep only last 10 @LAST lines to prevent unbounded growth
    let content = fs.readFileSync(OBSIDIAN_CURRENT_CONTEXT, 'utf-8');
    const lastLines = content.split('\n').filter((l) => l.startsWith('@LAST:'));
    if (lastLines.length >= 10) {
      content = content.replace(/\n@LAST:.*$/gm, '');
    }
    fs.appendFileSync(OBSIDIAN_CURRENT_CONTEXT, line, 'utf-8');
  } catch {
    // non-critical, silent fail
  }
}

 

/**
 * Append to daily notes for memory preservation
 * Called periodically to persist important decisions
 */
export function appendObsidianDailyNote(entry: string): void {
  try {
    const today = new Date().toISOString().split('T')[0];
    const dailyNoteDir = path.join(OBSIDIAN_MEMORY_DIR, 'Daily');
    const dailyNotePath = path.join(dailyNoteDir, `${today}.md`);

    if (!fs.existsSync(dailyNoteDir)) {
      fs.mkdirSync(dailyNoteDir, { recursive: true });
    }

    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${entry}\n`;

    if (fs.existsSync(dailyNotePath)) {
      fs.appendFileSync(dailyNotePath, logEntry, 'utf-8');
    } else {
      const header = `# ${today}\n\n`;
      fs.writeFileSync(dailyNotePath, header + logEntry, 'utf-8');
    }

    logger.debug({ date: today }, 'Appended to daily note');
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Failed to append daily note',
    );
  }
}

 
