/**
 * Telegram utility functions: JID helpers, prompt enrichment, Markdown→HTML conversion.
 */
import { OPENROUTER_API_KEY } from '../config.js';
import { logger } from '../logger.js';

const TG_JID_PREFIX = 'tg:';

export function makeTelegramJid(chatId: number): string {
  return `${TG_JID_PREFIX}${chatId}`;
}

export function isTelegramJid(jid: string): boolean {
  return jid.startsWith(TG_JID_PREFIX);
}

export function getTelegramChatId(jid: string): number {
  return parseInt(jid.slice(TG_JID_PREFIX.length), 10);
}

/**
 * 用 OpenRouter Grok 翻譯 + 豐富提示詞（中文 → 英文 + 詳細描述）
 */
export async function enrichPrompt(
  userPrompt: string,
  nsfw = false,
): Promise<{ finalPrompt: string; original: string }> {
  const systemPrompt = nsfw
    ? `You are an expert adult image generation prompt engineer for FLUX.1-schnell.
Given a user description (may be Chinese), you must:
1. Translate to English if needed
2. Enrich with explicit adult details: body features, clothing state, expression, pose, skin texture, lighting, camera angle
3. Add quality tags: masterpiece, best quality, highly detailed, 8k uhd, photorealistic
4. Keep it under 150 words

Return ONLY the final English prompt, no explanation.`
    : `你是圖片生成提示詞專家。
用戶給你一個圖片描述（可能是中文），你需要：
1. 翻譯成英文（如果已是英文則保持）
2. 豐富提示詞細節：加入風格、質感、光線、構圖、色彩等專業描述
3. 符合 FLUX.1-schnell 模型的最佳實踐

只回傳最終的英文提示詞，無需其他解釋。`;

  const apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
  const apiKey = OPENROUTER_API_KEY;
  const model = 'x-ai/grok-3-mini';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status, model },
        'Enrichment failed, using original',
      );
      return { finalPrompt: userPrompt, original: userPrompt };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const enriched = data.choices?.[0]?.message?.content?.trim() || userPrompt;

    return { finalPrompt: enriched, original: userPrompt };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Enrichment error, using original',
    );
    return { finalPrompt: userPrompt, original: userPrompt };
  }
}

/**
 * Convert LLM Markdown output to Telegram-compatible HTML.
 * Telegram supports: <b>, <i>, <code>, <pre>, <a href="">, <s>, <u>
 */
export function markdownToTelegramHtml(md: string): string {
  const escHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = md.split('\n');
  const out: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        out.push(`<pre>${escHtml(codeBlockLines.join('\n'))}</pre>`);
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Skip markdown table separator rows (|---|---|)
    if (/^\|[\s\-:|]+\|$/.test(line.trim())) continue;

    // Convert table rows: | a | b | → a  b
    let processed = line;
    if (/^\|.*\|$/.test(processed.trim())) {
      processed = processed
        .trim()
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim())
        .join('  ');
    }

    processed = escHtml(processed);
    processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    processed = processed.replace(/__(.+?)__/g, '<b>$1</b>');
    processed = processed.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '<i>$1</i>');
    processed = processed.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<i>$1</i>');
    processed = processed.replace(/~~(.+?)~~/g, '<s>$1</s>');
    processed = processed.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2">$1</a>',
    );
    processed = processed.replace(/^#{1,6}\s+(.+)/, '<b>$1</b>');

    out.push(processed);
  }

  if (inCodeBlock && codeBlockLines.length > 0) {
    out.push(`<pre>${escHtml(codeBlockLines.join('\n'))}</pre>`);
  }

  return out.join('\n');
}
