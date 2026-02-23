import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 0. 載入 .env 檔案中的環境變數
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}
loadEnv();

// 1. 正確的 TypeScript 介面定義
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

// 2. 乾淨、功能完整的核心函式
async function generateHandoffSummary(
  title: string,
  messages: string[],
  meta: { changedFilesList?: string[] }
): Promise<HandoffResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY environment variable not set.');
  }

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const changedFiles = meta.changedFilesList
    ? `\n### 變更檔案\n- ${meta.changedFilesList.join('\n- ')}`
    : '';

  // 3. 強化後的 LLM 提示詞
  const prompt = `
**極重要指令：最終輸出的 JSON 物件中，所有的字串值，包含所有巢狀結構，都必須使用「繁體中文」。**

你是一位資深的軟體工程師，正在複盤一段使用者與 AI 程式設計助理之間的對話。你的任務是根據對話內容，產生一份結構化的 JSON 格式交接摘要。

請嚴格遵循以下的 JSON 結構，不要包含任何 Markdown 格式。

{
  "title": "為本次對話設定一個簡潔、精確的標題。",
  "summary": "中立地總結本次對話完成的工作、關鍵決策與最終成果。",
  "userPreferences": [
    "從對話中提煉出的使用者關鍵偏好。例如：'偏好人類可讀的總結，而非原始 JSON 輸出。'"
  ],
  "pitfalls": [
    {
      "description": "描述一個在過程中遇到的具體技術問題或「坑」。",
      "solution": "描述解決該問題的關鍵步驟或領悟。"
    }
  ],
  "goalAlignment": {
    "progress": "量化本次對話對專案的推進程度。例如：'核心功能完成 75%'、'完成 4 個階段中的第 2 階段'。",
    "assessment": "簡要評估本次對話的活動是否與專案總體目標一致。"
  },
  "commitSuggestion": {
    "shouldCommit": true,
    "message": "如果變更值得提交，則產生一條符合慣例的 commit 訊息，否則為空字串。"
  },
  "obsidianLog": "一份詳細的 Obsidian Markdown 格式日誌。必須包含：總結、關鍵決策、使用者偏好、踩坑紀錄與解決方案、目標校準。內容必須為繁體中文。",
  "nextSessionPrompt": "為下一個 AI 助理產生一段簡潔、富含上下文的提示詞。此項至關重要。格式為 Markdown，需包含：**先前脈絡**、**最終狀態**與**後續目標**（需具體、可量化）。內容必須為繁體中文。"
}

### 對話上下文
**標題:** ${title}

**訊息:**
${messages.map(m => `- "${m}"`).join('\n')}

**元數據:**${changedFiles}
`;

  // 4. 正確的 API 呼叫
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        response_mime_type: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  
  if (!data.candidates || !data.candidates[0].content.parts[0].text) {
    console.error('Invalid API response structure:', JSON.stringify(data, null, 2));
    throw new Error('Failed to parse LLM response.');
  }

  const resultText = data.candidates[0].content.parts[0].text;
  return JSON.parse(resultText) as HandoffResult;
}

// 5. 穩定的命令列執行包裝器
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

      console.log(JSON.stringify(result, null, 2));
      console.log(`\n✅ 精華日誌已同步至 Obsidian: ${path.relative(process.cwd(), obsidianFile)}`);

    } catch (error) {
      console.error('Error executing script:', error);
      process.exit(1);
    }
  })();
}
