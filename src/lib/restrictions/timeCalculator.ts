// Port of Shared/RestrictionTimeCalculator.swift: when restrictions start and end, in New York time

import { parseTime, weekdayNumber } from './days';
import { nycDateAfter, nycInstant, nycParts } from './nycTime';

/**
 * The part of each year a seasonal sign applies ("NO PARKING ANYTIME MAY 15 - SEPT 30"), from the
 * backend's "MM-DD" season_start/season_end. A season can run over New Year. Port of Season.
 */
export interface Season {
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
}

export function parseSeason(start: string | null | undefined, end: string | null | undefined): Season | undefined {
  const parse = (text: string | null | undefined) => {
    const parts = (text ?? '').split('-').filter(Boolean).map(Number);
    if (parts.length !== 2 || !parts.every(Number.isInteger)) return undefined;
    const [month, day] = parts;
    return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { month, day } : undefined;
  };
  const from = parse(start);
  const to = parse(end);
  if (!from || !to) return undefined;
  return { startMonth: from.month, startDay: from.day, endMonth: to.month, endDay: to.day };
}

/** Whether the instant's New York day falls in the season */
export function seasonContains(season: Season, instant: number): boolean {
  const { month, day } = nycParts(instant);
  const date = month * 100 + day;
  const start = season.startMonth * 100 + season.startDay;
  const end = season.endMonth * 100 + season.endDay;
  return start <= end ? date >= start && date <= end : date >= start || date <= end;
}

/** `instant` if it's in season, otherwise the start (midnight, New York) of the next season */
export function seasonNextStart(season: Season, instant: number): number {
  if (seasonContains(season, instant)) return instant;
  const { year } = nycParts(instant);
  const thisYear = nycInstant(year, season.startMonth, season.startDay);
  return thisYear > instant ? thisYear : nycInstant(year + 1, season.startMonth, season.startDay);
}

/** The next restriction start after `after` for a days/start-time rule, in season if it has one */
export function nextRestrictionStart(
  days: string[],
  startTime: string,
  after: number,
  season?: Season,
): number | undefined {
  if (!season) return nextStartIgnoringSeason(days, startTime, after);
  // Search from the season's start when out of season, and again past a season's end
  let from = after;
  for (let attempt = 0; attempt < 3; attempt++) {
    const seasonStart = seasonNextStart(season, from);
    const searchFrom = seasonStart > from ? seasonStart - 1000 : from;
    const start = nextStartIgnoringSeason(days, startTime, searchFrom);
    if (start === undefined) return undefined;
    if (seasonContains(season, start)) return start;
    from = start;
  }
  return undefined;
}

function nextStartIgnoringSeason(days: string[], startTime: string, after: number): number | undefined {
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
  // The first start whose notification is still ahead
  const lead = leadTimeMinutes * 60_000;
  const start = nextRestrictionStart(days, startTime, after + lead);
  return start === undefined ? undefined : start - lead;
}

/**
 * The window of a days/start/end rule in force at `now`, if any. A window starts on one of
 * `days` and lasts at most 24 hours, running past midnight when it ends before it starts
 * ("Mon 10PM-6AM" is Monday night into Tuesday morning), so only yesterday's and today's
 * windows can contain `now`. `isSuspended` says whether the window starting at an instant
 * doesn't apply (street cleaning on an ASP-suspended day).
 */
export function activeWindow(
  days: string[],
  startTime: string,
  endTime: string,
  now: number,
  isSuspended: (start: number) => boolean = () => false,
): { start: number; end: number } | undefined {
  const time = parseTime(startTime);
  if (!time) return undefined;
  const weekdays = new Set(days.map(weekdayNumber).filter((w) => w !== undefined));

  for (const offset of [-1, 0]) {
    const date = nycDateAfter(now, offset);
    if (!weekdays.has(date.weekday)) continue;
    const start = nycInstant(date.year, date.month, date.day, time.hour, time.minute);
    if (start > now) continue;
    const end = restrictionEndDate(start, endTime);
    if (end === undefined || end <= now || isSuspended(start)) continue;
    return { start, end };
  }
  return undefined;
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
