/**
 * Tests for src/handoff-service.ts
 * Pure function — no mocks needed.
 */
import { formatHandoffLines } from '../../src/handoff-service';
import type { HandoffSummary } from '../../src/types';

describe('formatHandoffLines', () => {
  const fullSummary: HandoffSummary = {
    priority: 'HIGH',
    summary: '已完成 API key 輪替',
    obsidianLog: '寫入 Obsidian 完成',
    changedFilesList: ['src/config.ts', 'src/index.ts', '.env'],
    commitSuggestion: { shouldCommit: true, message: 'chore: rotate keys' },
  };

  it('formats full summary with all fields', () => {
    const lines = formatHandoffLines('main', fullSummary);
    expect(lines[0]).toContain('Handoff 建議');
    expect(lines[0]).toContain('main');
    expect(lines[1]).toContain('HIGH');
    const text = lines.join('\n');
    expect(text).toContain('承先啟後脈絡提示詞');
    expect(text).toContain('已完成 API key 輪替');
    expect(text).toContain('Obsidian');
    expect(text).toContain('src/config.ts');
    expect(text).toContain('建議 commit');
    expect(text).toContain('chore: rotate keys');
  });

  it('handles empty summary gracefully', () => {
    const lines = formatHandoffLines('test', {});
    expect(lines[0]).toContain('test');
    expect(lines.join('\n')).toContain('無自動 commit 建議');
  });

  it('omits obsidianLog and summary in compact mode', () => {
    const lines = formatHandoffLines('main', fullSummary, { compact: true });
    const text = lines.join('\n');
    expect(text).not.toContain('承先啟後脈絡提示詞');
    expect(text).not.toContain('Obsidian');
    expect(text).toContain('建議 commit');
  });

  it('respects custom label', () => {
    const lines = formatHandoffLines('main', fullSummary, { label: '自動 Handoff' });
    expect(lines[0]).toContain('自動 Handoff');
  });

  it('respects maxFiles limit', () => {
    const manyFiles = Array.from({ length: 30 }, (_, i) => `file${i}.ts`);
    const summary: HandoffSummary = { changedFilesList: manyFiles };
    const lines = formatHandoffLines('main', summary, { maxFiles: 5 });
    const text = lines.join('\n');
    expect(text).toContain('file4.ts');
    expect(text).not.toContain('file5.ts');
  });

  it('shows no commit suggestion when shouldCommit is false', () => {
    const summary: HandoffSummary = {
      commitSuggestion: { shouldCommit: false, message: '' },
    };
    const lines = formatHandoffLines('main', summary);
    expect(lines.join('\n')).toContain('無自動 commit 建議');
  });

  it('shows no commit suggestion when commitSuggestion is undefined', () => {
    const lines = formatHandoffLines('main', { priority: 'LOW' });
    expect(lines.join('\n')).toContain('無自動 commit 建議');
  });
});
