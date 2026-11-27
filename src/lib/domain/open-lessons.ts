// Open lessons repeat weekly: a slot has a weekday and a time, and a session
// is one date of it. Dates are "YYYY-MM-DD" in Tashkent; this file only does
// calendar arithmetic, so it treats them as plain dates.

export type SlotTime = { id: string; weekday: number; start_time: string };
export type Session = { slotId: string; date: string; startTime: string };

/** How far back the CRM's session lists go, so a past lesson can still be marked; and how far ahead, as the app shows. */
export const SESSIONS_BACK_DAYS = 14;
export const SESSIONS_AHEAD_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;
const parse = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  return new Date(parse(date)).getUTCDay() || 7;
}

export function addDays(date: string, days: number): string {
  return new Date(parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Every session of the slots on the `days` days from `from`, the earliest first. */
export function sessionsOf(slots: readonly SlotTime[], from: string, days: number): Session[] {
  const sessions: Session[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(from, offset);
    const weekday = isoWeekday(date);
    for (const slot of slots) if (slot.weekday === weekday) sessions.push({ slotId: slot.id, date, startTime: slot.start_time.slice(0, 5) });
  }
  return sessions.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.slotId.localeCompare(b.slotId));
}

/** The share of issued vouchers that were used to enrol, as a whole percent; null when none were issued. */
export function conversionPercent(issued: number, redeemed: number): number | null {
  return issued > 0 ? Math.round((redeemed / issued) * 100) : null;
}
