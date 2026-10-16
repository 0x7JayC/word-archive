import type { Draft, Meta, StoredFile, Word } from '../types';

/** One interface, two back ends: `local` (IndexedDB, demo mode) and `cloud` (Supabase, Phase 0+). */
export interface Store {
  readonly mode: 'demo' | 'cloud';
  getMeta(): Promise<Meta>;
  setMeta(patch: Partial<Meta>): Promise<void>;

  listWords(): Promise<Word[]>;
  getWord(id: string): Promise<Word | undefined>;
  saveWord(word: Word): Promise<void>;
  /** Deletes the word and every file attached to it. */
  deleteWord(id: string): Promise<void>;

  putFile(file: StoredFile): Promise<void>;
  getFile(id: string): Promise<StoredFile | undefined>;
  deleteFile(id: string): Promise<void>;

  listDrafts(): Promise<Draft[]>;
  getDraft(id: string): Promise<Draft | undefined>;
  saveDraft(draft: Draft): Promise<void>;
  /** Removes the draft; its file is kept only if a word now owns it. */
  deleteDraft(id: string, keepFile?: boolean): Promise<void>;

  /** Removes everything this store holds for the user. */
  wipe(): Promise<void>;
}
