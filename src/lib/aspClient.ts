// Loads the ASP calendar through /asp-calendar (CloudFront forwards it to the backend's proxy
// of NYC 311, which allows up to 62 days per request)

import { aspRequestDate, parseAspCalendar, type AspCalendar } from './restrictions/asp';
import { nycParts } from './restrictions/nycTime';

/** This month and the next, starting from the first of this month in New York */
export async function loadAspCalendar(now = Date.now()): Promise<AspCalendar> {
  const { year, month } = nycParts(now);
  const lastOfNextMonth = new Date(Date.UTC(year, month + 1, 0));
  const url =
    `/asp-calendar?fromdate=${aspRequestDate(year, month, 1)}` +
    `&todate=${aspRequestDate(lastOfNextMonth.getUTCFullYear(), lastOfNextMonth.getUTCMonth() + 1, lastOfNextMonth.getUTCDate())}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ASP calendar: HTTP ${response.status}`);
  return parseAspCalendar(await response.json());
}

