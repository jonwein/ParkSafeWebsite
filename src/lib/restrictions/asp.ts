// Alternate Side Parking calendar from the NYC 311 API (through the backend's /asp-calendar
// proxy), keyed by New York date. Port of Models/ASPCalendar.swift.

import { dateKey, nycDateAfter } from './nycTime';

/**
 * `noInformation`: 311 hasn't published the day yet ("NO INFORMATION": in November, all of next
 * January). Not a suspension, but not known to be in effect either.
 */
export type AspStatus = 'inEffect' | 'suspended' | 'notInEffect' | 'noInformation';

export interface AspDay {
  /** "YYYY-MM-DD" in New York */
  date: string;
  status: AspStatus;
  exceptionName?: string;
  details?: string;
  /**
   * Whether the public schools are in session (in person or remote), from the same 311 calendar;
   * undefined when it doesn't say. SCHOOL DAYS signs don't apply on days they're closed or not in
   * session.
   */
  schoolsOpen?: boolean;
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
    case 'NO INFORMATION':
      return 'noInformation';
    default:
      return 'inEffect';
  }
}

/** The Schools statuses on which SCHOOL DAYS signs don't apply */
const SCHOOLS_OUT = new Set(['CLOSED', 'NOT IN SESSION']);

export function parseAspCalendar(response: Nyc311Response): AspCalendar {
  const calendar: AspCalendar = new Map();
  for (const day of response.days ?? []) {
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(day.today_id);
    const item = day.items?.find((i) => i.type === 'Alternate Side Parking');
    if (!match || !item) continue;
    const date = `${match[1]}-${match[2]}-${match[3]}`;
    const schools = day.items?.find((i) => i.type === 'Schools');
    const status = statusFrom(item.status);
    calendar.set(date, {
      date,
      status,
      // An unpublished day's is "Information Not Available", which its status says
      exceptionName: (status !== 'noInformation' && item.exceptionName) || undefined,
      details: item.details || undefined,
      // Out only when "CLOSED" (a holiday) or "NOT IN SESSION" (weekends and breaks). "OPEN" and
      // "REMOTE ONLY" (Election Day 2026) are school days, and so is a status 311 adds later: the
      // signs apply unless the schools are known to be out.
      schoolsOpen: schools ? !SCHOOLS_OUT.has(schools.status.toUpperCase()) : undefined,
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
