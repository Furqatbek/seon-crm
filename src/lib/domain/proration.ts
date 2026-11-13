// The first charge when a student joins a group —
// docs/SPEC.md → "Business rules → Joining mid-month".
// Mirrored in SQL: propose_first_charge() and round_to_thousand().
// All amounts are whole soʻm.

export type Discount =
  | { kind: "percent"; value: number } // 1–100
  | { kind: "amount"; value: number } // soʻm
  | null;

export type FirstCharge = {
  /** "YYYY-MM-01" of the month joined in. */
  billingMonth: string;
  /** The group's monthly fee. */
  baseAmount: number;
  discountAmount: number;
  /** Fee after discount: what a full month costs this student. */
  fullAmount: number;
  /** Lessons in the month, cancelled ones not counted. */
  lessonsInMonth: number;
  /** Lessons from the join date to the end of the month. */
  lessonsCounted: number;
  /** True when the student joined after the month's first lesson. */
  isProrated: boolean;
  /** The proposed first charge. */
  amount: number;
};

function assertWhole(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a whole number of soʻm, got ${value}`);
  }
}

/** numerator ÷ denominator, rounded to the nearest 1,000 soʻm, half up. Integer maths only. */
export function roundToThousand(numerator: number, denominator = 1): number {
  assertWhole(numerator, "numerator");
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError(`denominator must be a positive whole number, got ${denominator}`);
  }
  return Math.floor((numerator * 2 + denominator * 1000) / (denominator * 2000)) * 1000;
}

/** The soʻm taken off a monthly fee. A percent discount is rounded to 1,000; never more than the fee. */
export function discountAmount(monthlyFee: number, discount: Discount): number {
  assertWhole(monthlyFee, "monthlyFee");
  if (!discount) return 0;
  if (discount.kind === "percent") {
    if (!Number.isInteger(discount.value) || discount.value < 1 || discount.value > 100) {
      throw new RangeError(`A percent discount is 1–100, got ${discount.value}`);
    }
    return Math.min(monthlyFee, roundToThousand(monthlyFee * discount.value, 100));
  }
  assertWhole(discount.value, "discount");
  if (discount.value === 0) throw new RangeError("A fixed discount is above 0");
  return Math.min(monthlyFee, discount.value);
}

/**
 * The first charge for a student joining on `joinedOn`.
 *
 *   first charge = fee after discount × lessons from join date ÷ lessons in the month
 *
 * - Joined after the month's first lesson → prorated.
 * - Joined on or before the first lesson → the full month.
 * - No lessons left in the month → nothing until next month.
 *
 * `lessonDates` are the month's lesson days ("YYYY-MM-DD") that are not cancelled.
 */
export function proposeFirstCharge(input: {
  monthlyFee: number;
  discount: Discount;
  /** "YYYY-MM-DD" */
  joinedOn: string;
  lessonDates: readonly string[];
}): FirstCharge {
  const month = input.joinedOn.slice(0, 7);
  const dates = input.lessonDates.filter((date) => date.startsWith(month));
  const lessonsInMonth = dates.length;
  const lessonsCounted = dates.filter((date) => date >= input.joinedOn).length;
  const firstLesson = dates.reduce<string | null>(
    (first, date) => (first === null || date < first ? date : first),
    null,
  );

  const discount = discountAmount(input.monthlyFee, input.discount);
  const fullAmount = input.monthlyFee - discount;
  const isProrated = firstLesson !== null && input.joinedOn > firstLesson;

  let amount: number;
  if (lessonsCounted === 0) amount = 0;
  else if (isProrated) amount = roundToThousand(fullAmount * lessonsCounted, lessonsInMonth);
  else amount = fullAmount;

  return {
    billingMonth: `${month}-01`,
    baseAmount: input.monthlyFee,
    discountAmount: discount,
    fullAmount,
    lessonsInMonth,
    lessonsCounted,
    isProrated,
    amount,
  };
}
