import { dateLabel, dayNumber, todayIso } from './dates';
import type { Store } from './store/types';
import type { StoredFile, Word } from './types';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyWord(now = new Date()): Word {
  const t = now.toISOString();
  return {
    id: uid(), dateGiven: todayIso(now), datePrecision: 'exact', dateNote: '', givenBy: '', context: '',
    verbatim: '', themes: [], scriptures: [], timeframe: '', status: 'pending', transcriptQuality: 'verified',
    reflections: [], fileIds: [], createdAt: t, updatedAt: t,
  };
}

export function sortWords(words: Word[]): Word[] {
  return [...words].sort((a, b) => a.dateGiven.localeCompare(b.dateGiven) || a.createdAt.localeCompare(b.createdAt));
}

export function allTags(words: Word[]): string[] {
  const count = new Map<string, number>();
  for (const w of words) for (const t of w.themes) count.set(t, (count.get(t) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

export function paragraphs(verbatim: string): string[] {
  return verbatim.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

export function excerpt(verbatim: string, n = 140): string {
  const flat = paragraphs(verbatim).join(' ').replace(/\s+/g, ' ');
  const chars = Array.from(flat);
  return chars.length <= n ? flat : chars.slice(0, n - 1).join('').trimEnd() + '…';
}

export interface MediaRef { kind: 'audio' | 'image'; url: string; name: string }

/** Shape expected by the roadmap UI (same fields as the original Prophetic Words records). */
export function toRoadmapRecord(w: Word, media: MediaRef[] = []) {
  return {
    id: w.id,
    date: w.dateGiven,
    day: dayNumber(w.dateGiven),
    label: dateLabel(w.dateGiven, w.datePrecision),
    short: dateLabel(w.dateGiven, w.datePrecision, true),
    date_note: w.dateNote,
    given_by: w.givenBy || 'Unnamed speaker',
    context: w.context,
    status: w.status,
    themes: w.themes,
    scriptures: w.scriptures,
    timeframe: w.timeframe,
    transcript_quality: w.transcriptQuality,
    audio: '',
    recording: false,
    media,
    paragraphs: paragraphs(w.verbatim),
    excerpt: excerpt(w.verbatim),
    reflections: w.reflections.map((r) => `${r.writtenOn} · ${r.text}`),
  };
}

/** Object URLs for a word's files. Call the returned revoke() when the view unmounts. */
export async function mediaFor(store: Store, w: Word): Promise<{ media: MediaRef[]; revoke: () => void }> {
  const urls: string[] = [];
  const media: MediaRef[] = [];
  for (const id of w.fileIds) {
    const f = (await store.getFile(id)) as StoredFile | undefined;
    if (!f) continue;
    const url = URL.createObjectURL(new Blob([f.data], { type: f.type || 'application/octet-stream' }));
    urls.push(url);
    media.push({ kind: f.kind, url, name: f.name });
  }
  return { media, revoke: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}
