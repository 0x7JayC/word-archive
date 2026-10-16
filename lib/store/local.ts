// Demo-mode store: everything lives in this browser's IndexedDB. Nothing is uploaded.
import type { Draft, Meta, StoredFile, Word } from '../types';
import type { Store } from './types';

const DB_NAME = 'word-archive';
const DB_VERSION = 1;
type StoreName = 'meta' | 'words' | 'files' | 'drafts';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

export function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('words')) db.createObjectStore('words', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' }).createIndex('wordId', 'wordId');
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class LocalStore implements Store {
  readonly mode = 'demo' as const;
  private dbp: Promise<IDBDatabase> | null = null;
  // Constructing the store touches nothing: the database opens on first use, which only happens in the browser
  // (pages are pre-rendered on the server, where IndexedDB does not exist).
  constructor(private readonly factory?: IDBFactory) {}
  private db(): Promise<IDBDatabase> {
    if (!this.dbp) this.dbp = openDb(this.factory ?? indexedDB);
    return this.dbp;
  }

  private async run<T>(names: StoreName | StoreName[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T> | T): Promise<T> {
    const db = await this.db();
    const tx = db.transaction(names, mode);
    const finished = done(tx); // listen before any request runs, or a fast transaction completes unobserved
    const result = await fn(tx);
    await finished;
    return result;
  }

  getMeta(): Promise<Meta> {
    return this.run('meta', 'readonly', async (tx) => ((await req(tx.objectStore('meta').get('meta'))) as Meta) || {});
  }
  async setMeta(patch: Partial<Meta>) {
    const cur = await this.getMeta();
    await this.run('meta', 'readwrite', (tx) => { tx.objectStore('meta').put({ ...cur, ...patch }, 'meta'); });
  }

  listWords(): Promise<Word[]> {
    return this.run('words', 'readonly', (tx) => req(tx.objectStore('words').getAll() as IDBRequest<Word[]>));
  }
  getWord(id: string) {
    return this.run('words', 'readonly', (tx) => req(tx.objectStore('words').get(id) as IDBRequest<Word | undefined>));
  }
  async saveWord(word: Word) {
    await this.run(['words', 'files'], 'readwrite', async (tx) => {
      tx.objectStore('words').put(word);
      const files = tx.objectStore('files');
      for (const id of word.fileIds) {
        const f = (await req(files.get(id))) as StoredFile | undefined;
        if (f && f.wordId !== word.id) files.put({ ...f, wordId: word.id });
      }
    });
  }
  async deleteWord(id: string) {
    await this.run(['words', 'files'], 'readwrite', async (tx) => {
      const files = tx.objectStore('files');
      const owned = (await req(files.index('wordId').getAllKeys(id))) as IDBValidKey[];
      for (const k of owned) files.delete(k);
      tx.objectStore('words').delete(id);
    });
  }

  async putFile(file: StoredFile) { await this.run('files', 'readwrite', (tx) => { tx.objectStore('files').put(file); }); }
  getFile(id: string) {
    return this.run('files', 'readonly', (tx) => req(tx.objectStore('files').get(id) as IDBRequest<StoredFile | undefined>));
  }
  async deleteFile(id: string) { await this.run('files', 'readwrite', (tx) => { tx.objectStore('files').delete(id); }); }

  listDrafts(): Promise<Draft[]> {
    return this.run('drafts', 'readonly', (tx) => req(tx.objectStore('drafts').getAll() as IDBRequest<Draft[]>));
  }
  getDraft(id: string) {
    return this.run('drafts', 'readonly', (tx) => req(tx.objectStore('drafts').get(id) as IDBRequest<Draft | undefined>));
  }
  async saveDraft(draft: Draft) { await this.run('drafts', 'readwrite', (tx) => { tx.objectStore('drafts').put(draft); }); }
  async deleteDraft(id: string, keepFile = false) {
    await this.run(['drafts', 'files'], 'readwrite', async (tx) => {
      const d = (await req(tx.objectStore('drafts').get(id))) as Draft | undefined;
      if (d && d.fileId && !keepFile) {
        const f = (await req(tx.objectStore('files').get(d.fileId))) as StoredFile | undefined;
        if (f && !f.wordId) tx.objectStore('files').delete(d.fileId);
      }
      tx.objectStore('drafts').delete(id);
    });
  }

  async wipe() {
    await this.run(['meta', 'words', 'files', 'drafts'], 'readwrite', (tx) => {
      for (const n of ['meta', 'words', 'files', 'drafts'] as StoreName[]) tx.objectStore(n).clear();
    });
  }
}
