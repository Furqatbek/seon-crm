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
