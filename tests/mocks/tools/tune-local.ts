/**
 * Tune Local Model Tool — lets cloud models adjust the local LLM's behavior
 * via system prompt modifications and few-shot example curation.
 *
 * Layer 1: Prompt tuning (read/modify CLAUDE.md + local-specific rules)
 * Layer 2: Few-shot curation (evaluate and store high-quality Q&A pairs)
 */
import fs from 'fs';
import path from 'path';
import { GROUPS_DIR } from '../config.js';
import type { Tool } from './index.js';

const LOCAL_RULES_FILENAME = 'local-rules.md';
const EXAMPLES_FILENAME = 'local-examples.json';

interface Example {
  question: string;
  answer: string;
  score: number;
  timestamp: string;
  source_model: string;
}

function getLocalRulesPath(groupFolder: string): string {
  return path.join(GROUPS_DIR, groupFolder, LOCAL_RULES_FILENAME);
}

function getExamplesPath(groupFolder: string): string {
  return path.join(GROUPS_DIR, groupFolder, EXAMPLES_FILENAME);
}

async function handler(args: Record<string, unknown>): Promise<string> {
  const action = String(args.action || 'read');
  const groupFolder = String(args.group || 'main');

  switch (action) {
    case 'read_rules': {
      const rulesPath = getLocalRulesPath(groupFolder);
      try {
        return fs.readFileSync(rulesPath, 'utf-8');
      } catch {
        return '(no local-specific rules yet — use add_rule to create)';
      }
    }

    case 'add_rule': {
      const rule = String(args.rule || '');
      if (!rule) return 'Error: rule is required';

      const rulesPath = getLocalRulesPath(groupFolder);
      let existing = '';
      try {
        existing = fs.readFileSync(rulesPath, 'utf-8');
      } catch {
        existing = '# Local Model Rules\n\nThese rules are injected into the local LLM system prompt.\n';
      }

      // Avoid duplicates
      if (existing.includes(rule)) {
        return `Rule already exists: "${rule}"`;
      }

      existing += `\n- ${rule}`;
      fs.writeFileSync(rulesPath, existing, 'utf-8');
      return `Rule added: "${rule}"\nTotal rules file: ${existing.split('\n- ').length - 1} rules`;
    }

    case 'replace_rules': {
      const content = String(args.content || '');
      if (!content) return 'Error: content is required';

      const rulesPath = getLocalRulesPath(groupFolder);
      fs.writeFileSync(rulesPath, content, 'utf-8');
      return `Rules replaced (${content.length} chars)`;
    }

    case 'add_example': {
      const question = String(args.question || '');
      const answer = String(args.answer || '');
      const score = Number(args.score || 5);
      const sourceModel = String(args.source_model || 'deepseek-chat');

      if (!question || !answer) return 'Error: question and answer are required';

      const examplesPath = getExamplesPath(groupFolder);
      let examples: Example[] = [];
      try {
        examples = JSON.parse(fs.readFileSync(examplesPath, 'utf-8'));
      } catch {
        // Start fresh
      }

      examples.push({
        question,
        answer,
        score,
        timestamp: new Date().toISOString(),
        source_model: sourceModel,
      });

      // Keep only top 50 by score, newest first for ties
      examples.sort((a, b) => b.score - a.score || b.timestamp.localeCompare(a.timestamp));
      examples = examples.slice(0, 50);

      fs.writeFileSync(examplesPath, JSON.stringify(examples, null, 2), 'utf-8');
      return `Example added (score: ${score}). Total: ${examples.length} examples.`;
    }

    case 'list_examples': {
      const examplesPath = getExamplesPath(groupFolder);
      try {
        const examples: Example[] = JSON.parse(fs.readFileSync(examplesPath, 'utf-8'));
        if (examples.length === 0) return '(no examples yet)';

        return examples
          .slice(0, 10)
          .map((e, i) => `${i + 1}. [${e.score}/5] Q: ${e.question.slice(0, 60)}... → A: ${e.answer.slice(0, 60)}...`)
          .join('\n') + `\n\nTotal: ${examples.length} examples`;
      } catch {
        return '(no examples yet)';
      }
    }

    case 'read_prompt': {
      const claudeMd = path.join(GROUPS_DIR, groupFolder, 'CLAUDE.md');
      try {
        return fs.readFileSync(claudeMd, 'utf-8');
      } catch {
        return '(no CLAUDE.md found)';
      }
    }

    default:
      return `Unknown action: ${action}. Available: read_rules, add_rule, replace_rules, add_example, list_examples, read_prompt`;
  }
}

export const tuneLocal: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'tune_local',
      description: 'Tune the local LLM behavior. Actions: read_rules (view current local rules), add_rule (add a behavior rule), replace_rules (overwrite all rules), add_example (store a high-quality Q&A pair for few-shot), list_examples (view stored examples), read_prompt (view the full system prompt).',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['read_rules', 'add_rule', 'replace_rules', 'add_example', 'list_examples', 'read_prompt'],
            description: 'Action to perform',
          },
          group: {
            type: 'string',
            description: 'Group folder name (default: main)',
          },
          rule: {
            type: 'string',
            description: 'Rule text (for add_rule)',
          },
          content: {
            type: 'string',
            description: 'Full rules content (for replace_rules)',
          },
          question: {
            type: 'string',
            description: 'Example question (for add_example)',
          },
          answer: {
            type: 'string',
            description: 'Example answer (for add_example)',
          },
          score: {
            type: 'number',
            description: 'Quality score 1-5 (for add_example, default: 5)',
          },
          source_model: {
            type: 'string',
            description: 'Which model generated this answer (for add_example)',
          },
        },
        required: ['action'],
      },
    },
  },
  handler,
};
