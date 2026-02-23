import fs from 'fs';
import path from 'path';
import * as child from 'child_process';
import { loadHandoffs, applyHandoffs } from '../src/auto-commit.js';

jest.mock('child_process');

describe('auto-commit module', () => {
  const fakePath = path.join(process.cwd(), 'logs', 'handoff_suggestions.test.json');
  const sample = [
    { time: '2026-02-23T00:00:00Z', group: 'main', summary: { commitSuggestion: { shouldCommit: true, message: 'feat: test' } } },
    { time: '2026-02-23T00:01:00Z', group: 'other', summary: { commitSuggestion: { shouldCommit: false } } },
  ];

  beforeAll(() => {
    if (!fs.existsSync(path.dirname(fakePath))) fs.mkdirSync(path.dirname(fakePath), { recursive: true });
    fs.writeFileSync(fakePath, JSON.stringify(sample, null, 2));
  });
  afterAll(() => {
    try { fs.unlinkSync(fakePath); } catch {}
  });

  test('loadHandoffs reads file', () => {
    const arr = loadHandoffs(fakePath);
    expect(arr.length).toBe(2);
    expect(arr[0].group).toBe('main');
  });

  test('applyHandoffs dry-run does not call git', () => {
    const execMock = child.execSync as jest.Mock;
    execMock.mockClear();
    const arr = loadHandoffs(fakePath);
    const actions = applyHandoffs(arr, { apply: false, autoCommitEnabled: false });
    expect(actions.length).toBe(1);
    expect(execMock).not.toHaveBeenCalled();
  });

  test('applyHandoffs with apply and disabled autoCommit does not call git', () => {
    const execMock = child.execSync as jest.Mock;
    execMock.mockClear();
    const arr = loadHandoffs(fakePath);
    const actions = applyHandoffs(arr, { apply: true, autoCommitEnabled: false });
    expect(actions.length).toBe(1);
    expect(execMock).not.toHaveBeenCalled();
  });

  test('applyHandoffs with apply and enabled autoCommit calls git', () => {
    const execMock = child.execSync as jest.Mock;
    execMock.mockClear();
    const arr = loadHandoffs(fakePath);
    execMock.mockImplementation(() => 'ok');
    const actions = applyHandoffs(arr, { apply: true, autoCommitEnabled: true });
    expect(actions.length).toBe(1);
    expect(execMock).toHaveBeenCalledTimes(2);
    expect(actions[0].committed).toBe(true);
  });
});
