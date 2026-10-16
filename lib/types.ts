export type Status = 'pending' | 'unfolding' | 'fulfilled' | 'unclear';
export type DatePrecision = 'exact' | 'month' | 'year' | 'approx';
export type SourceKind = 'audio' | 'image' | 'text';
export type TranscriptQuality = 'verified' | 'rough-auto' | 'none';

export const STATUSES: Status[] = ['pending', 'unfolding', 'fulfilled', 'unclear'];

export interface Reflection {
  id: string;
  writtenOn: string; // ISO date
  text: string;
}

export interface Word {
  id: string;
  dateGiven: string; // YYYY-MM-DD; day/month may be 00 when imprecise
  datePrecision: DatePrecision;
  dateNote: string;
  givenBy: string;
  context: string;
  verbatim: string; // exactly as given; paragraphs separated by a blank line
  themes: string[];
  scriptures: string[];
  timeframe: string;
  status: Status;
  transcriptQuality: TranscriptQuality;
  reflections: Reflection[];
  fileIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Files are stored as ArrayBuffer (portable across storage back ends and structured clone). */
export interface StoredFile {
  id: string;
  wordId: string | null;
  kind: Exclude<SourceKind, 'text'>;
  name: string;
  type: string;
  size: number;
  data: ArrayBuffer;
  durationS?: number;
}

/** A file waiting in the bulk-import queue, not yet reviewed into a word. */
export interface Draft {
  id: string;
  fileId: string | null;
  kind: SourceKind;
  name: string;
  text: string; // text content for .txt/.md imports
  createdAt: string;
}

export interface Meta {
  onboardedAt?: string;
  consentVersion?: string;
  /** Spec §7c: the user agreed to send recordings for transcription (remembered in this browser). */
  transcribeConsentAt?: string;
  transcribeConsentVersion?: string;
  /** The shared tester code for the Transcribe button. Not personal; never exported. */
  testerCode?: string;
}

export const CONSENT_VERSION = 'demo-2026-09-29';
