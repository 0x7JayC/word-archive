// The browser side: pieces are sent with the tester code, joined in order, retried once when busy,
// and a failure keeps the finished pieces so Retry continues. Fictional data only.
import { describe, expect, it, vi } from 'vitest';
import { transcribeRecording, type Progress } from '@/lib/ai/client';
import { preparePieces } from '@/lib/audio/prepare';
import { SAMPLE_RATE } from '@/lib/audio/pcm';
import { TranscribeError } from '@/lib/ai/types';

const small = { data: new Uint8Array([1, 2, 3]).buffer, type: 'audio/mp4', name: 'memo.m4a', size: 3 };
const cannotDecode = async () => { throw new Error('no web audio'); };
/** 250 s of fictional "speech" with pauses at 95 s and 190 s, so it splits into 3 pieces. */
const longDecode = async () => {
  const s = new Float32Array(250 * SAMPLE_RATE).fill(0.3);
  s.fill(0, 95 * SAMPLE_RATE, 95.3 * SAMPLE_RATE);
  s.fill(0, 190 * SAMPLE_RATE, 190.3 * SAMPLE_RATE);
  return s;
};

function server(handler: (n: number, init: RequestInit) => Response | Promise<Response>) {
  let n = 0;
  return vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => handler(n++, init!)) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('preparePieces', () => {
  it('sends a small file as it is when the browser cannot decode it', async () => {
    const pieces = await preparePieces(small, cannotDecode);
    expect(pieces).toEqual([{ body: small.data, format: 'm4a' }]);
  });
  it('refuses a large file it cannot decode, rather than sending something the server will reject', async () => {
    await expect(preparePieces({ ...small, size: 50_000_000 }, cannotDecode)).rejects.toMatchObject({ code: 'unsupported' });
  });
  it('turns decodable audio into WAV pieces under the limit', async () => {
    const pieces = await preparePieces({ ...small, size: 8_000_000 }, longDecode);
    expect(pieces.map((p) => p.format)).toEqual(['wav', 'wav', 'wav']);
    for (const p of pieces) expect((p.body as Uint8Array).byteLength).toBeLessThan(3_800_000);
  });
});

describe('transcribeRecording', () => {
  it('sends the code and format headers and returns the text', async () => {
    const f = server(() => json({ text: 'Fictional words.' }));
    const text = await transcribeRecording(small, { code: 'fictional-code', decode: cannotDecode, fetchImpl: f });
    expect(text).toBe('Fictional words.');
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Tester-Code']).toBe('fictional-code');
    expect((init.headers as Record<string, string>)['X-Audio-Format']).toBe('m4a');
  });

  it('joins pieces in their original order even when answers arrive out of order, and reports progress', async () => {
    const f = server(async (n) => { await new Promise((r) => setTimeout(r, n === 0 ? 30 : 1)); return json({ text: `part ${n + 1}` }); });
    const progress: Progress[] = [];
    const text = await transcribeRecording(small, { code: 'c', decode: longDecode, fetchImpl: f, onProgress: (p) => progress.push(p) });
    expect(text).toBe('part 1 part 2 part 3');
    expect(progress[0]).toEqual({ stage: 'preparing' });
    expect(progress.at(-1)).toEqual({ stage: 'sending', done: 3, total: 3 });
  });

  it('retries a busy answer once, automatically', async () => {
    const f = server((n) => (n === 0 ? json({ error: 'busy' }, 503) : json({ text: 'ok' })));
    expect(await transcribeRecording(small, { code: 'c', decode: cannotDecode, fetchImpl: f, retryDelayMs: 1 })).toBe('ok');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('reports a wrong code at once, without retrying', async () => {
    const f = server(() => json({ error: 'bad_code' }, 401));
    await expect(transcribeRecording(small, { code: 'x', decode: cannotDecode, fetchImpl: f, retryDelayMs: 1 })).rejects.toMatchObject({ code: 'bad_code' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('keeps finished pieces on failure and continues from there on retry', async () => {
    const failing = server((n) => (n === 0 ? json({ text: 'part 1' }) : json({ error: 'failed' }, 502)));
    let err: TranscribeError | null = null;
    try { await transcribeRecording(small, { code: 'c', decode: longDecode, fetchImpl: failing, concurrency: 1, retryDelayMs: 1 }); } catch (e) { err = e as TranscribeError; }
    expect(err?.code).toBe('failed');
    expect(err?.done).toEqual(['part 1']);

    const resumed = server((n) => json({ text: `part ${n + 2}` }));
    const text = await transcribeRecording(small, { code: 'c', decode: longDecode, fetchImpl: resumed, done: err!.done });
    expect(text).toBe('part 1 part 2 part 3');
    expect(resumed).toHaveBeenCalledTimes(2);
  });

  it('stops when the user taps Stop', async () => {
    const ctrl = new AbortController();
    const f = server((_n, init) => new Promise<Response>((_res, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))));
    const p = transcribeRecording(small, { code: 'c', decode: cannotDecode, fetchImpl: f, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 10);
    await expect(p).rejects.toMatchObject({ code: 'aborted' });
  });

  it('a lost connection becomes a "network" error after one retry', async () => {
    const f = server(() => { throw new TypeError('Failed to fetch'); });
    await expect(transcribeRecording(small, { code: 'c', decode: cannotDecode, fetchImpl: f, retryDelayMs: 1 })).rejects.toMatchObject({ code: 'network' });
    expect(f).toHaveBeenCalledTimes(2);
  });
});
