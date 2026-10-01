// Seasonal signs ("NO PARKING ANYTIME MAY 15 - SEPT 30") read as 24/7 all year, and SCHOOL DAYS
// signs as every weekday. The fixtures cover real signs; these cover the edges.
import { describe, expect, it } from 'vitest';
import { formatWindow } from '../../components/map/format';
import { parseAspCalendar } from './asp';
import { nycInstant } from './nycTime';
import { toSign } from './sign';
import { parseSeason, seasonContains, seasonNextStart } from './timeCalculator';

const summer = parseSeason('05-15', '09-30')!;
const winter = parseSeason('11-01', '03-31')!;

describe('seasons', () => {
  it('parses the backend MM-DD bounds', () => {
    expect(summer).toEqual({ startMonth: 5, startDay: 15, endMonth: 9, endDay: 30 });
    expect(parseSeason('13-01', '01-01')).toBeUndefined();
    expect(parseSeason('05-15', null)).toBeUndefined();
  });

  it('contains whole New York days, over New Year too', () => {
    expect(seasonContains(summer, nycInstant(2026, 5, 14, 23, 59))).toBe(false);
    expect(seasonContains(summer, nycInstant(2026, 5, 15))).toBe(true);
    expect(seasonContains(summer, nycInstant(2026, 9, 30, 23, 59))).toBe(true);
    expect(seasonContains(summer, nycInstant(2026, 10, 1))).toBe(false);
    expect(seasonContains(winter, nycInstant(2027, 1, 5))).toBe(true);
    expect(seasonContains(winter, nycInstant(2026, 10, 31))).toBe(false);
  });

  it('finds the next season start', () => {
    expect(seasonNextStart(summer, nycInstant(2026, 10, 3, 12))).toBe(nycInstant(2027, 5, 15));
    expect(seasonNextStart(winter, nycInstant(2026, 4, 10))).toBe(nycInstant(2026, 11, 1));
    const inSeason = nycInstant(2026, 12, 1, 9);
    expect(seasonNextStart(winter, inSeason)).toBe(inSeason);
  });

  it('describes seasonal and school-day windows', () => {
    const sign = toSign({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-73.9851, 40.7589] },
      properties: {
        restriction_windows: [
          { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], start_time: '00:00:00', end_time: '23:59:00', season_start: '05-15', season_end: '09-30' },
          { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start_time: '07:00:00', end_time: '16:00:00', school_days: true },
        ],
      },
    });
    expect(sign.windows.map(formatWindow)).toEqual(['Anytime, May 15–Sep 30', 'Mon–Fri, 7 AM–4 PM, school days']);
  });
});

describe('311 calendar', () => {
  it('reads whether schools are open', () => {
    const calendar = parseAspCalendar({
      days: [
        { today_id: '20260928', items: [{ type: 'Alternate Side Parking', status: 'IN EFFECT' }, { type: 'Schools', status: 'CLOSED' }] },
        { today_id: '20260929', items: [{ type: 'Alternate Side Parking', status: 'IN EFFECT' }, { type: 'Schools', status: 'OPEN' }] },
        { today_id: '20261003', items: [{ type: 'Alternate Side Parking', status: 'NOT IN EFFECT' }, { type: 'Schools', status: 'NOT IN SESSION' }] },
        { today_id: '20261004', items: [{ type: 'Alternate Side Parking', status: 'NOT IN EFFECT' }] },
      ],
    });
    expect(['2026-09-28', '2026-09-29', '2026-10-03', '2026-10-04'].map((d) => calendar.get(d)?.schoolsOpen)).toEqual([
      false,
      true,
      false,
      undefined,
    ]);
  });
});
