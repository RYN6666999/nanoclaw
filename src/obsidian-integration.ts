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
 * Append a one-line activity record to Current_Context.md.
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
 * Extract the NOW section (## ② ...) from WAKE.md
 */
function extractNowSection(content: string): string {
  const match = content.match(/## ②[^\n]*\n([\s\S]*?)(?=\n## ③|\n---\n|$)/);
  return match ? match[1].trim() : '';
}

/**
 * Replace the NOW section in WAKE.md with new content
 */
function replaceNowSection(content: string, newNow: string): string {
  return content.replace(
    /(## ②[^\n]*\n)([\s\S]*?)(?=\n## ③|\n---\n|$)/,
    `$1\n${newNow.trim()}\n\n`,
  );
}

/**
 * After each substantive conversation, call GLM-flash to rewrite
 * the WAKE.md NOW section with updated focus / todos / completed items.
 * Runs async, non-blocking, never throws.
 */
export async function updateWakeNow(
  userPrompt: string,
  assistantResult: string,
): Promise<void> {
  if (!OPENROUTER_API_KEY) return;

  try {
    const wakePath = path.join(OBSIDIAN_MEMORY_DIR, WAKE_FILE);
    if (!fs.existsSync(wakePath)) return;

    const wakeContent = fs.readFileSync(wakePath, 'utf-8');
    const currentNow = extractNowSection(wakeContent);
    if (!currentNow) return;

    const today = new Date().toISOString().slice(0, 10);
    const promptSummary = userPrompt.replace(/\s+/g, ' ').slice(0, 120);
    const resultSummary = (assistantResult || '').replace(/\s+/g, ' ').slice(0, 200);

    const systemMsg = `你是任務追蹤助手。根據本次對話更新 NOW 區塊。
規則：
1. **最後工作** → 今天日期(${today}) + 本次任務一行摘要
2. 若本次完成了「待辦」中的項目 → 移至「最近完成」並打 [x]
3. 若發現新待辦 → 加入「待辦」
4. 「最近完成」保留最新 7 條，舊的刪除
5. 只輸出 NOW 區塊內文，不含標題行，不加解釋`;

    const userMsg = `當前 NOW 區塊：\n${currentNow}\n\n本次對話：\n用戶：${promptSummary}\n助手完成：${resultSummary}\n\n輸出新的 NOW 區塊內文：`;

    const res = await fetch(`${OPENROUTER_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'X-Title': 'NanoClaw-WakeUpdater',
      },
      body: JSON.stringify({
        model: 'z-ai/glm-4.7-flash',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userMsg },
        ],
        max_tokens: 600,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return;

    const data = (await res.json()) as any;
    const newNow = data.choices?.[0]?.message?.content?.trim();
    if (!newNow || newNow.length < 20) return;

    const updated = replaceNowSection(wakeContent, newNow);
    fs.writeFileSync(wakePath, updated, 'utf-8');
    logger.debug('WAKE.md NOW section auto-updated');
  } catch {
    // non-critical, silent fail
  }
}

/**
 * Append a conversation exchange to a daily log file in Obsidian.
 * File: {MEMORY_DIR}/Conversations/YYYY-MM-DD.md
 * qmd will auto-index these, enabling semantic search over all past conversations.
 */
export function appendConversationLog(
  groupFolder: string,
  model: string,
  userPrompt: string,
  assistantResult: string,
): void {
  // Skip trivial exchanges
  const combined = userPrompt + assistantResult;
  if (combined.trim().length < 30) return;

  try {
    const convDir = path.join(OBSIDIAN_MEMORY_DIR, 'Conversations');
    if (!fs.existsSync(convDir)) fs.mkdirSync(convDir, { recursive: true });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const filePath = path.join(convDir, `${dateStr}.md`);

    // Truncate long content to keep files manageable
    const uTrunc = userPrompt.replace(/\s+/g, ' ').trim().slice(0, 300);
    const aTrunc = (assistantResult || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    const modelShort = model.split('/').pop() || model;

    const entry = `\n## ${timeStr} | ${groupFolder} | ${modelShort}\n\n**用戶**: ${uTrunc}\n\n**助手**: ${aTrunc}\n\n---`;

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, `# 對話日誌 ${dateStr}\n`, 'utf-8');
    }
    fs.appendFileSync(filePath, entry, 'utf-8');
  } catch {
    // non-critical
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

/**
 * Distill the past N days of Conversations/ logs into MEMORY.md.
 * Only runs once every DISTILL_INTERVAL_DAYS. Async, non-blocking.
 * Uses GLM-flash to summarize: key events, learned facts, user preferences.
 */
export async function distillMemoryIfNeeded(): Promise<void> {
  if (!OPENROUTER_API_KEY) return;

  try {
    const markerPath = path.join(OBSIDIAN_MEMORY_DIR, DISTILL_MARKER_FILE);
    const memoryPath = path.join(OBSIDIAN_MEMORY_DIR, MEMORY_FILE);
    const convDir = path.join(OBSIDIAN_MEMORY_DIR, 'Conversations');

    // Check if it's time to distill
    if (fs.existsSync(markerPath)) {
      const lastDistill = new Date(fs.readFileSync(markerPath, 'utf-8').trim());
      const daysSince =
        (Date.now() - lastDistill.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < DISTILL_INTERVAL_DAYS) return;
    }

    if (!fs.existsSync(convDir)) return;

    // Collect conversation logs from the past DISTILL_INTERVAL_DAYS days
    const cutoff = new Date(
      Date.now() - DISTILL_INTERVAL_DAYS * 24 * 60 * 60 * 1000,
    );
    const files = fs
      .readdirSync(convDir)
      .filter((f) => f.endsWith('.md'))
      .filter((f) => {
        const dateStr = f.replace('.md', '');
        return new Date(dateStr) >= cutoff;
      })
      .sort();

    if (files.length === 0) return;

    const rawLogs = files
      .map((f) => fs.readFileSync(path.join(convDir, f), 'utf-8'))
      .join('\n\n---\n\n')
      .slice(0, 12000); // cap to avoid huge prompts

    // Read existing MEMORY.md to merge/update
    const existingMemory = fs.existsSync(memoryPath)
      ? fs.readFileSync(memoryPath, 'utf-8').slice(0, 3000)
      : '（無舊記憶）';

    const today = new Date().toISOString().slice(0, 10);
    const systemMsg = `你是記憶蒸餾助手。將近期對話日誌蒸餾成結構化長期記憶。
輸出格式（Markdown）：
## 用戶偏好
- 列出從對話中觀察到的偏好、習慣、興趣

## 重要事件
- 列出關鍵決定、已完成的重要任務、重大改變（含日期）

## 學到的知識
- 列出 agent 學到的技術知識、工具用法、問題解法

## 待追蹤
- 列出用戶提到但未完成的事項

規則：每節最多 10 條。用繁體中文。只輸出 Markdown 內容，不加解釋。`;

    const userMsg = `舊記憶：\n${existingMemory}\n\n近期對話（${files[0]} 到 ${files[files.length - 1]}）：\n${rawLogs}\n\n請輸出更新後的記憶：`;

    const res = await fetch(`${OPENROUTER_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'X-Title': 'NanoClaw-MemoryDistiller',
      },
      body: JSON.stringify({
        model: 'z-ai/glm-4.7-flash',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userMsg },
        ],
        max_tokens: 1200,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return;

    const data = (await res.json()) as any;
    const distilled = data.choices?.[0]?.message?.content?.trim();
    if (!distilled || distilled.length < 50) return;

    const content = `# 長期記憶 MEMORY.md\n\n> 最後蒸餾：${today}（過去 ${DISTILL_INTERVAL_DAYS} 天對話，共 ${files.length} 個檔案）\n\n${distilled}\n`;
    fs.writeFileSync(memoryPath, content, 'utf-8');
    fs.writeFileSync(markerPath, new Date().toISOString(), 'utf-8');
    logger.info({ files: files.length }, 'MEMORY.md distilled');
  } catch {
    // non-critical, silent fail
  }
}
