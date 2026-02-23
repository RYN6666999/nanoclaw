/**
 * Tests for src/model-router.ts
 * Covers: prefix routing, keyword routing, long-doc routing, fallback chain, format.
 */

jest.mock('../../src/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/config', () => ({
  DEFAULT_LOCAL_MODEL: 'local-model',
  GEMINI_API_KEY: 'test-gemini-key',
  GEMINI_AUTO_THRESHOLD: 50000,
  GEMINI_MODEL: 'gemini-2.5-flash',
  OPENROUTER_API_KEY: 'test-openrouter-key',
  OPENROUTER_MODEL: 'x-ai/grok-3-mini',
  ROUTER_CONFIG: {
    complex_keywords: ['refactor', 'debug', 'architecture'],
    backends: {
      openrouter: { enabled: true },
      gemini: { enabled: true, auto_threshold: 50000 },
      claude: { enabled: true },
    },
  },
}));

import { routeMessage, getFallbackChain, formatRouteSignature, RouteResult } from '../../src/model-router';

describe('routeMessage', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ─── Prefix routing ───

  it('routes /claude to claude backend', () => {
    const result = routeMessage('/claude explain this code', false);
    expect(result.backend).toBe('claude');
    expect(result.reason).toBe('prefix');
    expect(result.prefix).toBe('/claude');
    expect(result.prompt).toBe('explain this code');
  });

  it('routes /gemini to gemini backend', () => {
    const result = routeMessage('/gemini summarize', false);
    expect(result.backend).toBe('gemini');
    expect(result.reason).toBe('prefix');
  });

  it('routes /rp to euryale model', () => {
    const result = routeMessage('/rp 繼續場景', false);
    expect(result.backend).toBe('openrouter');
    expect(result.model).toContain('euryale');
    expect(result.reason).toBe('prefix');
  });

  it('routes /flash to gemini tier 2', () => {
    const result = routeMessage('/flash fix this bug', false);
    expect(result.backend).toBe('gemini');
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.reason).toBe('prefix');
  });

  it('routes /pro to gemini pro', () => {
    const result = routeMessage('/pro complex analysis', false);
    expect(result.backend).toBe('gemini');
    expect(result.model).toContain('pro');
  });

  it('routes /codex to openrouter codex', () => {
    const result = routeMessage('/codex write code', false);
    expect(result.backend).toBe('openrouter');
    expect(result.model).toContain('codex');
  });

  it('handles prefix-only message (no trailing text)', () => {
    const result = routeMessage('/claude', false);
    expect(result.backend).toBe('claude');
    expect(result.reason).toBe('prefix');
  });

  // ─── Scheduled tasks ───

  it('routes scheduled tasks to claude', () => {
    const result = routeMessage('any prompt', true);
    expect(result.backend).toBe('claude');
    expect(result.reason).toBe('scheduled');
  });

  // ─── Deep RP keywords ───

  it('routes deep RP keywords to euryale', () => {
    const result = routeMessage('角色扮演一個故事', false);
    expect(result.backend).toBe('openrouter');
    expect(result.model).toContain('euryale');
    expect(result.reason).toBe('nsfw-rp');
  });

  it('routes English RP keywords', () => {
    const result = routeMessage('please stay in character', false);
    expect(result.reason).toBe('nsfw-rp');
  });

  // ─── Long document routing ───

  it('routes long documents to gemini', () => {
    const longPrompt = 'x'.repeat(60000);
    const result = routeMessage(longPrompt, false);
    expect(result.backend).toBe('gemini');
    expect(result.reason).toBe('long-doc');
  });

  // ─── Default routing ───

  it('defaults to gemini flash-lite for 赫爾密斯', () => {
    process.env.ASSISTANT_NAME = '赫爾密斯';
    const result = routeMessage('hello', false);
    expect(result.backend).toBe('gemini');
    expect(result.model).toContain('flash-lite');
    expect(result.reason).toBe('default');
  });

  it('defaults to grok-mini for non-赫爾密斯', () => {
    process.env.ASSISTANT_NAME = 'SeMeow';
    const result = routeMessage('hello', false);
    expect(result.backend).toBe('openrouter');
    expect(result.model).toContain('grok');
    expect(result.reason).toBe('default');
  });

  // ─── Message extraction from XML ───

  it('extracts last message from XML-formatted prompt', () => {
    const xmlPrompt = '<message role="user">old message</message>\n<message role="user">/claude help</message>';
    const result = routeMessage(xmlPrompt, false);
    expect(result.backend).toBe('claude');
    expect(result.reason).toBe('prefix');
  });
});

// ─── Fallback chain ───

describe('getFallbackChain', () => {
  it('excludes the failed backend', () => {
    const chain = getFallbackChain('openrouter');
    expect(chain.every(f => f.backend !== 'openrouter')).toBe(true);
  });

  it('returns alternatives for gemini failure', () => {
    const chain = getFallbackChain('gemini');
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.every(f => f.backend !== 'gemini')).toBe(true);
  });
});

// ─── Format ───

describe('formatRouteSignature', () => {
  it('formats prefix route with prefix label', () => {
    const route: RouteResult = {
      backend: 'claude',
      model: 'claude',
      prompt: 'test',
      reason: 'prefix',
      prefix: '/claude',
    };
    expect(formatRouteSignature(route)).toBe('[/claude → claude]');
  });

  it('formats default route', () => {
    const route: RouteResult = {
      backend: 'gemini',
      model: 'gemini-2.5-flash-lite',
      prompt: 'test',
      reason: 'default',
    };
    expect(formatRouteSignature(route)).toBe('[預設 → gemini-2.5-flash-lite]');
  });

  it('formats scheduled route', () => {
    const route: RouteResult = {
      backend: 'claude',
      model: 'claude',
      prompt: 'test',
      reason: 'scheduled',
    };
    expect(formatRouteSignature(route)).toBe('[排程 → claude]');
  });
});
