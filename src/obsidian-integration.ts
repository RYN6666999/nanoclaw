/**
 * Obsidian Memory Integration for NanoClaw
 * Reads/writes external memory to survive model/session switches
 */
import fs from 'fs';
import path from 'path';
import { OBSIDIAN_CURRENT_CONTEXT, OBSIDIAN_MEMORY_DIR } from './config.js';
import { logger } from './logger.js';

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
    const content = `# Nano Claw Context (${timestamp})

${context}

---
Last updated: ${timestamp}
`;

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
