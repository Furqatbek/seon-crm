import { describe, expect, it } from "vitest";

import {
  DEFAULT_POINTS_SETTINGS as S,
  attendanceDelta,
  attendanceTarget,
  checkAward,
  isPaidOnTime,
  isPerfectMonth,
} from "./points";

describe("attendance points", () => {
  it("Present 2, Late 1, Absent and Excused 0", () => {
    expect(attendanceTarget("present", S)).toBe(2);
    expect(attendanceTarget("late", S)).toBe(1);
    expect(attendanceTarget("absent", S)).toBe(0);
    expect(attendanceTarget("excused", S)).toBe(0);
    expect(attendanceTarget(null, S)).toBe(0);
  });

  it("Present → Absent posts −2; only the difference is ever posted", () => {
    expect(attendanceDelta("present", 0, S)).toBe(2);
    expect(attendanceDelta("absent", 2, S)).toBe(-2);
    expect(attendanceDelta("late", 2, S)).toBe(-1);
    expect(attendanceDelta("present", 1, S)).toBe(1);
    expect(attendanceDelta("present", 2, S)).toBe(0);
  });

  it("cancelling a lesson reverses its points", () => {
    expect(attendanceDelta("present", 2, S, true)).toBe(-2);
    expect(attendanceDelta("absent", 0, S, true)).toBe(0);
  });

  it("the programme switched off posts nothing", () => {
    expect(attendanceDelta("present", 0, { ...S, enabled: false })).toBe(0);
    expect(attendanceDelta("absent", 2, { ...S, enabled: false })).toBe(0);
  });

  it("a changed value applies to the next change, measured against what was posted", () => {
    const raised = { ...S, present: 3 };
    // Posted 2 under the old value; Present → Late now leaves the student with 1.
    expect(attendanceDelta("late", 2, raised)).toBe(-1);
    expect(attendanceDelta("absent", 2, raised)).toBe(-2);
  });
});

describe("perfect month", () => {
  it("needs at least 4 held lessons", () => {
    expect(isPerfectMonth(["present", "present", "present"], S)).toBe(false);
    expect(isPerfectMonth(["present", "present", "present", "present"], S)).toBe(true);
  });

  it("allows Late and Excused, never Absent", () => {
    expect(isPerfectMonth(["present", "late", "excused", "present"], S)).toBe(true);
    expect(isPerfectMonth(["present", "late", "absent", "present", "present"], S)).toBe(false);
  });
});

describe("fee paid on time", () => {
  it("is earned when the payments by the due day cover what was charged", () => {
    expect(isPaidOnTime({ monthFees: [600_000], chargedByDueDay: 600_000, paidByDueDay: 600_000 })).toBe(true);
    expect(isPaidOnTime({ monthFees: [600_000], chargedByDueDay: 600_000, paidByDueDay: 599_000 })).toBe(false);
  });

  it("counts a prorated first month like any fee", () => {
    expect(isPaidOnTime({ monthFees: [350_000], chargedByDueDay: 350_000, paidByDueDay: 350_000 })).toBe(true);
  });

  it("an older debt blocks it, a credit helps, and no fee means no points", () => {
    expect(isPaidOnTime({ monthFees: [600_000], chargedByDueDay: 1_200_000, paidByDueDay: 600_000 })).toBe(false);
    expect(isPaidOnTime({ monthFees: [600_000], chargedByDueDay: 500_000, paidByDueDay: 500_000 })).toBe(true);
    expect(isPaidOnTime({ monthFees: [], chargedByDueDay: 0, paidByDueDay: 0 })).toBe(false);
  });
});

describe("teacher awards and deductions", () => {
  const base = { fromPreset: true, reason: "", balance: 20, awardedToday: 0, deductedToday: 0, settings: S };

  it("1 to 5 points per action", () => {
    expect(checkAward({ ...base, points: 5 })).toEqual({ ok: true, applied: 5 });
    expect(checkAward({ ...base, points: -5 })).toEqual({ ok: true, applied: -5 });
    expect(checkAward({ ...base, points: 6 })).toEqual({ ok: false, error: "amountInvalid" });
    expect(checkAward({ ...base, points: 0 })).toEqual({ ok: false, error: "amountInvalid" });
    expect(checkAward({ ...base, points: 1.5 })).toEqual({ ok: false, error: "amountInvalid" });
  });

  it("a custom amount needs a reason", () => {
    expect(checkAward({ ...base, fromPreset: false, points: 2 })).toEqual({ ok: false, error: "reasonRequired" });
    expect(checkAward({ ...base, fromPreset: false, reason: "Olympiad", points: 2 })).toEqual({ ok: true, applied: 2 });
  });

  it("at most 10 points per student per day from one teacher", () => {
    expect(checkAward({ ...base, points: 5, awardedToday: 5 })).toEqual({ ok: true, applied: 5 });
    expect(checkAward({ ...base, points: 3, awardedToday: 8 })).toEqual({ ok: false, error: "dailyLimit", left: 2 });
    expect(checkAward({ ...base, points: -3, deductedToday: 8 })).toEqual({ ok: false, error: "dailyLimit", left: 2 });
    // Awards and deductions are counted apart.
    expect(checkAward({ ...base, points: -3, awardedToday: 10 })).toEqual({ ok: true, applied: -3 });
  });

  it("a deduction is reduced to the balance and never goes below zero", () => {
    expect(checkAward({ ...base, points: -5, balance: 3 })).toEqual({ ok: true, applied: -3 });
    expect(checkAward({ ...base, points: -5, balance: 0 })).toEqual({ ok: true, applied: 0 });
  });

  it("the programme switched off refuses everything", () => {
    expect(checkAward({ ...base, points: 2, settings: { ...S, enabled: false } })).toEqual({
      ok: false,
      error: "programmeOff",
    });
  });
});
