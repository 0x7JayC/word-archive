import type { StoredFile } from './types';
import { uid } from './words';

export const MAX_AUDIO_BYTES = 100 * 1024 * 1024; // spec §5.9
export const MAX_AUDIO_SECONDS = 60 * 60;

export type InputKind = 'audio' | 'image' | 'text';

export function kindOf(file: { name: string; type?: string }): InputKind | null {
  const t = file.type || '';
  const n = file.name.toLowerCase();
  if (t.startsWith('audio/') || /\.(m4a|mp3|wav|aac|ogg|oga|webm|caf|flac|opus)$/.test(n)) return 'audio';
  if (t.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp|gif)$/.test(n)) return 'image';
  if (t.startsWith('text/') || /\.(txt|md)$/.test(n)) return 'text';
  return null;
}

function guessType(name: string): string {
  const ext = name.toLowerCase().split('.').pop() || '';
  const map: Record<string, string> = {
    m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', webm: 'audio/webm',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp', gif: 'image/gif',
  };
  return map[ext] || 'application/octet-stream';
}

export async function toStoredFile(blob: Blob, name: string, kind: 'audio' | 'image', durationS?: number): Promise<StoredFile> {
  const data = await blob.arrayBuffer();
  return { id: uid(), wordId: null, kind, name, type: blob.type || guessType(name), size: data.byteLength, data, durationS };
}

/** Best effort: browsers that can't read the file's length simply return undefined. */
export function audioDuration(blob: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (typeof Audio === 'undefined' || typeof URL.createObjectURL !== 'function') return resolve(undefined);
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    const finish = (v?: number) => { URL.revokeObjectURL(url); resolve(v && isFinite(v) ? v : undefined); };
    const timer = setTimeout(() => finish(undefined), 4000);
    a.preload = 'metadata';
    a.onloadedmetadata = () => { clearTimeout(timer); finish(a.duration); };
    a.onerror = () => { clearTimeout(timer); finish(undefined); };
    a.src = url;
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(s?: number): string {
  if (!s) return '';
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
