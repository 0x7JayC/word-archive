// Shared by the browser (lib/ai/client.ts) and the server route (app/api/ai/transcribe). No secrets here.

/** Largest request body the transcribe route accepts. Vercel's hard limit is 4.5 MB per request. */
export const MAX_PIECE_BYTES = 3_800_000;

/** Formats the route forwards. Everything else is converted to WAV in the browser first. */
export const AUDIO_FORMATS = ['wav', 'mp3', 'm4a', 'webm', 'ogg', 'aac', 'flac'] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

export const DEFAULT_TRANSCRIBE_MODEL = 'mistralai/voxtral-mini-transcribe';

/** Bump when the wording of the transcription consent changes, so people are asked again. */
export const TRANSCRIBE_CONSENT_VERSION = 'transcribe-2026-10-08';

export type TranscribeErrorCode =
  | 'bad_code' // tester code missing or wrong
  | 'not_configured' // the site has no key / tester code set up
  | 'unavailable' // no private (zero-retention, no-training) route to the model, or the model is gone
  | 'out_of_credit' // the OpenRouter key's credit limit was reached
  | 'busy' // rate limit, timeout or a temporary provider error
  | 'too_large' // a piece over MAX_PIECE_BYTES
  | 'unsupported' // a format the browser can't decode and the route can't forward
  | 'network' // the browser couldn't reach the site
  | 'aborted' // the user tapped Stop
  | 'failed'; // anything else

/** Errors carry a code only, never content, so they are safe to show and to log. */
export class TranscribeError extends Error {
  constructor(public readonly code: TranscribeErrorCode, public readonly done: string[] = []) {
    super(code);
    this.name = 'TranscribeError';
  }
}

export function isAudioFormat(v: unknown): v is AudioFormat {
  return typeof v === 'string' && (AUDIO_FORMATS as readonly string[]).includes(v);
}

/** The format OpenRouter expects, from a MIME type or file name. null if unknown (then the browser converts to WAV). */
export function formatOf(type: string, name: string): AudioFormat | null {
  const t = (type || '').toLowerCase().split(';')[0].trim();
  const byType: Record<string, AudioFormat> = {
    'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
    'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
    'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/aac': 'aac', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
  };
  if (byType[t]) return byType[t];
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const byExt: Record<string, AudioFormat> = { wav: 'wav', mp3: 'mp3', m4a: 'm4a', mp4: 'm4a', webm: 'webm', ogg: 'ogg', oga: 'ogg', aac: 'aac', flac: 'flac' };
  return byExt[ext] ?? null;
}
