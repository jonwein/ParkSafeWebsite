// Alternate Side Parking calendar from the NYC 311 API (through the backend's /asp-calendar
// proxy), keyed by New York date. Port of Models/ASPCalendar.swift.

import { dateKey, nycDateAfter } from './nycTime';

export type AspStatus = 'inEffect' | 'suspended' | 'notInEffect';

export interface AspDay {
  /** "YYYY-MM-DD" in New York */
  date: string;
  status: AspStatus;
  exceptionName?: string;
  details?: string;
}

export type AspCalendar = Map<string, AspDay>;

interface Nyc311Response {
  days?: { today_id: string; items?: { type: string; status: string; details?: string; exceptionName?: string }[] }[];
}

function statusFrom(raw: string): AspStatus {
  switch (raw.toUpperCase()) {
    case 'SUSPENDED':
      return 'suspended';
    case 'NOT IN EFFECT':
      return 'notInEffect';
    default:
      return 'inEffect';
  }
}

export function parseAspCalendar(response: Nyc311Response): AspCalendar {
  const calendar: AspCalendar = new Map();
  for (const day of response.days ?? []) {
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(day.today_id);
    const item = day.items?.find((i) => i.type === 'Alternate Side Parking');
    if (!match || !item) continue;
    const date = `${match[1]}-${match[2]}-${match[3]}`;
    calendar.set(date, {
      date,
      status: statusFrom(item.status),
      exceptionName: item.exceptionName || undefined,
      details: item.details || undefined,
    });
  }
  return calendar;
}

/** "2026-09-07" as "Mon, Sep 7" (or with other date options) */
export function formatDateKey(
  key: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' },
): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}

/** "Labor Day 2026" → "Labor Day"; "Day/Indigenous" → "Day / Indigenous" so long names wrap */
export function holidayName(exceptionName: string | undefined): string | undefined {
  return exceptionName?.replace(/\s+\d{4}$/, '').replace(/\s*\/\s*/g, ' / ');
}

/** The 311 API's MM/DD/YYYY */
export function aspRequestDate(year: number, month: number, day: number): string {
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
}

/** Last day of a run of suspensions that includes `date`, when it runs past that day */
export function suspendedThrough(calendar: AspCalendar, date: string): string | undefined {
  if (calendar.get(date)?.status !== 'suspended') return undefined;
  const [year, month, day] = date.split('-').map(Number);
  let last = date;
  for (let offset = 1; offset < 62; offset++) {
    const next = nycDateAfter(Date.UTC(year, month - 1, day, 16), offset);
    const key = dateKey(next.year, next.month, next.day);
    if (calendar.get(key)?.status !== 'suspended') break;
    last = key;
  }
  return last === date ? undefined : last;
}
