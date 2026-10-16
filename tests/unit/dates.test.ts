import { describe, expect, it } from 'vitest';
import { dateFromFilename, dateLabel, dayNumber, inferYear } from '../../lib/dates';

const NOW = new Date(2026, 8, 29, 12, 0, 0); // 29 Sep 2026, local time

describe('dateFromFilename', () => {
  it('reads iPhone Voice Memos names and says the year was inferred', () => {
    expect(dateFromFilename('29 Jul, 18.12_ Meeting -esv2-50p.mp3', NOW)).toEqual({ date: '2026-07-29', precision: 'exact', note: 'year inferred as 2026 from the file name' });
  });
  it('infers last year when the day has not happened yet this year', () => {
    expect(dateFromFilename('15 Dec, 09.30.m4a', NOW)?.date).toBe('2025-12-15');
  });
  it('reads ISO and compact dates', () => {
    expect(dateFromFilename('2024-09-27 prayer.m4a', NOW)).toEqual({ date: '2024-09-27', precision: 'exact', note: '' });
    expect(dateFromFilename('IMG_20230115_101010.jpg', NOW)?.date).toBe('2023-01-15');
  });
  it('reads written dates in both orders', () => {
    expect(dateFromFilename('27 September 2024.m4a', NOW)?.date).toBe('2024-09-27');
    expect(dateFromFilename('Sep 3, 2021 notes.png', NOW)?.date).toBe('2021-09-03');
  });
  it('rejects impossible dates and names without dates', () => {
    expect(dateFromFilename('2024-02-31.m4a', NOW)).toBeNull();
    expect(dateFromFilename('New Recording 12.m4a', NOW)).toBeNull();
  });
});

describe('labels and ordering', () => {
  it('labels by precision', () => {
    expect(dateLabel('2024-09-27', 'exact')).toBe('27 September 2024');
    expect(dateLabel('2024-09-27', 'exact', true)).toBe('27 Sep 2024');
    expect(dateLabel('2024-09-00', 'month')).toBe('September 2024');
    expect(dateLabel('2024-00-00', 'year')).toBe('2024');
  });
  it('places imprecise dates mid-period', () => {
    expect(dayNumber('2024-09-00')).toBe(dayNumber('2024-09-15'));
    expect(dayNumber('2024-00-00')).toBe(dayNumber('2024-07-01'));
  });
  it('inferYear keeps today in the current year', () => {
    expect(inferYear(9, 29, NOW)).toBe(2026);
    expect(inferYear(9, 30, NOW)).toBe(2025);
  });
});
