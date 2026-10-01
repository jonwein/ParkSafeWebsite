// Signs on the same pole share a map pin, like the app's SignCluster

import type { FeatureCollection, Point } from 'geojson';
import type { AspCalendar } from '../../lib/restrictions/asp';
import { durationInfo, signStatus, type PinColor, type RestrictionStatus } from '../../lib/restrictions/calculator';
import { matchesFilters, type Sign, type SignFilters } from '../../lib/restrictions/sign';

export interface PoleSign {
  sign: Sign;
  status: RestrictionStatus;
  color: PinColor;
  text: string | undefined;
}

export interface Pole {
  id: string;
  lng: number;
  lat: number;
  signs: PoleSign[];
  /**
   * Most urgent sign's color: restricted now (red) first, so a sign in force never hides
   * behind another sign's countdown, then upcoming (orange), then clear (green)
   */
  color: PinColor;
  /** That sign's duration label */
  label: string | undefined;
}

const URGENCY: PinColor[] = ['red', 'orange', 'green'];

export function buildPoles(signs: Iterable<Sign>, filters: SignFilters, at: number, calendar: AspCalendar): Pole[] {
  const groups = new Map<string, Sign[]>();
  for (const sign of signs) {
    if (!matchesFilters(sign, filters)) continue;
    // Signs on the same pole have identical coordinates
    const key = `${sign.latitude}_${sign.longitude}`;
    const group = groups.get(key);
    if (group) group.push(sign);
    else groups.set(key, [sign]);
  }

  return [...groups].map(([id, group]) => {
    const signs = group
      .sort((a, b) => compare(a.properties.sign_description ?? '', b.properties.sign_description ?? ''))
      .map((sign) => {
        const status = signStatus(sign.windows, at, {
          specialConditions: sign.properties.special_conditions,
          category: sign.category,
          calendar,
        });
        return { sign, status, ...durationInfo(status) };
      });
    const color = URGENCY.find((c) => signs.some((s) => s.color === c)) ?? 'gray';
    const urgent = signs.find((s) => s.color === color) ?? signs[0];
    return { id, lng: group[0].longitude, lat: group[0].latitude, signs, color, label: urgent.text };
  });
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function polesToGeoJSON(poles: Pole[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: poles.map((pole) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pole.lng, pole.lat] },
      properties: { id: pole.id, color: pole.color, label: pole.label ?? '', count: pole.signs.length },
    })),
  };
}
