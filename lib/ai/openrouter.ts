// SERVER ONLY. Imported by app/api/ai/transcribe/route.ts; never import this from a component.
// Sends one piece of audio to OpenRouter's speech-to-text endpoint and returns the text exactly as the model gave it.
// Spec §7: every request demands zero data retention and no training, and fails rather than falling back.
import { TranscribeError, type AudioFormat, type TranscribeErrorCode } from './types';

export const PRIVACY_ROUTING = Object.freeze({ zdr: true, data_collection: 'deny' as const });

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  baseUrl: string; // e.g. https://openrouter.ai/api/v1 (or the EU host later)
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** The exact JSON body sent to OpenRouter. Exported so the privacy routing can be tested. */
export function transcriptionBody(audio: ArrayBuffer | Uint8Array, format: AudioFormat, model: string) {
  const bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
  return {
    model,
    input_audio: { data: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64'), format },
    temperature: 0,
    provider: { ...PRIVACY_ROUTING },
  };
}

function codeFor(status: number): TranscribeErrorCode {
  if (status === 401 || status === 403) return 'not_configured';
  if (status === 402) return 'out_of_credit';
  if (status === 404) return 'unavailable'; // includes "no endpoints match your data policy"
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) return 'busy';
  if (status === 413) return 'too_large';
  if (status === 400 || status === 415 || status === 422) return 'unsupported';
  return 'failed';
}

export async function openRouterTranscribe(audio: ArrayBuffer | Uint8Array, format: AudioFormat, cfg: OpenRouterConfig): Promise<string> {
  const doFetch = cfg.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 55_000);
  let res: Response;
  try {
    res = await doFetch(`${cfg.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(transcriptionBody(audio, format, cfg.model)),
      signal: ctrl.signal,
    });
  } catch {
    throw new TranscribeError('busy'); // timeout or connection reset: worth one retry
  } finally {
    clearTimeout(timer);
  }

  let json: { text?: unknown; error?: { code?: unknown } } | null = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new TranscribeError(codeFor(res.status));
  // OpenRouter can report a provider error inside a 200 response.
  if (json?.error) throw new TranscribeError(codeFor(Number(json.error.code) || 500));
  if (typeof json?.text !== 'string') throw new TranscribeError('failed');
  return json.text;
}
