import type { DatePrecision } from './types';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON3 = MONTHS.map((m) => m.slice(0, 3).toLowerCase());

export interface DateGuess { date: string; precision: DatePrecision; note: string }

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function valid(y: number, m: number, d: number) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return y > 1900 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function todayIso(now = new Date()) {
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Most recent year in which day/month is not in the future. */
export function inferYear(m: number, d: number, now = new Date()) {
  const y = now.getFullYear();
  return iso(y, m, d) <= todayIso(now) ? y : y - 1;
}

/**
 * Reads a date from a filename. Understands ISO dates, 20240927, "27 Sep 2024",
 * "Sep 27, 2024" and iPhone Voice Memos names like "29 Jul, 18.12" (no year: inferred, and said so).
 */
export function dateFromFilename(name: string, now = new Date()): DateGuess | null {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '');
  let m = base.match(/(?<!\d)(\d{4})[-_.](\d{2})[-_.](\d{2})(?!\d)/);
  if (m && valid(+m[1], +m[2], +m[3])) return { date: iso(+m[1], +m[2], +m[3]), precision: 'exact', note: '' };
  m = base.match(/(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/);
  if (m && valid(+m[1], +m[2], +m[3])) return { date: iso(+m[1], +m[2], +m[3]), precision: 'exact', note: '' };

  const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
  m = base.match(new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+${mon},?(?:\\s+(\\d{4}))?`, 'i'));
  if (m) {
    const d = +m[1], mo = MON3.indexOf(m[2].toLowerCase()) + 1;
    if (m[3]) { if (valid(+m[3], mo, d)) return { date: iso(+m[3], mo, d), precision: 'exact', note: '' }; }
    else {
      const y = inferYear(mo, d, now);
      if (valid(y, mo, d)) return { date: iso(y, mo, d), precision: 'exact', note: `year inferred as ${y} from the file name` };
    }
  }
  m = base.match(new RegExp(`${mon}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'i'));
  if (m) {
    const mo = MON3.indexOf(m[1].toLowerCase()) + 1, d = +m[2], y = +m[3];
    if (valid(y, mo, d)) return { date: iso(y, mo, d), precision: 'exact', note: '' };
  }
  return null;
}

export function dateParts(date: string): [number, number, number] {
  const p = (date || '').split('-').map((x) => parseInt(x, 10));
  return [p[0] || 0, p[1] || 0, p[2] || 0];
}

/** "27 September 2024", "September 2024" or "2024" depending on precision. */
export function dateLabel(date: string, precision: DatePrecision, short = false): string {
  const [y, m, d] = dateParts(date);
  const mon = m ? (short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1]) : '';
  if (!y) return 'Undated';
  if (precision === 'year' || !m) return String(y);
  if (precision === 'month' || !d) return `${mon} ${y}`;
  return `${d} ${mon} ${y}`;
}

/** Days since 1970-01-01, placing imprecise dates mid-period (same rule as the original roadmap). */
export function dayNumber(date: string): number {
  const [y, m, d] = dateParts(date);
  const mm = m || 7, dd = d || (m ? 15 : 1);
  const ok = valid(y, mm, dd);
  return Math.round((ok ? Date.UTC(y, mm - 1, dd) : Date.UTC(Math.max(y, 1970), 0, 1)) / 864e5);
}
