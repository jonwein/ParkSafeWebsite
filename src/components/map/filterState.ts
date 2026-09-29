// Map filters, kept in the URL query so a filtered view can be shared or bookmarked:
// ?types=StreetCleaning&days=Mon,Thu&from=08:00&to=10:00&mode=free

import { DAYS_OF_WEEK } from '../../lib/restrictions/days';
import { RESTRICTION_TYPES, SLOT_COUNT, SLOT_MINUTES, type SignFilters } from '../../lib/restrictions/sign';

export interface TimeRange {
  /** Half-hour slot the range starts in (0-47) */
  from: number;
  /** Slot after the last one covered; less than `from` wraps past midnight */
  to: number;
}

export interface FilterState {
  types: string[];
  days: string[];
  time: TimeRange | undefined;
  mode: 'restricted' | 'free';
}

export const EMPTY_FILTERS: FilterState = { types: [], days: [], time: undefined, mode: 'restricted' };

function slotFromClock(value: string | null): number | undefined {
  const match = value ? /^(\d{1,2}):(\d{2})$/.exec(value) : null;
  if (!match) return undefined;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes % SLOT_MINUTES === 0 && minutes <= 1440 ? minutes / SLOT_MINUTES : undefined;
}

export function slotClock(slot: number): string {
  const minutes = slot * SLOT_MINUTES;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function readFilters(search: string): FilterState {
  const params = new URLSearchParams(search);
  const list = (name: string, allowed: readonly string[]) =>
    (params.get(name) ?? '').split(',').filter((value) => allowed.includes(value));
  const from = slotFromClock(params.get('from'));
  const to = slotFromClock(params.get('to'));
  return {
    types: list('types', RESTRICTION_TYPES),
    days: list('days', DAYS_OF_WEEK),
    time: from !== undefined && to !== undefined && from !== to ? { from, to: to % SLOT_COUNT } : undefined,
    mode: params.get('mode') === 'free' ? 'free' : 'restricted',
  };
}

export function writeFilters(filters: FilterState, search: string): string {
  const params = new URLSearchParams(search);
  for (const name of ['types', 'days', 'from', 'to', 'mode']) params.delete(name);
  if (filters.types.length) params.set('types', filters.types.join(','));
  if (filters.days.length) params.set('days', filters.days.join(','));
  if (filters.time) {
    params.set('from', slotClock(filters.time.from));
    params.set('to', slotClock(filters.time.to));
    if (filters.mode === 'free') params.set('mode', 'free');
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function rangeSlots(range: TimeRange | undefined): Set<number> {
  const slots = new Set<number>();
  if (!range) return slots;
  for (let slot = range.from; slot !== range.to; slot = (slot + 1) % SLOT_COUNT) slots.add(slot);
  return slots;
}

export function toSignFilters(state: FilterState): SignFilters {
  return {
    types: new Set(state.types),
    days: new Set(state.days),
    slots: rangeSlots(state.time),
    slotMode: state.mode,
  };
}

export function activeFilterCount(state: FilterState): number {
  return (state.types.length ? 1 : 0) + (state.days.length ? 1 : 0) + (state.time ? 1 : 0);
}
