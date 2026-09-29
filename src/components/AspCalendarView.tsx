import { useEffect, useState } from 'preact/hooks';
import { loadAspCalendar } from '../lib/aspClient';
import { formatDateKey, holidayName, suspendedThrough, type AspCalendar, type AspDay } from '../lib/restrictions/asp';
import { dateKey, nycDateKey } from '../lib/restrictions/nycTime';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function headline(day: AspDay | undefined, calendar: AspCalendar, today: string): string {
  if (!day) return 'Today’s status isn’t available';
  if (day.status === 'suspended') {
    const through = suspendedThrough(calendar, today);
    return `Suspended today${through ? ` through ${formatDateKey(through)}` : ''}`;
  }
  return day.status === 'notInEffect' ? 'Not in effect today' : 'In effect today';
}

interface Props {
  /** The calendar as of the build, so the page's HTML already has today's status; refreshed on load */
  initialDays?: AspDay[];
}

export default function AspCalendarView({ initialDays }: Props) {
  const [calendar, setCalendar] = useState<AspCalendar | undefined>(() =>
    initialDays?.length ? new Map(initialDays.map((day) => [day.date, day])) : undefined,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadAspCalendar().then(setCalendar, () => setFailed(true));
  }, []);

  if (failed && !calendar) return <p class="asp-card">The calendar couldn’t be loaded. Try again in a minute.</p>;
  if (!calendar) return <p class="asp-card muted">Loading today’s status…</p>;

  const today = nycDateKey(Date.now());
  const day = calendar.get(today);
  const upcoming = [...calendar.values()].filter((d) => d.status === 'suspended' && d.date > today);
  const months = [...new Set([...calendar.keys()].map((key) => key.slice(0, 7)))].sort();

  return (
    <>
      <section class={`asp-card asp-card-${day?.status ?? 'unknown'}`} aria-live="polite">
        <p class="asp-card-date">{formatDateKey(today, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <p class="asp-card-status">{headline(day, calendar, today)}</p>
        {day?.exceptionName ? <p class="asp-card-reason">{holidayName(day.exceptionName)}</p> : null}
        {day?.details ? <p class="muted">{day.details}</p> : null}
      </section>

      <h2>Upcoming suspensions</h2>
      {upcoming.length ? (
        <ul class="asp-upcoming">
          {upcoming.map((d) => (
            <li key={d.date}>
              <span class="asp-upcoming-date">{formatDateKey(d.date)}</span>
              <span>{holidayName(d.exceptionName) ?? 'Suspended'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p class="muted">No suspensions in the rest of this month or next.</p>
      )}

      <div class="asp-months">
        {months.map((month) => (
          <MonthGrid key={month} month={month} calendar={calendar} today={today} />
        ))}
      </div>
    </>
  );
}

function MonthGrid({ month, calendar, today }: { month: string; calendar: AspCalendar; today: string }) {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const title = formatDateKey(`${month}-01`, { month: 'long', year: 'numeric' });

  return (
    <section class="asp-month" aria-label={title}>
      <h2>{title}</h2>
      <div class="asp-grid" role="grid">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} class="asp-grid-head" role="columnheader">
            {weekday}
          </span>
        ))}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const key = dateKey(year, monthNumber, i + 1);
          const day = calendar.get(key);
          const label = day?.status === 'suspended' ? holidayName(day.exceptionName) ?? 'Suspended' : undefined;
          return (
            <span
              key={key}
              role="gridcell"
              class={`asp-day asp-day-${day?.status ?? 'unknown'}${key === today ? ' asp-day-today' : ''}`}
              title={label}
              aria-label={`${formatDateKey(key)}: ${label ? `suspended for ${label}` : day?.status === 'notInEffect' ? 'not in effect' : 'in effect'}`}
            >
              {i + 1}
            </span>
          );
        })}
      </div>
    </section>
  );
}
