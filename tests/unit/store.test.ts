import { IDBFactory } from 'fake-indexeddb';
import { unzipSync, strFromU8 } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportZip } from '../../lib/exporter';
import { LocalStore } from '../../lib/store/local';
import type { StoredFile } from '../../lib/types';
import { allTags, emptyWord, excerpt, paragraphs, toRoadmapRecord } from '../../lib/words';

let store: LocalStore;
beforeEach(() => { store = new LocalStore(new IDBFactory()); });

const file = (id: string, wordId: string | null = null): StoredFile => ({
  id, wordId, kind: 'audio', name: 'sample.m4a', type: 'audio/mp4', size: 3, data: new Uint8Array([1, 2, 3]).buffer,
});

describe('LocalStore', () => {
  it('saves, lists, updates and deletes words', async () => {
    const w = { ...emptyWord(), givenBy: 'Sample Speaker', verbatim: 'A fictional word.' };
    await store.saveWord(w);
    expect((await store.listWords()).map((x) => x.givenBy)).toEqual(['Sample Speaker']);
    await store.saveWord({ ...w, status: 'fulfilled' });
    expect((await store.getWord(w.id))?.status).toBe('fulfilled');
    await store.deleteWord(w.id);
    expect(await store.listWords()).toEqual([]);
  });

  it('attaches files to a word and deletes them with it', async () => {
    await store.putFile(file('f1'));
    const w = { ...emptyWord(), fileIds: ['f1'] };
    await store.saveWord(w);
    expect((await store.getFile('f1'))?.wordId).toBe(w.id);
    expect(new Uint8Array((await store.getFile('f1'))!.data)).toEqual(new Uint8Array([1, 2, 3]));
    await store.deleteWord(w.id);
    expect(await store.getFile('f1')).toBeUndefined();
  });

  it('drafts: deleting a draft removes its unclaimed file but keeps a claimed one', async () => {
    await store.putFile(file('a'));
    await store.putFile(file('b'));
    await store.saveDraft({ id: 'd1', fileId: 'a', kind: 'audio', name: 'a', text: '', createdAt: '' });
    await store.saveDraft({ id: 'd2', fileId: 'b', kind: 'audio', name: 'b', text: '', createdAt: '' });
    await store.deleteDraft('d1');
    expect(await store.getFile('a')).toBeUndefined();
    await store.saveWord({ ...emptyWord(), fileIds: ['b'] });
    await store.deleteDraft('d2');
    expect(await store.getFile('b')).toBeDefined();
    expect(await store.listDrafts()).toEqual([]);
  });

  it('meta merges and wipe removes everything', async () => {
    await store.setMeta({ onboardedAt: 'x' });
    await store.setMeta({ consentVersion: 'v' });
    expect(await store.getMeta()).toEqual({ onboardedAt: 'x', consentVersion: 'v' });
    await store.saveWord(emptyWord());
    await store.putFile(file('z'));
    await store.wipe();
    expect(await store.getMeta()).toEqual({});
    expect(await store.listWords()).toEqual([]);
    expect(await store.getFile('z')).toBeUndefined();
  });
});

describe('export', () => {
  it('produces a zip with words.json and the original files', async () => {
    await store.putFile(file('f1'));
    await store.saveWord({ ...emptyWord(), dateGiven: '2025-01-15', verbatim: 'Fictional text', fileIds: ['f1'] });
    const { bytes, filename, count } = await exportZip(store, new Date('2026-09-29T10:00:00Z'));
    expect(filename).toBe('word-archive-export-2026-09-29.zip');
    expect(count).toBe(1);
    const zip = unzipSync(bytes);
    const json = JSON.parse(strFromU8(zip['words.json']));
    expect(json.words[0].verbatim).toBe('Fictional text');
    expect(json.words[0].files).toEqual(['files/2025-01-15_sample.m4a']);
    expect(zip['files/2025-01-15_sample.m4a']).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('word helpers', () => {
  it('splits paragraphs, builds excerpts and tag lists', () => {
    expect(paragraphs('One.\n\nTwo\nlines.\n\n\nThree.')).toEqual(['One.', 'Two\nlines.', 'Three.']);
    expect(excerpt('x'.repeat(200)).length).toBe(140);
    const a = { ...emptyWord(), themes: ['peace', 'calling'] }, b = { ...emptyWord(), themes: ['calling'] };
    expect(allTags([a, b])).toEqual(['calling', 'peace']);
  });
  it('maps to the roadmap record shape', () => {
    const r = toRoadmapRecord({ ...emptyWord(), dateGiven: '2024-09-00', datePrecision: 'month', reflections: [{ id: 'r', writtenOn: '2026-01-02', text: 'Mine' }] });
    expect(r.label).toBe('September 2024');
    expect(r.given_by).toBe('Unnamed speaker');
    expect(r.reflections).toEqual(['2026-01-02 · Mine']);
  });
});
