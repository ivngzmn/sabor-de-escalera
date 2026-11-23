import { describe, expect, it } from 'vitest';
import { SHARE_SUMMARY_MAX, shareSummary } from '../../src/features/recipes/share-summary';

describe('shareSummary', () => {
  it('returns undefined for empty text', () => {
    expect(shareSummary('')).toBeUndefined();
    expect(shareSummary('   \n ')).toBeUndefined();
    expect(shareSummary(undefined)).toBeUndefined();
  });

  it('keeps short text and collapses whitespace', () => {
    expect(shareSummary('Soft  cookies\nwith manjar.')).toBe('Soft cookies with manjar.');
  });

  it('cuts long text on a word boundary within the limit', () => {
    const story = 'Alfajores are soft, tender cookies filled with manjar, also known as caramelized milk or dulce de leche. These melt-in-your-mouth sandwich cookies can be rolled in coconut.';
    const summary = shareSummary(story)!;
    expect(summary.length).toBeLessThanOrEqual(SHARE_SUMMARY_MAX);
    expect(summary.endsWith('…')).toBe(true);
    expect(story.startsWith(summary.slice(0, -1))).toBe(true);
    expect(summary).not.toMatch(/[\s,.]…$/);
  });
});
