// Payments — docs/SPEC.md → "Business rules → Payments and balance".

import { tashkentDate } from "./time";

/** True for a "YYYY-MM-DD" that is a day on the calendar ("2026-02-31" is not). */
export function isRealDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

/**
 * The amount to suggest in Take payment: the debt, but only when the student
 * has exactly one group. A payment is booked to one group, so a debt that may
 * be spread over several groups is never suggested as one amount.
 */
export function suggestedPayment(balance: number, groupCount: number): number | null {
  return balance < 0 && groupCount === 1 ? -balance : null;
}

/**
 * The instant stored for a payment taken on `day`.
 * Today → right now, so payments keep the order they were taken in.
 * An earlier day → noon in Tashkent on that day.
 * Null for a day in the future (money cannot be received tomorrow) and for a
 * day that is not on the calendar.
 */
export function paymentInstant(day: string, now: Date): string | null {
  if (!isRealDay(day)) return null;
  const today = tashkentDate(now);
  if (day > today) return null;
  if (day === today) return now.toISOString();
  return new Date(`${day}T12:00:00+05:00`).toISOString();
}

/** The Tashkent month ("YYYY-MM") as the instants it starts and ends at (end is exclusive). */
export function monthInstants(month: string): { start: string; end: string } {
  const [year, index] = month.split("-").map(Number);
  const first = (monthIndex: number) => {
    const date = new Date(Date.UTC(year, monthIndex, 1));
    return new Date(`${date.toISOString().slice(0, 10)}T00:00:00+05:00`).toISOString();
  };
  return { start: first(index - 1), end: first(index) };
}
