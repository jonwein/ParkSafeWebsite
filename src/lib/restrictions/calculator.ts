// Port of Extensions/RestrictionCalculator.swift: whether a sign restricts parking now, and for
// how long. Checked against the iOS app's own output in calculator.test.ts.

import type { AspCalendar } from './asp';
import { parseTime } from './days';
import { nycDateKey } from './nycTime';
import { activeWindow, isAlwaysRestricted, nextRestrictionStart, seasonContains, seasonNextStart, type Season } from './timeCalculator';

export type RestrictionStatus =
  /** Safe to park, with minutes until the next restriction (undefined when none is coming) */
  | { kind: 'safe'; minutes: number | undefined }
  /** Restricted now, with minutes until it ends */
  | { kind: 'restricted'; minutes: number }
  /** Restricted at all times */
  | { kind: 'neverAvailable' }
  | { kind: 'unknown' };

export type PinColor = 'red' | 'orange' | 'green' | 'gray';

export interface Window {
  days: string[] | null | undefined;
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  /** For a seasonal sign, the part of each year it applies */
  season?: Season;
  /** Applies only on days the public schools are open */
  schoolDays?: boolean;
}

export interface StatusOptions {
  /** Sign category; "StreetCleaning" is lifted on ASP-suspended days */
  category?: string | null;
  /** The 311 calendar: ASP suspensions and school closures */
  calendar?: AspCalendar;
}

/**
 * Status of one restriction window at `at`. Special conditions ("COMMERCIAL VEHICLES ONLY",
 * "PERMIT REQUIRED") don't change it: each names who else may park, so for a private car the
 * rule simply applies.
 */
export function windowStatus(window: Window, at: number, options: StatusOptions = {}): RestrictionStatus {
  const { days, startTime, endTime, season, schoolDays } = window;
  if (!days?.length || startTime == null || endTime == null) return { kind: 'unknown' };

  if (!parseTime(startTime) || !parseTime(endTime)) return { kind: 'unknown' };

  // 24/7, or 24/7 for part of the year
  if (isAlwaysRestricted(days, startTime, endTime)) {
    if (!season || seasonContains(season, at)) return { kind: 'neverAvailable' };
    return { kind: 'safe', minutes: Math.ceil((seasonNextStart(season, at) - at) / 60_000) };
  }

  // Windows that don't apply on the day they'd start: out of season, school-day signs on days
  // schools are closed, and street cleaning on ASP-suspended days
  const suspended = (start: number) => {
    if (season && !seasonContains(season, start)) return true;
    const day = options.calendar?.get(nycDateKey(start));
    if (schoolDays && day?.schoolsOpen === false) return true;
    return options.category === 'StreetCleaning' && day?.status === 'suspended';
  };

  const inForce = activeWindow(days, startTime, endTime, at, suspended);
  if (inForce) return { kind: 'restricted', minutes: Math.ceil((inForce.end - at) / 60_000) };

  // Next start, skipping the ones that don't apply
  let nextStart = nextRestrictionStart(days, startTime, at, season);
  while (nextStart !== undefined && suspended(nextStart)) {
    nextStart = nextRestrictionStart(days, startTime, nextStart, season);
  }
  return {
    kind: 'safe',
    minutes: nextStart === undefined ? undefined : Math.ceil((nextStart - at) / 60_000),
  };
}

/**
 * Status across every window of a sign. Restricted by any window means restricted, until the
 * last overlapping window ends; otherwise the soonest upcoming restriction wins.
 */
export function signStatus(windows: Window[], at: number, options: StatusOptions = {}): RestrictionStatus {
  const statuses = windows.map((window) => windowStatus(window, at, options));
  if (!statuses.length) return { kind: 'unknown' };
  if (statuses.some((s) => s.kind === 'neverAvailable')) return { kind: 'neverAvailable' };

  const restrictedEnds = statuses.flatMap((s) => (s.kind === 'restricted' ? [s.minutes] : []));
  if (restrictedEnds.length) return { kind: 'restricted', minutes: Math.max(...restrictedEnds) };

  const upcoming = statuses.flatMap((s) => (s.kind === 'safe' ? [s.minutes] : []));
  if (!upcoming.length) return { kind: 'unknown' };
  const known = upcoming.filter((m): m is number => m !== undefined);
  return { kind: 'safe', minutes: known.length ? Math.min(...known) : undefined };
}

/** Pin color and compact label for a status, as on the app's map pins */
export function durationInfo(status: RestrictionStatus): { color: PinColor; text: string | undefined } {
  switch (status.kind) {
    case 'neverAvailable':
      return { color: 'red', text: '24/7' };
    case 'restricted':
      return { color: 'red', text: formatDuration(status.minutes) };
    case 'safe':
      if (status.minutes === undefined) return { color: 'green', text: undefined };
      return {
        color: Math.trunc(status.minutes / 60) >= 24 ? 'green' : 'orange',
        text: formatDuration(status.minutes),
      };
    case 'unknown':
      return { color: 'gray', text: undefined };
  }
}

/** "30m", "2h", "2h 15m", "3d", "3d 4h" */
export function formatDuration(minutes: number): string {
  const hours = Math.trunc(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 1) return `${minutes}m`;
  if (hours < 24) return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
  const days = Math.trunc(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`;
}
