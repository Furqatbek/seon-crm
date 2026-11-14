import { describe, expect, it } from "vitest";

import {
  calculateTeacherPayouts,
  type Payout,
  type SalaryGroup,
  type SalaryLesson,
  type SalaryPayment,
  type SalaryRate,
  type SalaryTeacher,
} from "./salary";

const OCT = "2026-10-01";
const NOV = "2026-11-01";

const teacher = (id: string, extra: Partial<SalaryTeacher> = {}): SalaryTeacher => ({
  id,
  is_active: true,
  archived_at: null,
  ...extra,
});
const TEACHERS = [teacher("fixed"), teacher("lesson"), teacher("percent")];

const RATES: SalaryRate[] = [
  { teacher_id: "fixed", pay_type: "fixed_monthly", amount: 6_000_000, percent: null, effective_from: "2026-01-01" },
  { teacher_id: "lesson", pay_type: "per_lesson", amount: 120_000, percent: null, effective_from: "2026-01-01" },
  { teacher_id: "percent", pay_type: "percent_of_revenue", amount: null, percent: 40, effective_from: "2026-01-01" },
];

const GROUPS: SalaryGroup[] = [
  { id: "g-fixed", name: "English A2", teacher_id: "fixed" },
  { id: "g-lesson", name: "Maths 7", teacher_id: "lesson" },
  { id: "g-percent-1", name: "IELTS", teacher_id: "percent" },
  { id: "g-percent-2", name: "Kids", teacher_id: "percent" },
];

const held = (group_id: string, teacher_id: string, lesson_date: string): SalaryLesson => ({
  group_id,
  teacher_id,
  lesson_date,
  status: "held",
});
const paid = (group_id: string | null, amount: number, paid_at: string, voided_at: string | null = null): SalaryPayment => ({
  group_id,
  amount,
  paid_at,
  voided_at,
});

const LESSONS: SalaryLesson[] = [
  held("g-fixed", "fixed", "2026-10-05"),
  held("g-fixed", "fixed", "2026-10-07"),
  held("g-lesson", "lesson", "2026-10-06"),
  held("g-lesson", "lesson", "2026-10-08"),
  held("g-lesson", "lesson", "2026-10-13"),
  { ...held("g-lesson", "lesson", "2026-10-15"), status: "cancelled" },
  { ...held("g-lesson", "lesson", "2026-10-20"), status: "scheduled" },
  held("g-lesson", "lesson", "2026-09-29"),
  held("g-lesson", "lesson", "2026-11-03"),
];

const PAYMENTS: SalaryPayment[] = [
  paid("g-percent-1", 850_000, "2026-10-03T06:00:00Z"),
  paid("g-percent-1", 850_000, "2026-10-10T06:00:00Z"),
  paid("g-percent-2", 451_000, "2026-10-12T06:00:00Z"),
  // Other teachers' groups, other months, no group.
  paid("g-fixed", 600_000, "2026-10-04T06:00:00Z"),
  paid("g-percent-1", 850_000, "2026-09-30T18:59:59Z"),
  paid("g-percent-1", 850_000, "2026-10-31T19:00:00Z"),
  paid(null, 999_000, "2026-10-05T06:00:00Z"),
];

const DATA = { teachers: TEACHERS, rates: RATES, groups: GROUPS, lessons: LESSONS, payments: PAYMENTS };
const of = (payouts: Payout[], id: string) => {
  const payout = payouts.find((entry) => entry.teacher_id === id);
  if (!payout) throw new Error(`no payout for ${id}`);
  return payout;
};

