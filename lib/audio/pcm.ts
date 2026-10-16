// Pure audio helpers (no browser APIs), so they can be unit-tested. Spec §7c.

export const SAMPLE_RATE = 16_000;

export interface SplitOptions {
  /** Ideal piece length; the cut is searched for between (target - search) and max. */
  targetS: number;
  maxS: number;
  searchS: number;
}

/** 115 s of 16 kHz mono 16-bit WAV is about 3.68 MB, safely under the 3.8 MB route limit. */
export const SPLIT: SplitOptions = { targetS: 100, maxS: 115, searchS: 20 };

/** Average several channels into one. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Downsample by averaging (a simple low-pass), good enough for speech. */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const n = Math.floor(input.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b && j < input.length; j++) s += input[j];
    out[i] = s / (b - a);
  }
  return out;
}

/**
 * Where to cut a long recording: [start, end) sample ranges, each at most maxS long,
 * cut at the quietest 50 ms between (target - search) and max seconds, so words aren't split.
 */
export function planPieces(samples: Float32Array, rate: number, opt: SplitOptions = SPLIT): Array<[number, number]> {
  const n = samples.length;
  const max = Math.floor(opt.maxS * rate);
  const frame = Math.max(1, Math.floor(rate * 0.05));
  const pieces: Array<[number, number]> = [];
  let start = 0;
  while (n - start > max) {
    const from = start + Math.floor((opt.targetS - opt.searchS) * rate);
    const to = start + max - frame;
    let best = to, bestEnergy = Infinity;
    for (let f = from; f <= to; f += frame) {
      let e = 0;
      for (let i = f; i < f + frame; i++) e += samples[i] * samples[i];
      if (e < bestEnergy) { bestEnergy = e; best = f; }
    }
    const cut = best + Math.floor(frame / 2);
    pieces.push([start, cut]);
    start = cut;
  }
  if (n > start) pieces.push([start, n]);
  return pieces;
}

/** 16-bit PCM mono WAV file bytes. */
export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

/** Join piece transcripts in order. Formatting only: no words are changed. */
export function joinPieces(texts: string[]): string {
  return texts.map((t) => t.trim()).filter(Boolean).join(' ');
}
