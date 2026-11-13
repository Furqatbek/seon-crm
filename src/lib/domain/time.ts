// The centre runs on Tashkent time: UTC+5 all year, no daylight saving.

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The calendar day in Tashkent as "YYYY-MM-DD". */
export function tashkentDate(instant: Date | string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return new Date(date.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Start of a Tashkent calendar day, `days` from the day of `now`, as an ISO instant. */
export function tashkentDayStart(now: Date, days = 0): string {
  const day = new Date(`${tashkentDate(now)}T00:00:00+05:00`);
  return new Date(day.getTime() + days * DAY_MS).toISOString();
}

/**
 * The Tashkent month that contains `now`, `offset` months away, as date
 * strings: `start` is its 1st, `end` is the 1st of the month after
 * (use `>= start` and `< end`).
 */
export function tashkentMonth(now: Date, offset = 0): { start: string; end: string } {
  const [year, month] = tashkentDate(now).split("-").map(Number);
  const first = (index: number) => new Date(Date.UTC(year, index, 1)).toISOString().slice(0, 10);
  return { start: first(month - 1 + offset), end: first(month + offset) };
}

/**
 * The Monday-to-Sunday week (weeks start on Monday) that contains `now` in
 * Tashkent, as date strings: `start` is the Monday, `end` the Monday after.
 */
export function tashkentWeek(now: Date): { start: string; end: string } {
  const today = new Date(`${tashkentDate(now)}T00:00:00Z`);
  const sinceMonday = (today.getUTCDay() + 6) % 7;
  const monday = new Date(today.getTime() - sinceMonday * DAY_MS);
  const day = (offset: number) => new Date(monday.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
  return { start: day(0), end: day(7) };
}

/** A date string moved by whole days. */
export function addDays(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM" moved by whole months. */
export function shiftMonth(month: string, by: number): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1 + by, 1)).toISOString().slice(0, 7);
}

/** ISO weekday of a date string: 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string): number {
  return ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}