describe("calculateTeacherPayouts", () => {
  it("a fixed monthly teacher gets the fixed amount, whatever was taught", () => {
    const payout = of(calculateTeacherPayouts(OCT, DATA), "fixed");
    expect(payout).toMatchObject({
      month: OCT,
      pay_type: "fixed_monthly",
      basis: 2,
      rate: 6_000_000,
      calculated: 6_000_000,
      final_amount: 6_000_000,
      status: "draft",
    });
    expect(payout.breakdown).toEqual([
      { group_id: "g-fixed", group_name: "English A2", lessons: 2, collected: 0, amount: null },
    ]);
    expect(of(calculateTeacherPayouts(OCT, { ...DATA, lessons: [] }), "fixed").calculated).toBe(6_000_000);
  });

  it("a per-lesson teacher gets the amount × held lessons taught that month", () => {
    const payout = of(calculateTeacherPayouts(OCT, DATA), "lesson");
    // Cancelled, scheduled, September and November lessons are not counted.
    expect(payout).toMatchObject({ pay_type: "per_lesson", basis: 3, rate: 120_000, calculated: 360_000 });
    expect(payout.breakdown).toEqual([
      { group_id: "g-lesson", group_name: "Maths 7", lessons: 3, collected: 0, amount: 360_000 },
    ]);
  });

  it("a percent teacher gets the percent of payments received that month for their groups", () => {
    const payout = of(calculateTeacherPayouts(OCT, DATA), "percent");
    expect(payout).toMatchObject({ pay_type: "percent_of_revenue", basis: 2_151_000, rate: 40 });
    // Each group's line is rounded to 1,000: 40 % of 451,000 = 180,400 → 180,000.
    expect(payout.breakdown).toEqual([
      { group_id: "g-percent-1", group_name: "IELTS", lessons: 0, collected: 1_700_000, amount: 680_000 },
      { group_id: "g-percent-2", group_name: "Kids", lessons: 0, collected: 451_000, amount: 180_000 },
    ]);
    expect(payout.calculated).toBe(860_000);
  });

  it("the month is the Tashkent month: 23:59 on the 31st counts, 00:00 on the 1st does not", () => {
    const payments = [
      paid("g-percent-1", 100_000, "2026-09-30T19:00:00Z"), // 1 Oct 00:00 Tashkent
      paid("g-percent-1", 200_000, "2026-10-31T18:59:59Z"), // 31 Oct 23:59 Tashkent
      paid("g-percent-1", 400_000, "2026-10-31T19:00:00Z"), // 1 Nov 00:00 Tashkent
    ];
    expect(of(calculateTeacherPayouts(OCT, { ...DATA, payments }), "percent").basis).toBe(300_000);
    expect(of(calculateTeacherPayouts(NOV, { ...DATA, payments }), "percent").basis).toBe(400_000);
  });

  it("a substitute lesson pays the substitute, not the group's teacher", () => {
    const lessons = [
      held("g-lesson", "lesson", "2026-10-06"),
      // The fixed-salary teacher's group, taught once by the per-lesson teacher.
      held("g-fixed", "lesson", "2026-10-07"),
      held("g-fixed", "fixed", "2026-10-09"),
    ];
    const payouts = calculateTeacherPayouts(OCT, { ...DATA, lessons });
    expect(of(payouts, "lesson")).toMatchObject({ basis: 2, calculated: 240_000 });
    expect(of(payouts, "lesson").breakdown).toEqual([
      { group_id: "g-fixed", group_name: "English A2", lessons: 1, collected: 0, amount: 120_000 },
      { group_id: "g-lesson", group_name: "Maths 7", lessons: 1, collected: 0, amount: 120_000 },
    ]);
    expect(of(payouts, "fixed").basis).toBe(1);

    // And the other way round: the group's own per-lesson teacher is not paid for it.
    const covered = [held("g-lesson", "fixed", "2026-10-06"), held("g-lesson", "lesson", "2026-10-08")];
    expect(of(calculateTeacherPayouts(OCT, { ...DATA, lessons: covered }), "lesson").calculated).toBe(120_000);
  });

  it("a substitute's lesson does not move % pay: that follows the group's teacher", () => {
    const lessons = [held("g-percent-1", "lesson", "2026-10-06")];
    const payouts = calculateTeacherPayouts(OCT, { ...DATA, lessons });
    expect(of(payouts, "percent").calculated).toBe(860_000);
    expect(of(payouts, "lesson").calculated).toBe(120_000);
  });

  it("voided payments are excluded from % pay", () => {
    const payments = [
      paid("g-percent-1", 850_000, "2026-10-03T06:00:00Z"),
      paid("g-percent-1", 850_000, "2026-10-10T06:00:00Z", "2026-10-11T06:00:00Z"),
    ];
    const payout = of(calculateTeacherPayouts(OCT, { ...DATA, payments }), "percent");
    expect(payout.basis).toBe(850_000);
    expect(payout.calculated).toBe(340_000);
  });

  it("a rate change on the 15th applies from the next month", () => {
    const rates: SalaryRate[] = [
      ...RATES,
      { teacher_id: "lesson", pay_type: "per_lesson", amount: 150_000, percent: null, effective_from: "2026-10-15" },
    ];
    const lessons = [held("g-lesson", "lesson", "2026-10-06"), held("g-lesson", "lesson", "2026-10-20"), held("g-lesson", "lesson", "2026-11-03")];
    // October: both lessons at the old rate, also the one after the 15th.
    expect(of(calculateTeacherPayouts(OCT, { ...DATA, rates, lessons }), "lesson")).toMatchObject({
      rate: 120_000,
      calculated: 240_000,
    });
    expect(of(calculateTeacherPayouts(NOV, { ...DATA, rates, lessons }), "lesson")).toMatchObject({
      rate: 150_000,
      calculated: 150_000,
    });
  });

  it("a rate that starts on the 1st pays that month; a teacher with no rate on the 1st has no payout", () => {
    const rates: SalaryRate[] = [
      { teacher_id: "lesson", pay_type: "per_lesson", amount: 150_000, percent: null, effective_from: NOV },
      { teacher_id: "fixed", pay_type: "fixed_monthly", amount: 5_000_000, percent: null, effective_from: "2026-10-02" },
    ];
    expect(calculateTeacherPayouts(OCT, { ...DATA, rates })).toEqual([]);
    const november = calculateTeacherPayouts(NOV, { ...DATA, rates });
    expect(november.map((payout) => payout.teacher_id)).toEqual(["fixed", "lesson"]);
    expect(of(november, "lesson").rate).toBe(150_000);
  });

  it("a paid payout is never recalculated", () => {
    const first = calculateTeacherPayouts(OCT, DATA);
    const paidOut: Payout = { ...of(first, "lesson"), status: "paid" };
    const existing = first.map((payout) => (payout.teacher_id === "lesson" ? paidOut : payout));
    // Two more lessons are marked held and the rate history is rewritten afterwards.
    const lessons = [...LESSONS, held("g-lesson", "lesson", "2026-10-22"), held("g-lesson", "lesson", "2026-10-27")];
    const rates = RATES.map((rate) => (rate.teacher_id === "lesson" ? { ...rate, amount: 200_000 } : rate));
    const again = calculateTeacherPayouts(OCT, { ...DATA, lessons, rates, existing });
    expect(of(again, "lesson")).toBe(paidOut);
    expect(of(again, "lesson").calculated).toBe(360_000);
    // The same change does reach a draft.
    expect(of(calculateTeacherPayouts(OCT, { ...DATA, lessons, rates, existing: first }), "lesson").calculated).toBe(1_000_000);
  });

  it("refreshing a draft keeps its bonus and deduction", () => {
    const first = calculateTeacherPayouts(OCT, DATA);
    const existing = first.map((payout) =>
      payout.teacher_id === "lesson" ? { ...payout, bonus: 200_000, deduction: 50_000, final_amount: 510_000 } : payout,
    );
    const lessons = [...LESSONS, held("g-lesson", "lesson", "2026-10-22")];
    expect(of(calculateTeacherPayouts(OCT, { ...DATA, lessons, existing }), "lesson")).toMatchObject({
      calculated: 480_000,
      bonus: 200_000,
      deduction: 50_000,
      final_amount: 630_000,
    });
  });

  it("only active teachers get a payout; an earlier draft of theirs stays as it was", () => {
    const teachers = [teacher("fixed", { is_active: false }), teacher("lesson", { archived_at: "2026-10-20T00:00:00Z" }), teacher("percent")];
    expect(calculateTeacherPayouts(OCT, { ...DATA, teachers }).map((payout) => payout.teacher_id)).toEqual(["percent"]);
    const existing = calculateTeacherPayouts(OCT, DATA);
    const again = calculateTeacherPayouts(OCT, { ...DATA, teachers, lessons: [], existing });
    expect(of(again, "lesson")).toBe(of(existing, "lesson"));
  });

  it("percent with decimals stays in whole soʻm", () => {
    const rates: SalaryRate[] = [
      { teacher_id: "percent", pay_type: "percent_of_revenue", amount: null, percent: 12.5, effective_from: "2026-01-01" },
    ];
    const payments = [paid("g-percent-1", 1_004_000, "2026-10-03T06:00:00Z")];
    // 12.5 % of 1,004,000 = 125,500 → 126,000 (half up).
    expect(of(calculateTeacherPayouts(OCT, { ...DATA, rates, payments }), "percent").calculated).toBe(126_000);
  });

  it("refuses a month that is not the 1st", () => {
    expect(() => calculateTeacherPayouts("2026-10-15", DATA)).toThrow(RangeError);
  });
});
