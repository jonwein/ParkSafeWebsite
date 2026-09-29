// Port of Shared/RestrictionTimeCalculator.swift: when restrictions start and end, in New York time

import { parseTime, weekdayNumber } from './days';
import { nycDateAfter, nycInstant, nycParts } from './nycTime';

/** The next restriction start after `after` for a days/start-time rule */
export function nextRestrictionStart(days: string[], startTime: string, after: number): number | undefined {
  if (!days.length) return undefined;
  const time = parseTime(startTime);
  if (!time) return undefined;
  const weekdays = days.map(weekdayNumber).filter((w): w is number => w !== undefined);
  if (!weekdays.length) return undefined;

  let soonest: number | undefined;
  for (let offset = 0; offset < 8; offset++) {
    const date = nycDateAfter(after, offset);
    if (!weekdays.includes(date.weekday)) continue;
    const start = nycInstant(date.year, date.month, date.day, time.hour, time.minute);
    if (start > after && (soonest === undefined || start < soonest)) soonest = start;
  }
  return soonest;
}

/** Next notification time: the next restriction start minus the lead time */
export function nextNotificationTime(
  days: string[],
  startTime: string,
  leadTimeMinutes: number,
  after: number,
): number | undefined {
  if (!days.length) return undefined;
  const time = parseTime(startTime);
  if (!time) return undefined;
  const weekdays = days.map(weekdayNumber).filter((w): w is number => w !== undefined);
  if (!weekdays.length) return undefined;

  let soonest: number | undefined;
  for (let offset = 0; offset < 8; offset++) {
    const date = nycDateAfter(after, offset);
    if (!weekdays.includes(date.weekday)) continue;
    const start = nycInstant(date.year, date.month, date.day, time.hour, time.minute);
    const notify = start - leadTimeMinutes * 60_000;
    if (notify > after && (soonest === undefined || notify < soonest)) soonest = notify;
  }
  return soonest;
}

/** When a restriction that started at `start` ends; an end at or before the start is the next day */
export function restrictionEndDate(start: number, endTime: string): number | undefined {
  const time = parseTime(endTime);
  if (!time) return undefined;
  const { year, month, day } = nycParts(start);
  const end = nycInstant(year, month, day, time.hour, time.minute);
  if (end > start) return end;
  const next = nycDateAfter(end, 1);
  const wall = nycParts(end);
  return nycInstant(next.year, next.month, next.day, wall.hour, wall.minute);
}

/** Every day (or a keyword like "daily") and a 24-hour window */
export function isAlwaysRestricted(
  days: string[] | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): boolean {
  if (!days?.length || startTime == null || endTime == null) return false;

  const hasAllDaysKeyword = days
    .map((day) => day.toLowerCase().replace(/^[ \t]+|[ \t]+$/g, ''))
    .some((day) =>
      ['daily', 'every', 'all day', 'anytime', 'at all times'].some((keyword) => day.includes(keyword)),
    );
  const uniqueWeekdays = new Set(days.map(weekdayNumber).filter((w) => w !== undefined));
  if (uniqueWeekdays.size < 7 && !hasAllDaysKeyword) return false;

  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (!start || !end) return false;
  const startTotal = start.hour * 60 + start.minute;
  const endTotal = end.hour * 60 + end.minute;
  return (
    startTotal === endTotal ||
    (startTotal === 0 && endTotal >= 1439) ||
    (start.hour === 0 && start.minute === 0 && end.hour === 24 && end.minute === 0)
  );
}
