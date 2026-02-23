/**
 * Tests for src/telegram/utils.ts
 * Pure function tests — no external dependencies needed for JID/markdown helpers.
 */

jest.mock('../../src/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/config', () => ({
  OPENROUTER_API_KEY: 'test-key',
}));

import {
  makeTelegramJid,
  isTelegramJid,
  getTelegramChatId,
  markdownToTelegramHtml,
} from '../../src/telegram/utils';

// ─── JID helpers ───

describe('makeTelegramJid', () => {
  it('prepends tg: prefix', () => {
    expect(makeTelegramJid(12345)).toBe('tg:12345');
  });

  it('handles negative chat ids (groups)', () => {
    expect(makeTelegramJid(-100123456)).toBe('tg:-100123456');
  });
});

describe('isTelegramJid', () => {
  it('returns true for tg: prefixed strings', () => {
    expect(isTelegramJid('tg:12345')).toBe(true);
  });

  it('returns false for non-tg strings', () => {
    expect(isTelegramJid('wa:12345')).toBe(false);
    expect(isTelegramJid('12345')).toBe(false);
    expect(isTelegramJid('')).toBe(false);
  });
});

describe('getTelegramChatId', () => {
  it('extracts numeric chat id', () => {
    expect(getTelegramChatId('tg:12345')).toBe(12345);
  });

  it('handles negative ids', () => {
    expect(getTelegramChatId('tg:-100123456')).toBe(-100123456);
  });
});

// ─── markdownToTelegramHtml ───

describe('markdownToTelegramHtml', () => {
  it('converts bold **text**', () => {
    expect(markdownToTelegramHtml('hello **world**')).toBe('hello <b>world</b>');
  });

  it('converts bold __text__', () => {
    expect(markdownToTelegramHtml('hello __world__')).toBe('hello <b>world</b>');
  });

  it('converts italic *text*', () => {
    expect(markdownToTelegramHtml('hello *world*')).toBe('hello <i>world</i>');
  });

  it('converts italic _text_', () => {
    expect(markdownToTelegramHtml('hello _world_')).toBe('hello <i>world</i>');
  });

  it('converts inline code', () => {
    expect(markdownToTelegramHtml('use `npm install`')).toBe('use <code>npm install</code>');
  });

  it('converts strikethrough', () => {
    expect(markdownToTelegramHtml('~~deleted~~')).toBe('<s>deleted</s>');
  });

  it('converts links', () => {
    expect(markdownToTelegramHtml('[Google](https://google.com)')).toBe(
      '<a href="https://google.com">Google</a>',
    );
  });

  it('converts headings to bold', () => {
    expect(markdownToTelegramHtml('# Title')).toBe('<b>Title</b>');
    expect(markdownToTelegramHtml('### Sub')).toBe('<b>Sub</b>');
  });

  it('escapes HTML entities', () => {
    expect(markdownToTelegramHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('handles code blocks', () => {
    const input = '```\nconst x = 1;\nconst y = 2;\n```';
    const result = markdownToTelegramHtml(input);
    expect(result).toBe('<pre>const x = 1;\nconst y = 2;</pre>');
  });

  it('handles unclosed code blocks gracefully', () => {
    const input = '```\nsome code\nmore code';
    const result = markdownToTelegramHtml(input);
    expect(result).toContain('<pre>');
    expect(result).toContain('some code');
  });

  it('converts table rows to plain text', () => {
    const input = '| Name | Age |\n|------|-----|\n| Alice | 30 |';
    const result = markdownToTelegramHtml(input);
    expect(result).toContain('Name');
    expect(result).toContain('Age');
    // separator row should be removed
    expect(result).not.toContain('---');
  });

  it('handles mixed formatting', () => {
    const input = '**bold** and *italic* and `code`';
    const result = markdownToTelegramHtml(input);
    expect(result).toContain('<b>bold</b>');
    expect(result).toContain('<i>italic</i>');
    expect(result).toContain('<code>code</code>');
  });

  it('handles empty input', () => {
    expect(markdownToTelegramHtml('')).toBe('');
  });

  it('preserves multiline', () => {
    const input = 'line 1\nline 2\nline 3';
    const result = markdownToTelegramHtml(input);
    expect(result).toBe('line 1\nline 2\nline 3');
  });
});

// ─── enrichPrompt (async, needs fetch mock) ───

describe('enrichPrompt', () => {
  const { enrichPrompt } = require('../../src/telegram/utils');

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns enriched prompt on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'enriched prompt text' } }],
      }),
    }) as any;

    const result = await enrichPrompt('一隻貓');
    expect(result.finalPrompt).toBe('enriched prompt text');
    expect(result.original).toBe('一隻貓');
  });

  it('falls back to original on HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as any;

    const result = await enrichPrompt('test prompt');
    expect(result.finalPrompt).toBe('test prompt');
    expect(result.original).toBe('test prompt');
  });

  it('falls back to original on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as any;

    const result = await enrichPrompt('test prompt');
    expect(result.finalPrompt).toBe('test prompt');
  });

  it('uses nsfw system prompt when nsfw=true', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'nsfw enriched' } }],
      }),
    }) as any;

    const result = await enrichPrompt('test', true);
    expect(result.finalPrompt).toBe('nsfw enriched');

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.messages[0].content).toContain('adult');
  });
});
