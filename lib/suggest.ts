// Rule-based suggestions. Transparent by design: every suggestion carries the literal words that triggered it.
// No interpretation: scripture only when explicitly cited with chapter and verse, timeframe only as the literal phrase,
// themes only from literal keywords (the user's own tags first). The user confirms everything.
import { BOOKS } from './bible';

export interface ThemeSuggestion { tag: string; because: string }
export interface Suggestions { themes: ThemeSuggestion[]; scriptures: string[]; timeframe: string }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- scripture ----------
const ORDINALS: Record<string, string> = { '1': '1', '2': '2', '3': '3', I: '1', II: '2', III: '3', First: '1', Second: '2', Third: '3' };
const NAME_TO_BOOK = new Map<string, string>();
for (const [canonical, aliases] of BOOKS) {
  for (const n of [canonical, ...aliases]) NAME_TO_BOOK.set(n.replace(/^[123] /, '').toLowerCase() + '|' + (n.match(/^([123]) /)?.[1] ?? ''), canonical);
}
// base names (without the leading number), longest first so "Song of Solomon" wins over "Song"
const BASE_NAMES = Array.from(new Set(BOOKS.flatMap(([c, a]) => [c, ...a]).map((n) => n.replace(/^[123] /, ''))))
  .sort((a, b) => b.length - a.length);
const SCRIPTURE_RE = new RegExp(
  String.raw`(?<!\w)(?:(1|2|3|I{1,3}|First|Second|Third)\s*)?(` + BASE_NAMES.map(esc).join('|') + String.raw`)\.?\s+(\d{1,3})(?:\s*:\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?(?!\w)`,
  'g'
);

export function findScriptures(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(SCRIPTURE_RE)) {
    const [, ord, base, chapter, verse, verseEnd] = m;
    if (!/^[A-Z]/.test(base)) continue; // book names are capitalised when cited
    const num = ord ? ORDINALS[ord] : '';
    const book = NAME_TO_BOOK.get(base.toLowerCase() + '|' + num);
    if (!book) continue;
    const isPsalm = book === 'Psalms';
    if (!verse && !isPsalm) continue; // chapter-only only for Psalms ("Psalm 23"); avoids "Mark 5 times"
    const ref = `${isPsalm && !verse ? 'Psalm' : book} ${chapter}${verse ? ':' + verse : ''}${verseEnd ? '-' + verseEnd : ''}`;
    if (!out.includes(ref)) out.push(ref);
  }
  return out;
}

// ---------- timeframe (literal phrase, most specific first) ----------
const NUM = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\\d+)';
const TIMEFRAME_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\bwithin (?:the next )?${NUM} (?:days?|weeks?|months?|years?)\b`, 'i'),
  new RegExp(String.raw`\b(?:in|over|within) the (?:next|coming) (?:${NUM} |few )?(?:days|weeks|months|years|seasons?)\b`, 'i'),
  /\bin due (?:time|season)\b/i,
  /\bwhen the time is right\b/i,
  /\b(?:this|the next|next|a new|new|coming) season\b/i,
  /\b(?:this|next) (?:year|month|week)\b/i,
  /\bat this hour\b/i,
  /\bin (?:the )?(?:near )?future\b/i,
  /(?<!as )\bsoon\b(?! as)/i,
  /\blater\b/i,
];

export function findTimeframe(text: string): string {
  for (const re of TIMEFRAME_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0].toLowerCase();
  }
  return '';
}

// ---------- themes ----------
/** Starter vocabulary: tag → literal keywords. Only whole words/phrases count. */
export const STARTER_THEMES: Record<string, string[]> = {
  calling: ['calling', 'called', 'call', 'purpose', 'assignment', 'destiny'],
  provision: ['provision', 'provide', 'provided', 'supply', 'supplied', 'resources', 'finances'],
  guidance: ['guidance', 'guide', 'direction', 'directions', 'paths', 'the way you should go'],
  peace: ['peace'],
  prayer: ['prayer', 'prayers', 'pray', 'praying', 'intercession'],
  healing: ['healing', 'heal', 'healed', 'restoration', 'restore'],
  family: ['family', 'household', 'children', 'wife', 'husband', 'marriage'],
  breakthrough: ['breakthrough', 'break out', 'break through', 'ceiling', 'ceilings', 'limitations'],
  preparation: ['preparation', 'prepare', 'preparing', 'prepared', 'equip', 'equipping', 'equipped', 'training', 'sharpening'],
  identity: ['identity', 'who you are', 'more to you'],
  courage: ['courage', 'courageous', 'fear not', 'do not be afraid', 'be strong'],
  mentorship: ['mentor', 'mentors', 'mentoring', 'spiritual father'],
  leadership: ['leadership', 'leader', 'leaders'],
  waiting: ['waiting', 'wait', 'patience', 'holding place'],
  connections: ['connections', 'connector', 'connect', 'connecting', 'relationships'],
  clarity: ['clarity', 'clearer', 'understanding'],
  nations: ['nations', 'nation'],
  'serving-others': ['serve others', 'help other people', 'help others', 'serving others'],
  purity: ['purity', 'pure'],
  joy: ['joy', 'rejoice'],
};

function phraseRe(phrase: string) {
  return new RegExp(String.raw`(?<![\w-])` + esc(phrase).replace(/\\-| /g, '[\\s-]+') + String.raw`(?![\w-])`, 'i');
}

export function findThemes(text: string, existingTags: string[] = []): ThemeSuggestion[] {
  const out: ThemeSuggestion[] = [];
  const seen = new Set<string>();
  const add = (tag: string, because: string) => { if (!seen.has(tag)) { seen.add(tag); out.push({ tag, because }); } };
  // the user's own tags first, matched on the tag's literal words
  for (const tag of existingTags) {
    const m = text.match(phraseRe(tag.replace(/-/g, ' ')));
    if (m) add(tag, m[0]);
  }
  for (const [tag, words] of Object.entries(STARTER_THEMES)) {
    for (const w of words) {
      const m = text.match(phraseRe(w));
      if (m) { add(tag, m[0]); break; }
    }
  }
  return out.slice(0, 8);
}

export function suggest(text: string, existingTags: string[] = []): Suggestions {
  return { themes: findThemes(text, existingTags), scriptures: findScriptures(text), timeframe: findTimeframe(text) };
}

/** Normalise a user-typed tag: lowercase, spaces to hyphens, only letters/numbers/hyphens. */
export function normaliseTag(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
