// POST one piece of audio (raw bytes, at most 3.8 MB), get back { text }. Spec §7c.
// Guarded by the tester code; fails closed when the site isn't configured.
// Never stores or logs audio, text or file names. Logs hold an error code and the model id only.
import { createHash, timingSafeEqual } from 'node:crypto';
import { openRouterTranscribe } from '@/lib/ai/openrouter';
import { DEFAULT_TRANSCRIBE_MODEL, isAudioFormat, MAX_PIECE_BYTES, TranscribeError, type TranscribeErrorCode } from '@/lib/ai/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // the region (London) is set in vercel.json

const STATUS: Record<TranscribeErrorCode, number> = {
  bad_code: 401, not_configured: 503, unavailable: 502, out_of_credit: 402, busy: 503,
  too_large: 413, unsupported: 415, network: 502, aborted: 499, failed: 502,
};

function fail(code: TranscribeErrorCode) {
  return Response.json({ error: code }, { status: STATUS[code], headers: { 'Cache-Control': 'no-store' } });
}

function sameCode(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const testerCode = process.env.TESTER_CODE?.trim();
  if (!apiKey || !testerCode) return fail('not_configured');

  if (!sameCode((req.headers.get('x-tester-code') || '').trim(), testerCode)) return fail('bad_code');

  const format = (req.headers.get('x-audio-format') || '').toLowerCase();
  if (!isAudioFormat(format)) return fail('unsupported');

  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_PIECE_BYTES) return fail('too_large');
  const audio = await req.arrayBuffer();
  if (audio.byteLength === 0) return fail('unsupported');
  if (audio.byteLength > MAX_PIECE_BYTES) return fail('too_large');

  const model = process.env.TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL;
  try {
    const text = await openRouterTranscribe(audio, format, {
      apiKey,
      model,
      baseUrl: process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
    });
    return Response.json({ text }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const code = e instanceof TranscribeError ? e.code : 'failed';
    console.warn(`[transcribe] ${code} model=${model}`);
    return fail(code);
  }
}
