// The server side of transcription: privacy routing is always sent, the tester code is enforced,
// and nothing about the content reaches the logs. Fictional data only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openRouterTranscribe, PRIVACY_ROUTING, transcriptionBody } from '@/lib/ai/openrouter';
import { DEFAULT_TRANSCRIBE_MODEL, MAX_PIECE_BYTES, TranscribeError } from '@/lib/ai/types';
import { POST } from '@/app/api/ai/transcribe/route';

const AUDIO = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
const FICTIONAL_TEXT = 'A fictional transcript about provision.';

function okFetch(text = FICTIONAL_TEXT) {
  return vi.fn(async () => new Response(JSON.stringify({ text, usage: { seconds: 1 } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

describe('transcriptionBody', () => {
  it('always demands zero retention and no training, temperature 0, base64 audio', () => {
    const body = transcriptionBody(AUDIO, 'wav', 'some/model');
    expect(body.provider).toEqual({ zdr: true, data_collection: 'deny' });
    expect(body.temperature).toBe(0);
    expect(body.model).toBe('some/model');
    expect(body.input_audio).toEqual({ data: Buffer.from(AUDIO).toString('base64'), format: 'wav' });
    expect(Object.isFrozen(PRIVACY_ROUTING)).toBe(true);
  });
});

describe('openRouterTranscribe', () => {
  const cfg = { apiKey: 'test-key-fictional', model: 'some/model', baseUrl: 'https://example.test/api/v1/' };

  it('posts JSON to /audio/transcriptions with the key and returns the text unchanged', async () => {
    const f = okFetch('  exactly as spoken, um, yes  ');
    const text = await openRouterTranscribe(AUDIO, 'm4a', { ...cfg, fetchImpl: f as unknown as typeof fetch });
    expect(text).toBe('  exactly as spoken, um, yes  ');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.test/api/v1/audio/transcriptions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key-fictional');
    expect(JSON.parse(String(init.body)).provider).toEqual({ zdr: true, data_collection: 'deny' });
  });

  it.each([
    [401, 'not_configured'], [402, 'out_of_credit'], [404, 'unavailable'], [429, 'busy'], [503, 'busy'], [400, 'unsupported'], [500, 'failed'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { code: status, message: 'x' } }), { status }));
    await expect(openRouterTranscribe(AUDIO, 'wav', { ...cfg, fetchImpl: f as unknown as typeof fetch })).rejects.toMatchObject({ code });
  });

  it('treats an error inside a 200 response as an error', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { code: 404 } }), { status: 200 }));
    await expect(openRouterTranscribe(AUDIO, 'wav', { ...cfg, fetchImpl: f as unknown as typeof fetch })).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('turns a network failure or timeout into "busy"', async () => {
    const f = vi.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(openRouterTranscribe(AUDIO, 'wav', { ...cfg, fetchImpl: f as unknown as typeof fetch })).rejects.toBeInstanceOf(TranscribeError);
  });
});

describe('POST /api/ai/transcribe', () => {
  const env = { ...process.env };
  let logs: string[];
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key-fictional';
    process.env.TESTER_CODE = 'fictional-code';
    process.env.OPENROUTER_BASE_URL = 'https://example.test/api/v1';
    delete process.env.TRANSCRIBE_MODEL;
    logs = [];
    for (const k of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
  });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  const req = (headers: Record<string, string>, body: BodyInit | null = AUDIO) =>
    new Request('http://localhost/api/ai/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...headers }, body });

  it('fails closed when the site is not configured', async () => {
    delete process.env.TESTER_CODE;
    const res = await POST(req({ 'X-Tester-Code': 'anything', 'X-Audio-Format': 'wav' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not_configured' });
  });

  it('rejects a missing or wrong tester code without calling OpenRouter', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    expect((await POST(req({ 'X-Audio-Format': 'wav' }))).status).toBe(401);
    expect((await POST(req({ 'X-Tester-Code': 'wrong', 'X-Audio-Format': 'wav' }))).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it('rejects unknown formats, empty bodies and pieces over the limit', async () => {
    vi.stubGlobal('fetch', okFetch());
    expect((await POST(req({ 'X-Tester-Code': 'fictional-code', 'X-Audio-Format': 'exe' }))).status).toBe(415);
    expect((await POST(req({ 'X-Tester-Code': 'fictional-code', 'X-Audio-Format': 'wav' }, new Uint8Array(0)))).status).toBe(415);
    expect((await POST(req({ 'X-Tester-Code': 'fictional-code', 'X-Audio-Format': 'wav' }, new Uint8Array(MAX_PIECE_BYTES + 1)))).status).toBe(413);
  });

  it('returns the text and sends privacy routing with the default model', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    const res = await POST(req({ 'X-Tester-Code': ' fictional-code ', 'X-Audio-Format': 'm4a' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ text: FICTIONAL_TEXT });
    const sent = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.model).toBe(DEFAULT_TRANSCRIBE_MODEL);
    expect(sent.provider).toEqual({ zdr: true, data_collection: 'deny' });
    expect(sent.input_audio.format).toBe('m4a');
  });

  it('passes the provider error code through and logs only the code and model', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 404, message: 'No endpoints found matching your data policy' } }), { status: 404 })));
    process.env.TRANSCRIBE_MODEL = 'other/model';
    const res = await POST(req({ 'X-Tester-Code': 'fictional-code', 'X-Audio-Format': 'wav' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'unavailable' });
    expect(logs).toEqual(['[transcribe] unavailable model=other/model']);
  });

  it('never logs anything on success', async () => {
    vi.stubGlobal('fetch', okFetch());
    await POST(req({ 'X-Tester-Code': 'fictional-code', 'X-Audio-Format': 'wav' }));
    expect(logs).toEqual([]);
  });
});
