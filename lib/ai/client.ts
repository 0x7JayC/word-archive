// Browser side of transcription (spec §7c): prepare pieces, send them three at a time, join the text in order.
// On failure, the finished pieces at the start are returned in the error so Retry can continue from there.
import { joinPieces } from '@/lib/audio/pcm';
import { preparePieces, type AudioSource, type Decoder, type Piece } from '@/lib/audio/prepare';
import { TranscribeError, type TranscribeErrorCode } from './types';

export type Progress = { stage: 'preparing' } | { stage: 'sending'; done: number; total: number };

export interface TranscribeOptions {
  code: string;
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  /** Texts of the first pieces finished in an earlier attempt; those pieces are not sent again. */
  done?: string[];
  decode?: Decoder;
  fetchImpl?: typeof fetch;
  concurrency?: number;
  retryDelayMs?: number;
}

const CODES: TranscribeErrorCode[] = ['bad_code', 'not_configured', 'unavailable', 'out_of_credit', 'busy', 'too_large', 'unsupported', 'network', 'aborted', 'failed'];
const isCode = (v: unknown): v is TranscribeErrorCode => typeof v === 'string' && (CODES as string[]).includes(v);

async function sendPiece(piece: Piece, code: string, signal: AbortSignal, doFetch: typeof fetch): Promise<string> {
  let res: Response;
  try {
    res = await doFetch('/api/ai/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Tester-Code': code, 'X-Audio-Format': piece.format },
      body: piece.body as BodyInit,
      signal,
    });
  } catch {
    throw new TranscribeError(signal.aborted ? 'aborted' : 'network');
  }
  let json: { text?: unknown; error?: unknown } | null = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (res.ok && typeof json?.text === 'string') return json.text;
  throw new TranscribeError(isCode(json?.error) ? json.error : 'failed');
}

async function withOneRetry(fn: () => Promise<string>, delayMs: number, signal: AbortSignal): Promise<string> {
  try {
    return await fn();
  } catch (e) {
    const transient = e instanceof TranscribeError && (e.code === 'busy' || e.code === 'network');
    if (!transient || signal.aborted) throw e;
    await new Promise((r) => setTimeout(r, delayMs));
    if (signal.aborted) throw new TranscribeError('aborted');
    return fn();
  }
}

export async function transcribeRecording(src: AudioSource, opt: TranscribeOptions): Promise<string> {
  const doFetch: typeof fetch = opt.fetchImpl ?? ((u, i) => fetch(u, i));
  opt.onProgress?.({ stage: 'preparing' });
  const pieces = await preparePieces(src, opt.decode);
  if (opt.signal?.aborted) throw new TranscribeError('aborted', opt.done ?? []);

  const total = pieces.length;
  const results: Array<string | undefined> = new Array(total).fill(undefined);
  (opt.done ?? []).slice(0, total).forEach((t, i) => { results[i] = t; });
  let finished = results.filter((r) => r !== undefined).length;
  opt.onProgress?.({ stage: 'sending', done: finished, total });

  const queue = results.flatMap((r, i) => (r === undefined ? [i] : []));
  const inner = new AbortController();
  const onAbort = () => inner.abort();
  opt.signal?.addEventListener('abort', onAbort);
  const state: { error: TranscribeError | null } = { error: null };

  const worker = async () => {
    while (queue.length && !state.error) {
      const i = queue.shift() as number;
      try {
        results[i] = await withOneRetry(() => sendPiece(pieces[i], opt.code, inner.signal, doFetch), opt.retryDelayMs ?? 1500, inner.signal);
        finished++;
        opt.onProgress?.({ stage: 'sending', done: finished, total });
      } catch (e) {
        if (!state.error) state.error = opt.signal?.aborted ? new TranscribeError('aborted') : e instanceof TranscribeError ? e : new TranscribeError('failed');
        inner.abort();
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(opt.concurrency ?? 3, Math.max(1, queue.length)) }, worker));
  } finally {
    opt.signal?.removeEventListener('abort', onAbort);
  }

  if (state.error) {
    const prefix: string[] = [];
    for (const r of results) { if (r === undefined) break; prefix.push(r); }
    throw new TranscribeError(state.error.code, prefix);
  }
  return joinPieces(results as string[]);
}
