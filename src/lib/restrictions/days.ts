// Day-name and time-string parsing, matching DayOfWeek and RestrictionTimeCalculator.parseTime

export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const DAY_NAMES: { abbreviation: string; full: string; weekday: number }[] = [
  { abbreviation: 'Sun', full: 'Sunday', weekday: 1 },
  { abbreviation: 'Mon', full: 'Monday', weekday: 2 },
  { abbreviation: 'Tue', full: 'Tuesday', weekday: 3 },
  { abbreviation: 'Wed', full: 'Wednesday', weekday: 4 },
  { abbreviation: 'Thu', full: 'Thursday', weekday: 5 },
  { abbreviation: 'Fri', full: 'Friday', weekday: 6 },
  { abbreviation: 'Sat', full: 'Saturday', weekday: 7 },
];

/** "Mon" or "Monday", any case, surrounding spaces ignored */
function lookup(day: string) {
  const name = day.replace(/^[ \t]+|[ \t]+$/g, '').toLowerCase();
  return DAY_NAMES.find((d) => d.abbreviation.toLowerCase() === name || d.full.toLowerCase() === name);
}

/** Calendar weekday for a day name, Sunday = 1 … Saturday = 7 */
export function weekdayNumber(day: string): number | undefined {
  return lookup(day)?.weekday;
}

export function dayAbbreviation(day: string): string | undefined {
  return lookup(day)?.abbreviation;
}

export function abbreviationForWeekday(weekday: number): string {
  return DAY_NAMES.find((d) => d.weekday === weekday)?.abbreviation ?? '';
}

export function fullDayName(abbreviation: string): string {
  return lookup(abbreviation)?.full ?? abbreviation;
}

/** Swift's Int(String): an optional sign then digits, nothing else */
function parseInteger(text: string): number | undefined {
  return /^[+-]?\d+$/.test(text) ? Number(text) : undefined;
}

/** "HH:MM" or "HH:MM:SS" as hour and minute */
export function parseTime(time: string): { hour: number; minute: number } | undefined {
  // Swift's split(separator:) drops empty pieces
  const parts = time.split(':').filter((part) => part !== '');
  if (parts.length < 2) return undefined;
  const hour = parseInteger(parts[0]);
  const minute = parseInteger(parts[1]);
  if (hour === undefined || minute === undefined) return undefined;
  return { hour, minute };
}
