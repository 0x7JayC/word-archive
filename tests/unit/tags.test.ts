// How many theme tags fit on one line of a timeline card, leaving room for "+N".
import { describe, expect, it } from 'vitest';
import { fitTagCount } from '../../lib/roadmap/tags';

describe('fitTagCount', () => {
  it('keeps every tag when they all fit', () => {
    expect(fitTagCount([60, 50], 2, 212, 5, 30)).toBe(2);
  });

  it('drops tags that do not fit and leaves room for "+N"', () => {
    // all three need 250 px; two plus "+1" need 210 px
    expect(fitTagCount([90, 80, 70], 3, 212, 5, 30)).toBe(2);
  });

  it('leaves room for "+N" when the word has more themes than the three shown', () => {
    expect(fitTagCount([60, 50, 40], 5, 212, 5, 30)).toBe(3);
    expect(fitTagCount([70, 60, 50], 5, 212, 5, 30)).toBe(2);
  });

  it('always shows at least one tag, even one wider than the line', () => {
    expect(fitTagCount([300, 40], 2, 212, 5, 30)).toBe(1);
  });

  it('shows nothing for a word without themes', () => {
    expect(fitTagCount([], 0, 212, 5, 30)).toBe(0);
  });
});
