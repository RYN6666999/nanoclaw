// Minimal session-handoff-summary skill implementation
// Usage: echo '{"session": {...}}' | node ./dist/skills/session-handoff-summary/skill.js

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

type Summary = {
  title: string;
  summary: string;
  triggers: string[];
  priority: 'high'|'medium'|'low';
  changedFilesList?: string[];
  commitSuggestion?: { shouldCommit: boolean; message?: string };
  obsidianLog?: string;
};

const TRIGGERS = [
  '開新對話','保存進度','存檔','load','恢復','協作','復盤','總結','備份','額度快沒了','比對','handoff','handoff summary','save progress','resume'
];

function fuzzyMatch(text: string, phrase: string) {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

export function matchesTrigger(text: string) {
  if (!text) return false;
  return TRIGGERS.some(p => fuzzyMatch(text, p));
}

export function detectMilestone(meta: { changedFiles?: number; percentComplete?: number; important?: boolean } = {}): { priority: 'high'|'medium'|'low', autoCommit: boolean } {
  const { changedFiles = 0, percentComplete = 0, important = false } = meta;
  if (important || changedFiles >= 5 || percentComplete >= 90) return { priority: 'high', autoCommit: true };
  if (percentComplete >= 50 || changedFiles >= 2) return { priority: 'medium', autoCommit: false };
  return { priority: 'low', autoCommit: false };
}

export function suggestCommitMessage(summaryTitle: string, priority: 'high'|'medium'|'low') {
  if (priority === 'high') return `feat: milestone - ${summaryTitle}`;
  if (priority === 'medium') return `refactor: design note - ${summaryTitle}`;
  return `chore: progress update - ${summaryTitle}`;
}

// Define the structure of the expected JSON output from the LLM
interface HandoffResult {
  title: string;
  summary: string;
  userPreferences: string[];
  pitfalls: {
    description: string;
    solution: string;
  }[];
  goalAlignment: {
    progress: string;
    assessment: string;
  };
  commitSuggestion: {
    shouldCommit: boolean;
    message: string;
  };
  obsidianLog: string;
  nextSessionPrompt: string;
}

export async function generateHandoffSummary(input: { title?: string; messages?: string[]; meta?: any }): Promise<HandoffResult> {
  const title = input.title || 'Session handoff';
  const messages = input.messages || [];
  const combined = messages.join('\n');
  const triggers = TRIGGERS.filter(t => fuzzyMatch(combined, t));
  const det = detectMilestone(input.meta);
  const changedFilesList: string[] = (input.meta && input.meta.changedFilesList) || [];

  let llmResult: any = null;
  try {
    const { GEMINI_API_KEY } = await import('../../src/config.js');
    const apiKey = GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (apiKey) {
      const prompt = `
你是一個專案交接與進度總結助手。請根據以下對話紀錄與變更檔案，產生一份交接報告。
必須包含以下三個部分：
1. 下個對話的承先啟後脈絡提示詞 (Context prompt for the next conversation)
2. 判斷是否值得上傳git，如果有請輸出上傳的提示 (Judgment on whether to commit to Git, and the commit prompt)
3. 同步到 Obsidian 的進度工作日誌內容 (Content to sync to Obsidian's daily log)

對話紀錄：
${messages.join('\n')}

變更檔案：
${changedFilesList.join('\n')}

請以 JSON 格式輸出，包含以下欄位：
{
  "title": "簡短標題",
  "summary": "下個對話的承先啟後脈絡提示詞",
  "priority": "high|medium|low",
  "commitSuggestion": {
    "shouldCommit": true/false,
    "message": "建議的 commit 訊息"
  },
  "obsidianLog": "要寫入 Obsidian 的進度工作日誌內容"
}
`;
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          }),
        }
      );
      if (response.ok) {
        const data = await response.json();
        const resultText = data.candidates[0].content.parts[0].text;
        llmResult = JSON.parse(resultText) as HandoffResult;
      } else {
        console.error('LLM API error:', await response.text());
      }
    } else {
      console.error('No GEMINI_API_KEY or GOOGLE_API_KEY found');
    }
  } catch (e) {
    console.error('LLM summary generation failed', e);
  }

  if (llmResult) {
    // Write to Obsidian
    if (llmResult.obsidianLog) {
      try {
        const { writeObsidianContext } = await import('../../src/obsidian-integration.js');
        writeObsidianContext(llmResult.obsidianLog);
      } catch (e) {
        console.error('Failed to write to Obsidian', e);
      }
    }

    return llmResult;
  }

  // Fallback to basic logic
  const commitSuggestion = det.autoCommit ? { shouldCommit: true, message: suggestCommitMessage(title, det.priority) } : { shouldCommit: false };
  const first = messages[0] || '';
  const last = messages[messages.length - 1] || '';
  const summaryLines: string[] = [];
  if (first) summaryLines.push(`開始重點：${first}`);
  if (last) summaryLines.push(`待處理：${last}`);
  if (triggers.length) summaryLines.push(`觸發詞：${triggers.join(',')}`);
  if (changedFilesList.length) summaryLines.push(`變更檔案：${changedFilesList.slice(0,10).join(',')}`);
  summaryLines.push(`優先度：${det.priority}`);

  return {
    title,
    summary: summaryLines.join('\n'),
    triggers,
    priority: det.priority,
    changedFilesList,
    commitSuggestion
  };
}

// CLI wrapper for quick testing
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      if (process.argv.length < 3) {
        throw new Error('JSON input string not provided as a command-line argument.');
      }
      const input = JSON.parse(process.argv[2]);
      const result = await generateHandoffSummary(input.title, input.messages, input.meta || {});

      const obsidianDir = path.resolve(process.cwd(), 'Obsidian', 'Nano_Memories');
      const obsidianFile = path.resolve(obsidianDir, 'CURRENT.md');
      
      if (!fs.existsSync(obsidianDir)) {
        fs.mkdirSync(obsidianDir, { recursive: true });
      }
      fs.writeFileSync(obsidianFile, result.obsidianLog);

      // Output the structured JSON
      console.log(JSON.stringify(result, null, 2));
      
      // Output the explicit confirmation message for Obsidian log
      console.log(`\n✅ 精華日誌已同步至 Obsidian: ${path.relative(process.cwd(), obsidianFile)}`);

    } catch (error) {
      console.error('Error executing script:', error);
      process.exit(1);
    }
  })();
}
