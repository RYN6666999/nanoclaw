import {
  generateHandoffSummary,
  detectMilestone,
  suggestCommitMessage,
  matchesTrigger,
} from '../skills/session-handoff-summary/skill.js';

describe('session-handoff-summary skill', () => {
  test('detects triggers and includes them in summary', () => {
    const messages = ['這是開始', '請保存進度，額度快沒了'];
    const out = generateHandoffSummary({ title: 'T', messages, meta: { changedFiles: 0 } });
    expect(out.triggers.length).toBeGreaterThan(0);
    expect(out.summary).toContain('觸發詞');
  });

  test('milestone detection thresholds', () => {
    const low = detectMilestone({ changedFiles: 0, percentComplete: 10 });
    expect(low.priority).toBe('low');

    const medium = detectMilestone({ changedFiles: 2, percentComplete: 60 });
    expect(medium.priority).toBe('medium');

    const high = detectMilestone({ changedFiles: 6, percentComplete: 95 });
    expect(high.priority).toBe('high');
  });

  test('suggestCommitMessage formats correctly', () => {
    expect(suggestCommitMessage('MyFeature', 'high')).toMatch(/feat: milestone/);
    expect(suggestCommitMessage('DesignX', 'medium')).toMatch(/refactor: design note/);
    expect(suggestCommitMessage('Progress', 'low')).toMatch(/chore: progress update/);
  });

  test('matchesTrigger fuzzy match', () => {
    expect(matchesTrigger('請保存進度')).toBeTruthy();
    expect(matchesTrigger('no match here')).toBeFalsy();
  });
});
