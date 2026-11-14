import { describe, expect, it } from "vitest";

import { discountAmount, proposeFirstCharge, roundToThousand } from "./proration";

// November 2026, Monday / Wednesday / Friday, with the two days dropped that
// the spec's example leaves out: 12 lessons, 7 of them from the 13th on.
const NOVEMBER_12 = [
  "2026-11-02", "2026-11-04", "2026-11-06", "2026-11-09", "2026-11-11",
  "2026-11-13", "2026-11-16", "2026-11-18", "2026-11-20", "2026-11-23", "2026-11-25", "2026-11-27",
];

const join = (joinedOn: string, extra: Partial<Parameters<typeof proposeFirstCharge>[0]> = {}) =>
  proposeFirstCharge({ monthlyFee: 600_000, discount: null, joinedOn, lessonDates: NOVEMBER_12, ...extra });

describe("proposeFirstCharge", () => {
  it("600,000 soʻm, 12 lessons, joining on the 13th with 7 left = 350,000", () => {
    expect(join("2026-11-13")).toEqual({
      billingMonth: "2026-11-01",
      baseAmount: 600_000,
      discountAmount: 0,
      fullAmount: 600_000,
      lessonsInMonth: 12,
      lessonsCounted: 7,
      isProrated: true,
      amount: 350_000,
    });
  });

  it("joining before the month's first lesson charges the full month", () => {
    expect(join("2026-11-01")).toMatchObject({ isProrated: false, lessonsCounted: 12, amount: 600_000 });
  });

  it("joining on the day of the first lesson is still the full month", () => {
    expect(join("2026-11-02")).toMatchObject({ isProrated: false, lessonsCounted: 12, amount: 600_000 });
  });

  it("joining the day after the first lesson is prorated", () => {
    expect(join("2026-11-03")).toMatchObject({ isProrated: true, lessonsCounted: 11, amount: 550_000 });
  });

  it("joining after the last lesson charges nothing until next month", () => {
    expect(join("2026-11-28")).toMatchObject({ isProrated: true, lessonsCounted: 0, amount: 0 });
    expect(join("2026-11-30")).toMatchObject({ lessonsCounted: 0, amount: 0 });
  });

  it("joining on the day of the last lesson pays for that one lesson", () => {
    expect(join("2026-11-27")).toMatchObject({ lessonsCounted: 1, amount: 50_000 });
  });

  it("cancelled lessons are not counted: the caller leaves them out", () => {
    // The lessons on the 16th and the 4th were cancelled: 10 in the month, 6 left.
    const lessonDates = NOVEMBER_12.filter((date) => date !== "2026-11-16" && date !== "2026-11-04");
    expect(join("2026-11-13", { lessonDates })).toMatchObject({
      lessonsInMonth: 10,
      lessonsCounted: 6,
      amount: 360_000,
    });
    // A cancelled first lesson moves the "first lesson" to the next one.
    const withoutFirst = NOVEMBER_12.slice(1);
    expect(join("2026-11-04", { lessonDates: withoutFirst })).toMatchObject({
      isProrated: false,
      amount: 600_000,
    });
  });

  it("a 15% discount comes off before proration", () => {
    expect(join("2026-11-13", { discount: { kind: "percent", value: 15 } })).toMatchObject({
      discountAmount: 90_000,
      fullAmount: 510_000,
      // 510,000 × 7 ÷ 12 = 297,500 → 298,000
      amount: 298_000,
    });
    expect(join("2026-11-01", { discount: { kind: "percent", value: 15 } })).toMatchObject({
      amount: 510_000,
    });
  });

  it("a fixed discount comes off before proration", () => {
    expect(join("2026-11-13", { discount: { kind: "amount", value: 50_000 } })).toMatchObject({
      discountAmount: 50_000,
      fullAmount: 550_000,
      // 550,000 × 7 ÷ 12 = 320,833.3 → 321,000
      amount: 321_000,
    });
  });

  it("rounds to the nearest 1,000 soʻm, half up", () => {
    // 500,000 × 7 ÷ 12 = 291,666.7 → 292,000
    expect(join("2026-11-13", { monthlyFee: 500_000 }).amount).toBe(292_000);
    // 450,000 × 5 ÷ 12 = 187,500 → 188,000 (exactly half rounds up)
    expect(join("2026-11-18", { monthlyFee: 450_000 }).amount).toBe(188_000);
    // 400,000 × 1 ÷ 12 = 33,333.3 → 33,000
    expect(join("2026-11-27", { monthlyFee: 400_000 }).amount).toBe(33_000);
  });

  it("a month with no lessons at all charges nothing", () => {
    expect(join("2026-11-13", { lessonDates: [] })).toMatchObject({
      lessonsInMonth: 0,
      lessonsCounted: 0,
      isProrated: false,
      amount: 0,
    });
  });

  it("only counts lessons in the month joined", () => {
    const lessonDates = ["2026-10-30", ...NOVEMBER_12, "2026-12-02"];
    expect(join("2026-11-13", { lessonDates })).toMatchObject({ lessonsInMonth: 12, lessonsCounted: 7 });
  });

  it("a 100% discount charges nothing and a discount never exceeds the fee", () => {
    expect(join("2026-11-13", { discount: { kind: "percent", value: 100 } }).amount).toBe(0);
    expect(join("2026-11-01", { discount: { kind: "amount", value: 900_000 } })).toMatchObject({
      discountAmount: 600_000,
      amount: 0,
    });
  });
});

describe("roundToThousand", () => {
  it("rounds half up", () => {
    expect(roundToThousand(1_499)).toBe(1_000);
    expect(roundToThousand(1_500)).toBe(2_000);
    expect(roundToThousand(499)).toBe(0);
    expect(roundToThousand(500)).toBe(1_000);
    expect(roundToThousand(350_000)).toBe(350_000);
    expect(roundToThousand(0)).toBe(0);
  });

  it("rounds a fraction without floating point", () => {
    expect(roundToThousand(600_000 * 7, 12)).toBe(350_000);
    expect(roundToThousand(2_375_000, 2)).toBe(1_188_000); // 1,187,500 → up
    expect(roundToThousand(1_000_000, 3)).toBe(333_000);
    expect(roundToThousand(2_000_000, 3)).toBe(667_000);
  });

  it("refuses floats, negatives and a zero denominator", () => {
    expect(() => roundToThousand(1000.5)).toThrow(RangeError);
    expect(() => roundToThousand(-1000)).toThrow(RangeError);
    expect(() => roundToThousand(1000, 0)).toThrow(RangeError);
  });
});

describe("discountAmount", () => {
  it("rounds a percent discount to 1,000 soʻm", () => {
    expect(discountAmount(600_000, { kind: "percent", value: 15 })).toBe(90_000);
    expect(discountAmount(450_000, { kind: "percent", value: 15 })).toBe(68_000); // 67,500 → up
    expect(discountAmount(400_000, null)).toBe(0);
  });

  it("refuses an impossible discount", () => {
    expect(() => discountAmount(600_000, { kind: "percent", value: 0 })).toThrow(RangeError);
    expect(() => discountAmount(600_000, { kind: "percent", value: 101 })).toThrow(RangeError);
    expect(() => discountAmount(600_000, { kind: "percent", value: 12.5 })).toThrow(RangeError);
    expect(() => discountAmount(600_000, { kind: "amount", value: 0 })).toThrow(RangeError);
  });
});
