// The period of a report — docs/SPEC.md → "Screens → Reports".
// A period is whole months, both ends included, never past the current month.

import { shiftMonth } from "./time";

export const REPORT_PERIODS = ["this", "last", "3", "6", "12", "custom"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** The longest period a report covers, in months. */
export const MAX_REPORT_MONTHS = 36;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Months from `from` to `to`, both included ("YYYY-MM"). */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = from; month <= to && months.length < 1000; month = shiftMonth(month, 1)) months.push(month);
  return months;
}

/**
 * The months a period covers, given the current month ("YYYY-MM").
 * - this / last: one month
 * - 3 / 6 / 12: that many months ending with the current one
 * - custom: from … to, cut at the current month and at 36 months; anything
 *   that is not a valid range falls back to this month.
 */
export function resolvePeriod(
  choice: { period: ReportPeriod; from?: string; to?: string },
  currentMonth: string,
): { period: ReportPeriod; from: string; to: string } {
  const thisMonth = { period: "this" as const, from: currentMonth, to: currentMonth };
  switch (choice.period) {
    case "this":
      return thisMonth;
    case "last": {
      const last = shiftMonth(currentMonth, -1);
      return { period: "last", from: last, to: last };
    }
    case "3":
    case "6":
    case "12":
      return { period: choice.period, from: shiftMonth(currentMonth, 1 - Number(choice.period)), to: currentMonth };
    case "custom": {
      const { from, to } = choice;
      if (!from || !to || !MONTH.test(from) || !MONTH.test(to) || from > currentMonth) return thisMonth;
      const end = to > currentMonth ? currentMonth : to;
      if (from > end) return thisMonth;
      const earliest = shiftMonth(end, 1 - MAX_REPORT_MONTHS);
      return { period: "custom", from: from < earliest ? earliest : from, to: end };
    }
  }
}
