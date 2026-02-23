/**
 * Tests for src/telegram/state.ts
 * Verifies bot singleton get/set behaviour.
 */

import { getBot, setBot } from '../../src/telegram/state';

describe('telegram/state', () => {
  afterEach(() => {
    setBot(null);
  });

  it('returns null when no bot is set', () => {
    expect(getBot()).toBeNull();
  });

  it('stores and retrieves bot instance', () => {
    const fakeBot = { api: 'mock' } as any;
    setBot(fakeBot);
    expect(getBot()).toBe(fakeBot);
  });

  it('can reset bot to null', () => {
    setBot({ api: 'mock' } as any);
    setBot(null);
    expect(getBot()).toBeNull();
  });
});
