/**
 * Tests for src/db.ts — using in-memory SQLite for zero side effects.
 */

// Mock config to use temp directory
const tmpDir = require('os').tmpdir() + '/nanoclaw-test-' + Date.now();
jest.mock('../../src/config', () => ({
  STORE_DIR: tmpDir,
}));
jest.mock('../../src/memory_compression', () => ({
  initMemoryCompression: jest.fn(),
}));

import {
  initDatabase,
  storeTelegramMessage,
  getMessagesSince,
  getMessageById,
  getAllChats,
  createTask,
  getTaskById,
  getTasksForGroup,
  getAllTasks,
  updateTask,
  deleteTask,
  getDueTasks,
  updateTaskAfterRun,
  logTaskRun,
  getTaskRunLogs,
} from '../../src/db';
import type { TaskRunLog } from '../../src/types';
import fs from 'fs';

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  initDatabase();
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('messages', () => {
  it('stores and retrieves a message by ID', () => {
    storeTelegramMessage('m1', 'chat1', 'user1', 'Alice', 'hello', '2026-01-01T00:00:00Z', false);
    const msg = getMessageById('m1', 'chat1');
    expect(msg).toBeDefined();
    expect(msg!.content).toBe('hello');
    expect(msg!.sender_name).toBe('Alice');
  });

  it('returns undefined for non-existent message', () => {
    expect(getMessageById('nonexist', 'chat1')).toBeUndefined();
  });

  it('getMessagesSince excludes bot messages', () => {
    storeTelegramMessage('m2', 'chat1', 'user1', 'Alice', 'msg2', '2026-01-01T00:01:00Z', false);
    storeTelegramMessage('m3', 'chat1', 'bot', 'Bot', 'reply', '2026-01-01T00:02:00Z', true);
    const msgs = getMessagesSince('chat1', '2026-01-01T00:00:30Z');
    expect(msgs.length).toBe(1);
    expect(msgs[0].content).toBe('msg2');
  });

  it('upserts chat entry on store', () => {
    storeTelegramMessage('m10', 'chatX', 'u1', 'Bob', 'hi', '2026-02-01T00:00:00Z', false);
    const chats = getAllChats();
    const chatX = chats.find(c => c.jid === 'chatX');
    expect(chatX).toBeDefined();
    expect(chatX!.last_message_time).toBe('2026-02-01T00:00:00Z');
  });
});

describe('scheduled_tasks', () => {
  it('creates and retrieves a task', () => {
    createTask({
      id: 't1',
      group_folder: 'main',
      chat_jid: 'chat1',
      prompt: 'daily check',
      schedule_type: 'cron',
      schedule_value: '0 9 * * *',
      context_mode: 'isolated',
      next_run: '2026-01-02T09:00:00Z',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
    });
    const task = getTaskById('t1');
    expect(task).toBeDefined();
    expect(task!.prompt).toBe('daily check');
  });

  it('lists tasks for a group', () => {
    const tasks = getTasksForGroup('main');
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    expect(tasks.every(t => t.group_folder === 'main')).toBe(true);
  });

  it('lists all tasks', () => {
    expect(getAllTasks().length).toBeGreaterThanOrEqual(1);
  });

  it('updates a task field', () => {
    updateTask('t1', { status: 'paused' });
    expect(getTaskById('t1')!.status).toBe('paused');
  });

  it('deletes a task', () => {
    createTask({
      id: 'tdel',
      group_folder: 'main',
      chat_jid: 'chat1',
      prompt: 'delete me',
      schedule_type: 'once',
      schedule_value: '2026-12-31',
      context_mode: 'isolated',
      next_run: null,
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
    });
    deleteTask('tdel');
    expect(getTaskById('tdel')).toBeUndefined();
  });

  it('getDueTasks returns tasks with next_run <= now', () => {
    createTask({
      id: 'tdue',
      group_folder: 'main',
      chat_jid: 'chat1',
      prompt: 'overdue',
      schedule_type: 'once',
      schedule_value: '2020-01-01',
      context_mode: 'group',
      next_run: '2020-01-01T00:00:00Z',
      status: 'active',
      created_at: '2020-01-01T00:00:00Z',
    });
    const due = getDueTasks();
    expect(due.some(t => t.id === 'tdue')).toBe(true);
  });

  it('updateTaskAfterRun sets last_run and next_run', () => {
    updateTaskAfterRun('t1', '2026-01-03T09:00:00Z', 'ok');
    const t = getTaskById('t1');
    expect(t!.next_run).toBe('2026-01-03T09:00:00Z');
    expect(t!.last_result).toBe('ok');
  });
});

describe('task_run_logs', () => {
  it('logs and retrieves a task run', () => {
    const log: TaskRunLog = {
      task_id: 't1',
      run_at: '2026-01-02T09:00:01Z',
      duration_ms: 150,
      status: 'success',
      result: 'done',
      error: null,
    };
    logTaskRun(log);
    const logs = getTaskRunLogs('t1');
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].status).toBe('success');
  });

  it('returns empty array for unknown task', () => {
    expect(getTaskRunLogs('nonexist')).toEqual([]);
  });
});
