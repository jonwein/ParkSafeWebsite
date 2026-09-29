// New York wall-clock time. NYC signs are in New York time whatever the device's time zone is,
// like Calendar.nyc in the iOS app. Instants are epoch milliseconds.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface NycParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** Calendar weekday, Sunday = 1 … Saturday = 7 (Foundation's numbering) */
  weekday: number;
}

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

// New York's UTC offset only changes on the hour (UTC), so one lookup per hour is enough
const offsetByHour = new Map<number, number>();

/** Milliseconds to add to an instant to get New York wall-clock time read as UTC */
export function nycOffset(instant: number): number {
  const hour = Math.floor(instant / HOUR);
  let offset = offsetByHour.get(hour);
  if (offset === undefined) {
    const probe = hour * HOUR;
    const parts: Record<string, number> = {};
    for (const { type, value } of formatter.formatToParts(probe)) parts[type] = Number(value);
    const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    offset = wall - probe;
    if (offsetByHour.size > 10_000) offsetByHour.clear();
    offsetByHour.set(hour, offset);
  }
  return offset;
}

export function nycParts(instant: number): NycParts {
  const wall = new Date(instant + nycOffset(instant));
  return {
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth() + 1,
    day: wall.getUTCDate(),
    hour: wall.getUTCHours(),
    minute: wall.getUTCMinutes(),
    weekday: wall.getUTCDay() + 1,
  };
}

/**
 * The instant New York's clock reads the given time, matching Foundation's Calendar.date(from:):
 * a time repeated when clocks fall back is its first occurrence, and a time skipped when they
 * spring forward moves forward by the gap (2:30 AM becomes 3:30 AM). Out-of-range fields roll
 * over (hour 24 is midnight the next day).
 */
export function nycInstant(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const before = nycOffset(wall - DAY);
  const after = nycOffset(wall + DAY);
  const matches = [before, after]
    .map((offset) => wall - offset)
    .filter((instant) => instant + nycOffset(instant) === wall);
  if (matches.length) return Math.min(...matches);
  // In the spring-forward gap: read the time with the offset from before the change
  return wall - before;
}

/** Midnight in New York at the start of the instant's New York day */
export function nycStartOfDay(instant: number): number {
  const { year, month, day } = nycParts(instant);
  return nycInstant(year, month, day);
}

/** The New York calendar date `days` after the instant's, as year/month/day and weekday */
export function nycDateAfter(instant: number, days: number) {
  const { year, month, day } = nycParts(instant);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay() + 1,
  };
}

/** "YYYY-MM-DD" of the instant's New York date */
export function nycDateKey(instant: number): string {
  const { year, month, day } = nycParts(instant);
  return dateKey(year, month, day);
}

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
