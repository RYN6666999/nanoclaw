/**
 * Tests for src/telegram/commands.ts — applySemeowShortcuts.
 * Other command handlers require full grammy Context mock; shortcuts are pure logic.
 */

// We need to control ASSISTANT_NAME per test
let mockAssistantName = '瑟喵助手';

jest.mock('../../src/config', () => ({
  get ASSISTANT_NAME() { return mockAssistantName; },
  MAIN_GROUP_FOLDER: 'main',
  DATA_DIR: '/tmp',
  PM2_CMD_PREFIX: '',
  GROUPS_DIR: '/tmp/groups',
  HF_TOKEN: '',
}));
jest.mock('../../src/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { applySemeowShortcuts } from '../../src/telegram/commands';

describe('applySemeowShortcuts', () => {
  beforeEach(() => {
    mockAssistantName = '瑟喵助手';
  });

  it('returns false when ASSISTANT_NAME is not 瑟喵助手', () => {
    mockAssistantName = 'Andy';
    const msg = { text: '📊 系統狀態' };
    expect(applySemeowShortcuts(msg)).toBe(false);
    expect(msg.text).toBe('📊 系統狀態'); // unchanged
  });

  it('replaces 📊 系統狀態 with /status', () => {
    const msg = { text: '📊 系統狀態' };
    expect(applySemeowShortcuts(msg)).toBe(true);
    expect(msg.text).toBe('/status');
  });

  it('replaces 🔞 啟動大腦風暴 with NSFW prompt', () => {
    const msg = { text: '🔞 啟動大腦風暴' };
    expect(applySemeowShortcuts(msg)).toBe(true);
    expect(msg.text).toContain('NSFW');
  });

  it('returns false for non-shortcut text', () => {
    const msg = { text: '你好' };
    expect(applySemeowShortcuts(msg)).toBe(false);
    expect(msg.text).toBe('你好');
  });

  it('replaces 🧠 查看記憶', () => {
    const msg = { text: '🧠 查看記憶' };
    expect(applySemeowShortcuts(msg)).toBe(true);
    expect(msg.text).toContain('記憶');
  });

  it('replaces 🎭 進入 RP 模式', () => {
    const msg = { text: '🎭 進入 RP 模式' };
    expect(applySemeowShortcuts(msg)).toBe(true);
    expect(msg.text).toContain('角色扮演');
  });
});
