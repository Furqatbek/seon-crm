// Teacher pay rates — docs/SPEC.md → "Business rules → Teacher salaries".
// A rate is history: a change is a new row with a later effective_from.

export const PAY_TYPES = ["fixed_monthly", "percent_of_revenue", "per_lesson"] as const;
export type PayType = (typeof PAY_TYPES)[number];

export type PayRate = {
  pay_type: PayType;
  /** Whole soʻm: the monthly salary, or the amount per lesson. */
  amount: number | null;
  /** Share of collected revenue, 1–100. */
  percent: number | null;
  /** "YYYY-MM-DD" */
  effective_from: string;
};

/** The rate in effect on a day: the latest one that started on or before it. */
export function rateOn<T extends Pick<PayRate, "effective_from">>(
  rates: readonly T[],
  day: string,
): T | null {
  let current: T | null = null;
  for (const rate of rates) {
    if (rate.effective_from <= day && (!current || rate.effective_from > current.effective_from)) {
      current = rate;
    }
  }
  return current;
}

export type RateStatus = "current" | "upcoming" | "past";

/** Where a rate stands on a given day, among all of the teacher's rates. */
export function rateStatus<T extends Pick<PayRate, "effective_from">>(
  rate: T,
  rates: readonly T[],
  day: string,
): RateStatus {
  if (rate.effective_from > day) return "upcoming";
  return rateOn(rates, day)?.effective_from === rate.effective_from ? "current" : "past";
}

/** Whether a pay type is paid as an amount of soʻm (and not as a percent). */
export function paysAmount(payType: PayType): boolean {
  return payType !== "percent_of_revenue";
}

/**
 * Whole soʻm typed by a person ("5 000 000", "5,000,000") → 5000000.
 * Null for anything that is not a whole number: money is never a float.
 */
export function parseMoneyInput(input: string): number | null {
  const compact = input.replace(/[\s,.'’ʻ]/g, "");
  if (!/^\d{1,15}$/.test(compact)) return null;
  // A dot or comma followed by one or two digits is a decimal part, not a grouping.
  if (/[.,]\d{1,2}$/.test(input.trim())) return null;
  return Number(compact);
}

/** A percent typed by a person ("40", "12.5", "12,5") → number with at most 2 decimals. */
export function parsePercentInput(input: string): number | null {
  const normalized = input.trim().replace(",", ".").replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized);
}
