// "Export everything": one zip with words.json (all records, readable) and the original files.
import { strToU8, zipSync } from 'fflate';
import type { Store } from './store/types';

export async function exportZip(store: Store, now = new Date()): Promise<{ bytes: Uint8Array; filename: string; count: number }> {
  const words = await store.listWords();
  const entries: Record<string, Uint8Array> = {};
  const index: Array<Record<string, unknown>> = [];
  const usedNames = new Set<string>();
  for (const w of words) {
    const files: string[] = [];
    for (const id of w.fileIds) {
      const f = await store.getFile(id);
      if (!f) continue;
      let name = `files/${w.dateGiven}_${f.name}`.replace(/[\\/:*?"<>|]+/g, (c) => (c === '/' ? '/' : '_'));
      let n = 2;
      while (usedNames.has(name)) name = name.replace(/(\.[^.]+)?$/, (ext) => `-${n++}${ext}`);
      usedNames.add(name);
      entries[name] = new Uint8Array(f.data);
      files.push(name);
    }
    index.push({ ...w, files });
  }
  entries['words.json'] = strToU8(JSON.stringify({ exportedAt: now.toISOString(), format: 'word-archive/1', words: index }, null, 2));
  const stamp = now.toISOString().slice(0, 10);
  return { bytes: zipSync(entries, { level: 0 }), filename: `word-archive-export-${stamp}.zip`, count: words.length };
}
