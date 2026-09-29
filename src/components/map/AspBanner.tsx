import { formatDateKey, holidayName, suspendedThrough, type AspCalendar } from '../../lib/restrictions/asp';
import { nycDateKey } from '../../lib/restrictions/nycTime';

interface Props {
  calendar: AspCalendar;
  now: number;
}

/** Today's alternate side parking status, linking to the full calendar */
export function AspBanner({ calendar, now }: Props) {
  const key = nycDateKey(now);
  const today = calendar.get(key);
  if (!today) return null;

  let text: string;
  if (today.status === 'suspended') {
    const through = suspendedThrough(calendar, key);
    text = `ASP suspended today${today.exceptionName ? ` for ${holidayName(today.exceptionName)}` : ''}${
      through ? `, through ${formatDateKey(through)}` : ''
    }`;
  } else if (today.status === 'notInEffect') {
    text = 'No alternate side parking today';
  } else {
    text = 'Alternate side parking in effect today';
  }

  return (
    <a class={`asp-banner asp-${today.status}`} href="/asp/">
      <span class="asp-dot" aria-hidden="true" />
      {text}
    </a>
  );
}
