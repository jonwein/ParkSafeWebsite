// A pole's pin once ranked "upcoming" above "restricted now": on live Midtown data at a weekday
// 8:30 AM, 513 of 1,907 multi-sign poles showed orange while one of their signs was in force.
import { describe, expect, it } from 'vitest';
import { nycInstant } from '../../lib/restrictions/nycTime';
import { toSign, type SignFeature } from '../../lib/restrictions/sign';
import { buildPoles } from './poles';

const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function sign(description: string, category: string, days: string[], start: string, end: string): SignFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-73.9851, 40.7589] },
    properties: {
      order_number: description,
      sign_description: description,
      category,
      is_parking_relevant: true,
      restriction_windows: [{ days, start_time: start, end_time: end }],
    },
  };
}

const noFilters = { types: new Set<string>(), days: new Set<string>(), slots: new Set<number>(), slotMode: 'restricted' as const };

describe('pole pin color', () => {
  const pole = [
    sign('NO STANDING 6PM-10:30AM ALL DAYS', 'NoStanding', allDays, '18:00:00', '10:30:00'),
    sign('2 HMP 10:30AM-6PM EXCEPT SUNDAY', 'MeteredParking', allDays.slice(0, 6), '10:30:00', '18:00:00'),
  ].map(toSign);

  it('shows red, with the sign in force, while one is restricted now', () => {
    const [built] = buildPoles(pole, noFilters, nycInstant(2026, 10, 6, 8, 30), new Map());
    expect(built.signs.map((s) => s.color).sort()).toEqual(['orange', 'red']);
    expect(built.color).toBe('red');
    expect(built.label).toBe('2h');  // until no-standing ends at 10:30, not the meter's countdown
  });

  it('shows orange when nothing is in force and something starts within a day', () => {
    const [built] = buildPoles([pole[1]], noFilters, nycInstant(2026, 10, 6, 8, 30), new Map());
    expect(built.color).toBe('orange');
  });
});
