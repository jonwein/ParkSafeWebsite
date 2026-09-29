import { DAYS_OF_WEEK } from '../../lib/restrictions/days';
import { formatType, RESTRICTION_TYPES, SLOT_COUNT } from '../../lib/restrictions/sign';
import { formatClock } from './format';
import { EMPTY_FILTERS, slotClock, type FilterState } from './filterState';

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onClose: () => void;
}

const DEFAULT_RANGE = { from: 16, to: 20 }; // 8 AM - 10 AM

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function slotOption(slot: number) {
  const clock = slotClock(slot);
  return (
    <option key={slot} value={slot}>
      {formatClock(clock)}
    </option>
  );
}

export function FilterPanel({ filters, onChange, onClose }: Props) {
  const time = filters.time;
  return (
    <section class="filters" aria-labelledby="filters-title">
      <header class="panel-head">
        <h2 id="filters-title">Filter signs</h2>
        <button type="button" class="icon-button" onClick={onClose} aria-label="Close filters">
          ×
        </button>
      </header>

      <fieldset>
        <legend>Type</legend>
        <div class="chips">
          {RESTRICTION_TYPES.map((type) => (
            <button
              type="button"
              key={type}
              class="chip"
              aria-pressed={filters.types.includes(type)}
              onClick={() => onChange({ ...filters, types: toggle(filters.types, type) })}
            >
              {formatType(type)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Applies on</legend>
        <div class="chips">
          {DAYS_OF_WEEK.map((day) => (
            <button
              type="button"
              key={day}
              class="chip"
              aria-pressed={filters.days.includes(day)}
              onClick={() => onChange({ ...filters, days: toggle(filters.days, day) })}
            >
              {day}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Time of day</legend>
        <div class="segmented" role="group" aria-label="Time filter mode">
          <button
            type="button"
            aria-pressed={!time}
            onClick={() => onChange({ ...filters, time: undefined })}
          >
            Any time
          </button>
          <button
            type="button"
            aria-pressed={Boolean(time) && filters.mode === 'restricted'}
            onClick={() => onChange({ ...filters, time: time ?? DEFAULT_RANGE, mode: 'restricted' })}
          >
            Restricted during
          </button>
          <button
            type="button"
            aria-pressed={Boolean(time) && filters.mode === 'free'}
            onClick={() => onChange({ ...filters, time: time ?? DEFAULT_RANGE, mode: 'free' })}
          >
            Free during
          </button>
        </div>
        {time ? (
          <div class="time-range">
            <label>
              From
              <select
                value={time.from}
                onChange={(e) => {
                  const from = Number(e.currentTarget.value);
                  onChange({ ...filters, time: { from, to: from === time.to ? (from + 1) % SLOT_COUNT : time.to } });
                }}
              >
                {Array.from({ length: SLOT_COUNT }, (_, slot) => slotOption(slot))}
              </select>
            </label>
            <label>
              To
              <select
                value={time.to}
                onChange={(e) => {
                  const to = Number(e.currentTarget.value);
                  if (to !== time.from) onChange({ ...filters, time: { from: time.from, to } });
                }}
              >
                {Array.from({ length: SLOT_COUNT }, (_, slot) => slotOption(slot))}
              </select>
            </label>
          </div>
        ) : null}
      </fieldset>

      <button type="button" class="text-button" onClick={() => onChange(EMPTY_FILTERS)}>
        Clear filters
      </button>
    </section>
  );
}
