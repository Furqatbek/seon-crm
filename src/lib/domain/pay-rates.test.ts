import { describe, expect, it } from "vitest";

import { parseMoneyInput, parsePercentInput, paysAmount, rateOn, rateStatus } from "./pay-rates";

const rates = [
  { effective_from: "2026-03-01", label: "first" },
  { effective_from: "2026-10-15", label: "raise" },
  { effective_from: "2027-01-01", label: "next year" },
];

describe("rateOn", () => {
  it("picks the latest rate that has started", () => {
    expect(rateOn(rates, "2026-06-10")?.label).toBe("first");
    expect(rateOn(rates, "2026-11-13")?.label).toBe("raise");
    expect(rateOn(rates, "2027-05-01")?.label).toBe("next year");
  });

  it("starts on the effective date itself", () => {
    expect(rateOn(rates, "2026-10-14")?.label).toBe("first");
    expect(rateOn(rates, "2026-10-15")?.label).toBe("raise");
  });

  it("a rate that starts on the 15th first pays the next month", () => {
    // Salaries use the rate in effect on the 1st of the month.
    expect(rateOn(rates, "2026-10-01")?.label).toBe("first");
    expect(rateOn(rates, "2026-11-01")?.label).toBe("raise");
  });

  it("is null before the first rate and for a teacher without rates", () => {
    expect(rateOn(rates, "2026-02-28")).toBeNull();
    expect(rateOn([], "2026-11-13")).toBeNull();
  });

  it("does not depend on the order of the rows", () => {
    expect(rateOn([...rates].reverse(), "2026-11-13")?.label).toBe("raise");
  });
});

describe("rateStatus", () => {
  it("marks one current rate, the earlier ones past and the later ones upcoming", () => {
    expect(rates.map((rate) => rateStatus(rate, rates, "2026-11-13"))).toEqual([
      "past",
      "current",
      "upcoming",
    ]);
  });

  it("has no current rate before the first one starts", () => {
    expect(rates.map((rate) => rateStatus(rate, rates, "2026-01-01"))).toEqual([
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });
});

describe("pay inputs", () => {
  it("knows which pay types are an amount", () => {
    expect(paysAmount("fixed_monthly")).toBe(true);
    expect(paysAmount("per_lesson")).toBe(true);
    expect(paysAmount("percent_of_revenue")).toBe(false);
  });

  it.each([
    ["5000000", 5_000_000],
    ["5 000 000", 5_000_000],
    ["5,000,000", 5_000_000],
    ["120 000", 120_000],
    ["0", 0],
  ])("reads %s as whole soʻm", (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected);
  });

  it.each(["", "abc", "-5000", "1500.5", "1500,50", "12e3", "1 000 000 000 000 000 000"])(
    "refuses %s as money",
    (input) => {
      expect(parseMoneyInput(input)).toBeNull();
    },
  );

  it.each([
    ["40", 40],
    ["12.5", 12.5],
    ["12,5", 12.5],
    ["40%", 40],
    ["100", 100],
  ])("reads %s as a percent", (input, expected) => {
    expect(parsePercentInput(input)).toBe(expected);
  });

  it.each(["", "abc", "-5", "12.345", "1e2"])("refuses %s as a percent", (input) => {
    expect(parsePercentInput(input)).toBeNull();
  });
});
