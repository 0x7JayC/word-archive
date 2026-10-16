import { describe, expect, it } from 'vitest';
import { encodeWav, joinPieces, mixToMono, planPieces, resample, SAMPLE_RATE, SPLIT } from '@/lib/audio/pcm';
import { formatOf, MAX_PIECE_BYTES } from '@/lib/ai/types';

const RATE = 1000; // small rate keeps the tests fast; the planner is rate-independent

function tone(seconds: number, quietAt: number[] = []): Float32Array {
  const s = new Float32Array(seconds * RATE);
  for (let i = 0; i < s.length; i++) s[i] = 0.5 * Math.sin(i / 3);
  for (const q of quietAt) s.fill(0, Math.floor(q * RATE), Math.floor((q + 0.3) * RATE));
  return s;
}

describe('planPieces', () => {
  it('keeps a short recording in one piece', () => {
    expect(planPieces(tone(60), RATE)).toEqual([[0, 60 * RATE]]);
  });

  it('cuts long recordings at the quietest moment inside the search window', () => {
    const pieces = planPieces(tone(250, [95, 190]), RATE);
    expect(pieces.length).toBe(3);
    const cut1 = pieces[0][1] / RATE;
    expect(cut1).toBeGreaterThanOrEqual(95);
    expect(cut1).toBeLessThanOrEqual(95.3);
    expect(pieces[1][0]).toBe(pieces[0][1]); // no gaps, no overlaps
    expect(pieces[2][1]).toBe(250 * RATE);
  });

  it('never makes a piece longer than the maximum, even with no pause at all', () => {
    const pieces = planPieces(tone(600), RATE);
    for (const [a, b] of pieces) expect((b - a) / RATE).toBeLessThanOrEqual(SPLIT.maxS);
    expect(pieces.at(-1)![1]).toBe(600 * RATE);
  });

  it('a maximum-length piece at 16 kHz fits under the route limit as WAV', () => {
    expect(44 + SPLIT.maxS * SAMPLE_RATE * 2).toBeLessThan(MAX_PIECE_BYTES);
  });
});

describe('encodeWav', () => {
  it('writes a valid 16-bit mono header and clamps samples', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16000);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect(wav.length).toBe(44 + 8);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
    expect(v.getInt16(50, true)).toBe(32767); // 2 clamped to 1
  });
});

describe('mixToMono and resample', () => {
  it('averages channels', () => {
    expect(Array.from(mixToMono([new Float32Array([1, 0]), new Float32Array([0, 1])]))).toEqual([0.5, 0.5]);
  });
  it('downsamples 48 kHz to 16 kHz by averaging', () => {
    const out = resample(new Float32Array([3, 3, 3, 6, 6, 6]), 48000, 16000);
    expect(Array.from(out)).toEqual([3, 6]);
  });
});

describe('joinPieces', () => {
  it('joins in order with single spaces and changes no words', () => {
    expect(joinPieces([' The Lord will provide. ', '', 'In due time.'])).toBe('The Lord will provide. In due time.');
  });
});

describe('formatOf', () => {
  it('reads common types and file names', () => {
    expect(formatOf('audio/mp4', 'x')).toBe('m4a');
    expect(formatOf('audio/webm;codecs=opus', 'x')).toBe('webm');
    expect(formatOf('', '29 Jul, 18.12.m4a')).toBe('m4a');
    expect(formatOf('application/octet-stream', 'memo.caf')).toBeNull();
  });
});
