// Fictional sample sentences only (project rule: no real journal content in tests).
import { describe, expect, it } from 'vitest';
import { findScriptures, findThemes, findTimeframe, normaliseTag, suggest } from '../../lib/suggest';

describe('findScriptures: only explicit references', () => {
  it('finds book + chapter:verse and ranges', () => {
    expect(findScriptures('Hold on to Proverbs 3:5-6 and Isaiah 40:31.')).toEqual(['Proverbs 3:5-6', 'Isaiah 40:31']);
  });
  it('expands abbreviations and numbered books', () => {
    expect(findScriptures('see 1 Cor 14:33 and Phil. 4:19, also 2 Tim 1:7')).toEqual(['1 Corinthians 14:33', 'Philippians 4:19', '2 Timothy 1:7']);
  });
  it('accepts roman and word ordinals', () => {
    expect(findScriptures('I John 4:18 and First Peter 5:7')).toEqual(['1 John 4:18', '1 Peter 5:7']);
  });
  it('allows chapter-only for Psalms, not for other books', () => {
    expect(findScriptures('Psalm 23 comforts me')).toEqual(['Psalm 23']);
    expect(findScriptures('Mark 5 times on the calendar')).toEqual([]);
  });
  it('ignores quotations without a reference, titles and lowercase words', () => {
    expect(findScriptures('The Lord is my shepherd. Rev. Sam spoke. I will act 2 times.')).toEqual([]);
  });
  it('deduplicates', () => {
    expect(findScriptures('John 3:16 ... John 3:16')).toEqual(['John 3:16']);
  });
});

describe('findTimeframe: the literal phrase used', () => {
  it.each([
    ['This will happen within two years, says the speaker.', 'within two years'],
    ['In the coming months you will see it.', 'in the coming months'],
    ['It will come in due time.', 'in due time'],
    ['Talk to them when the time is right.', 'when the time is right'],
    ['A new season is starting', 'a new season'],
    ['This year is different', 'this year'],
    ['It will happen soon.', 'soon'],
    ['Later you will open the door', 'later'],
  ])('%s -> %s', (text, phrase) => expect(findTimeframe(text)).toBe(phrase));
  it('prefers the most specific phrase', () => {
    expect(findTimeframe('Soon, within 3 months, it will begin')).toBe('within 3 months');
  });
  it('ignores "as soon as"', () => expect(findTimeframe('Call me as soon as you can')).toBe(''));
  it('returns empty when there is none', () => expect(findTimeframe('Be encouraged.')).toBe(''));
});

describe('findThemes: literal keywords, user tags first', () => {
  it('suggests from the starter vocabulary and explains why', () => {
    const t = findThemes('God will provide for your family and give you peace.');
    expect(t.map((x) => x.tag)).toEqual(['provision', 'peace', 'family']);
    expect(t.find((x) => x.tag === 'provision')?.because).toBe('provide');
  });
  it("puts the user's existing tags first, matching hyphenated tags as words", () => {
    const t = findThemes('There is a spiritual warfare element and a new direction.', ['spiritual-warfare']);
    expect(t[0]).toEqual({ tag: 'spiritual-warfare', because: 'spiritual warfare' });
    expect(t.map((x) => x.tag)).toContain('guidance');
  });
  it('matches whole words only', () => {
    expect(findThemes('Recall the peacemaker').map((x) => x.tag)).toEqual([]);
  });
  it('caps at 8 suggestions', () => {
    const text = 'calling provide guidance peace prayer healing family breakthrough prepare identity courage mentor';
    expect(findThemes(text).length).toBe(8);
  });
});

describe('suggest + normaliseTag', () => {
  it('combines all three', () => {
    const s = suggest('Pray over Psalm 91 this season.');
    expect(s.scriptures).toEqual(['Psalm 91']);
    expect(s.timeframe).toBe('this season');
    expect(s.themes.map((x) => x.tag)).toEqual(['prayer']);
  });
  it('normalises typed tags', () => {
    expect(normaliseTag('  Serving Others! ')).toBe('serving-others');
    expect(normaliseTag('信心')).toBe('信心');
  });
});
