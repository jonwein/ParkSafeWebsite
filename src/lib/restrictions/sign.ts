// Parking signs as the API returns them (GeoJSON), and the app's reading of them.
// Port of Models/GeoJSON.swift and Models/ParkingSignAnnotation.swift.

import type { Window } from './calculator';
import { dayAbbreviation, parseTime } from './days';

export interface SignProperties {
  order_number?: string | null;
  sign_code?: string | null;
  borough?: string | null;
  on_street?: string | null;
  from_street?: string | null;
  to_street?: string | null;
  side_of_street?: string | null;
  sign_description?: string | null;
  arrow_direction?: string | null;
  is_parking_relevant?: boolean | null;
  category?: string | null;
  restriction_type?: string | null;
  restriction_description?: string | null;
  restriction_days?: string[] | null;
  restriction_start_time?: string | null;
  restriction_end_time?: string | null;
  time_limit_minutes?: number | null;
  special_conditions?: string[] | null;
  restriction_windows?: { days?: string[] | null; start_time?: string | null; end_time?: string | null }[] | null;
}

export interface SignFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: number[] };
  properties: SignProperties;
}

export interface SignWindow extends Window {
  /** Half-hour slots of the day (0-47) this window covers */
  slots: Set<number>;
}

export interface Sign {
  id: string;
  latitude: number;
  longitude: number;
  properties: SignProperties;
  category: string | undefined;
  windows: SignWindow[];
  /** Days any window applies to, abbreviated */
  dayAbbreviations: Set<string>;
  /** Half-hour slots any window covers */
  slots: Set<number>;
}

export const SLOT_MINUTES = 30;
export const SLOT_COUNT = 48;

export const RESTRICTION_TYPES = [
  'NoParking',
  'NoStanding',
  'NoStopping',
  'StreetCleaning',
  'MeteredParking',
  'SpecialUse',
  'Other',
] as const;

const TYPE_LABELS: Record<string, string> = {
  NoParking: 'No Parking',
  NoStanding: 'No Standing',
  NoStopping: 'No Stopping',
  StreetCleaning: 'Street Cleaning',
  MeteredParking: 'Metered Parking',
  SpecialUse: 'Special Use',
  Other: 'Other',
};

export function formatType(type: string | null | undefined): string {
  if (!type) return 'Restriction';
  return TYPE_LABELS[type] ?? type;
}

function coordinate(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

/** DJB2 over the values, with a separator after each (UInt32 arithmetic, like the app's) */
function djb2(...values: (string | null | undefined)[]): number {
  const encoder = new TextEncoder();
  let hash = 5381;
  for (const value of values) {
    for (const byte of encoder.encode(value ?? '')) hash = (Math.imul(hash, 33) + byte) >>> 0;
    hash = Math.imul(hash, 33) >>> 0;
  }
  return hash;
}

/** The app's sign ID: order number, position and a hash of the parsed rule */
export function featureId(feature: SignFeature): string {
  const p = feature.properties;
  const [lng, lat] = feature.geometry.coordinates;
  const hash = djb2(
    p.sign_description,
    p.restriction_type,
    p.restriction_start_time,
    p.restriction_end_time,
    p.restriction_days?.join(','),
  );
  return `${p.order_number ?? 'unknown'}_${coordinate(lat).toFixed(6)}_${coordinate(lng).toFixed(6)}_${hash}`;
}

/** Half-hour slots a window covers. Overnight windows wrap; start == end is 24/7. */
export function windowSlots(startTime: string | null | undefined, endTime: string | null | undefined): Set<number> {
  const start = startTime == null ? undefined : parseTime(startTime);
  const end = endTime == null ? undefined : parseTime(endTime);
  if (!start || !end) return new Set();
  const from = (start.hour * 60 + start.minute) % 1440;
  const to = (end.hour * 60 + end.minute) % 1440;
  const slots = new Set<number>();
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const slotStart = slot * SLOT_MINUTES;
    const slotEnd = slotStart + SLOT_MINUTES;
    const overlaps =
      from === to ? true : from < to ? from < slotEnd && to > slotStart : from < slotEnd || to > slotStart;
    if (overlaps) slots.add(slot);
  }
  return slots;
}

export function toSign(feature: SignFeature): Sign {
  const p = feature.properties;
  const [lng, lat] = feature.geometry.coordinates;

  // Every window from the backend, or the single legacy window from older backends
  const parsed = (p.restriction_windows ?? []).map((w) => ({
    days: w.days ?? undefined,
    startTime: w.start_time ?? undefined,
    endTime: w.end_time ?? undefined,
  }));
  const windows = (
    parsed.length
      ? parsed
      : [{ days: p.restriction_days, startTime: p.restriction_start_time, endTime: p.restriction_end_time }]
  ).map((w) => ({ ...w, slots: windowSlots(w.startTime, w.endTime) }));

  const dayAbbreviations = new Set<string>();
  const slots = new Set<number>();
  for (const w of windows) {
    for (const day of w.days ?? []) {
      const abbreviation = dayAbbreviation(day);
      if (abbreviation) dayAbbreviations.add(abbreviation);
    }
    for (const slot of w.slots) slots.add(slot);
  }

  return {
    id: featureId(feature),
    latitude: coordinate(lat),
    longitude: coordinate(lng),
    properties: p,
    category: p.category ?? undefined,
    windows,
    dayAbbreviations,
    slots,
  };
}

export function isValidFeature(feature: SignFeature): boolean {
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

export type TimeFilterMode = 'restricted' | 'free';

export interface SignFilters {
  types: Set<string>;
  days: Set<string>;
  slots: Set<number>;
  slotMode: TimeFilterMode;
}

/** Port of ParkingSignAnnotation.matchesFilters. Empty sets don't filter. */
export function matchesFilters(sign: Sign, filters: SignFilters): boolean {
  if (filters.types.size && !(sign.category && filters.types.has(sign.category))) return false;

  if (filters.days.size) {
    if (!sign.dayAbbreviations.size) return false;
    if (![...filters.days].some((day) => sign.dayAbbreviations.has(day))) return false;
  }

  if (filters.slots.size) {
    // A sign with no parsed times is unknown, never "free"
    if (!sign.slots.size) return false;
    const overlaps = [...filters.slots].some((slot) => sign.slots.has(slot));
    // Restricted during any selected slot, or free across every one of them
    if (filters.slotMode === 'restricted' ? !overlaps : overlaps) return false;
  }
  return true;
}

/** "9:00 - 9:30 AM" */
export function slotLabel(slot: number): string {
  const start = slot * SLOT_MINUTES;
  return `${clock(start, false)} - ${clock((start + SLOT_MINUTES) % 1440, true)}`;
}

function clock(minutes: number, withPeriod: boolean): string {
  const hour24 = Math.floor(minutes / 60);
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const time = `${hour}:${String(minutes % 60).padStart(2, '0')}`;
  return withPeriod ? `${time} ${hour24 < 12 ? 'AM' : 'PM'}` : time;
}
