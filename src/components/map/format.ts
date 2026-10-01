// Wording for signs and statuses in the details panel

import { formatDuration, type RestrictionStatus } from '../../lib/restrictions/calculator';
import { DAYS_OF_WEEK, dayAbbreviation, parseTime } from '../../lib/restrictions/days';
import type { SignProperties, SignWindow } from '../../lib/restrictions/sign';
import { isAlwaysRestricted, type Season } from '../../lib/restrictions/timeCalculator';

/** "WEST   46 STREET" → "West 46 Street" */
export function formatStreet(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase());
}

const SIDES: Record<string, string> = { N: 'north', S: 'south', E: 'east', W: 'west' };

/** "7 Avenue, west side, between West 46 Street and West 45 Street" */
export function formatLocation(p: SignProperties): string {
  const parts = [formatStreet(p.on_street)];
  const side = p.side_of_street ? SIDES[p.side_of_street.toUpperCase()] : undefined;
  if (side) parts.push(`${side} side`);
  if (p.from_street && p.to_street) {
    parts.push(`between ${formatStreet(p.from_street)} and ${formatStreet(p.to_street)}`);
  }
  return parts.filter(Boolean).join(', ');
}

/** "9:30 AM", "7 AM", "noon", "midnight" */
export function formatClock(time: string | null | undefined): string | undefined {
  const parsed = time == null ? undefined : parseTime(time);
  if (!parsed) return undefined;
  const minutes = (parsed.hour * 60 + parsed.minute) % 1440;
  if (minutes === 0) return 'midnight';
  if (minutes === 720) return 'noon';
  const hour24 = Math.floor(minutes / 60);
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minute = minutes % 60;
  return `${hour}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour24 < 12 ? 'AM' : 'PM'}`;
}

/** "Every day", "Mon–Fri", "Mon, Thu" */
export function formatDays(days: string[] | null | undefined): string | undefined {
  const set = new Set((days ?? []).map(dayAbbreviation).filter(Boolean));
  if (!set.size) return undefined;
  const ordered = DAYS_OF_WEEK.filter((d) => set.has(d));
  if (ordered.length === 7) return 'Every day';
  const indexes = ordered.map((d) => DAYS_OF_WEEK.indexOf(d));
  const consecutive = indexes.every((index, i) => i === 0 || index === indexes[i - 1] + 1);
  if (consecutive && ordered.length >= 3) return `${ordered[0]}–${ordered[ordered.length - 1]}`;
  return ordered.join(', ');
}

/** "Mon–Fri, 7 AM–10 AM", "Anytime, May 15–Sep 30" or "Mon–Fri, 7 AM–4 PM, school days" */
export function formatWindow(window: SignWindow): string {
  return [formatHours(window), window.season && formatSeason(window.season), window.schoolDays && 'school days']
    .filter(Boolean)
    .join(', ');
}

function formatHours(window: SignWindow): string {
  if (isAlwaysRestricted(window.days, window.startTime, window.endTime)) return 'Anytime';
  const days = formatDays(window.days);
  const start = formatClock(window.startTime);
  const end = formatClock(window.endTime);
  const hours = start && end ? `${start}–${end}` : start ? `from ${start}` : undefined;
  if (days && hours) return `${days}, ${hours}`;
  return days ?? hours ?? 'Hours not listed';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "May 15–Sep 30" */
export function formatSeason(season: Season): string {
  return `${MONTHS[season.startMonth - 1]} ${season.startDay}–${MONTHS[season.endMonth - 1]} ${season.endDay}`;
}

/** One line for the status chip */
export function formatStatus(status: RestrictionStatus): string {
  switch (status.kind) {
    case 'neverAvailable':
      return 'Restricted at all times';
    case 'restricted':
      return `Restricted now, for ${formatDuration(status.minutes)}`;
    case 'safe':
      if (status.minutes === undefined) return 'No upcoming restriction';
      return status.minutes < 24 * 60
        ? `Restriction starts in ${formatDuration(status.minutes)}`
        : `Clear for ${formatDuration(status.minutes)}`;
    case 'unknown':
      return 'Read the sign';
  }
}
