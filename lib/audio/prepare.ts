// Browser side: turn a stored recording into pieces the transcribe route accepts. Spec §7c.
import { formatOf, MAX_PIECE_BYTES, TranscribeError, type AudioFormat } from '@/lib/ai/types';
import { encodeWav, mixToMono, planPieces, resample, SAMPLE_RATE } from './pcm';

export interface Piece { body: Uint8Array | ArrayBuffer; format: AudioFormat }
export interface AudioSource { data: ArrayBuffer; type: string; name: string; size: number }
export type Decoder = (data: ArrayBuffer) => Promise<Float32Array>;

type OfflineCtor = new (channels: number, length: number, rate: number) => OfflineAudioContext;

/** Decode any format the browser can play into 16 kHz mono samples. */
export const decodeTo16kMono: Decoder = async (data) => {
  const g = globalThis as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  const Ctx = g.OfflineAudioContext || g.webkitOfflineAudioContext;
  if (!Ctx) throw new Error('no web audio');
  let ctx: OfflineAudioContext;
  let rate = SAMPLE_RATE;
  try { ctx = new Ctx(1, 1, SAMPLE_RATE); } catch { rate = 44_100; ctx = new Ctx(1, 1, rate); } // older browsers can't run at 16 kHz
  const buf = await ctx.decodeAudioData(data.slice(0)); // slice: decoding detaches the buffer, the stored copy must survive
  const channels = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
  return resample(mixToMono(channels), buf.sampleRate || rate, SAMPLE_RATE);
};

/**
 * Prefer decoding to 16 kHz WAV pieces (works for any length, every provider accepts WAV).
 * If the browser can't decode the file, send a small file as it is.
 */
export async function preparePieces(src: AudioSource, decode: Decoder = decodeTo16kMono): Promise<Piece[]> {
  const samples = await decode(src.data).catch(() => null);
  if (samples && samples.length > 0) {
    return planPieces(samples, SAMPLE_RATE).map(([a, b]) => ({ body: encodeWav(samples.subarray(a, b), SAMPLE_RATE), format: 'wav' as const }));
  }
  const format = formatOf(src.type, src.name);
  if (format && src.size <= MAX_PIECE_BYTES) return [{ body: src.data, format }];
  throw new TranscribeError('unsupported');
}
