import { describe, expect, it } from "vitest";

import { monthsBetween, resolvePeriod } from "./report-period";

const NOW = "2026-11";

describe("resolvePeriod", () => {
  it("this month and last month are one month", () => {
    expect(resolvePeriod({ period: "this" }, NOW)).toEqual({ period: "this", from: "2026-11", to: "2026-11" });
    expect(resolvePeriod({ period: "last" }, NOW)).toEqual({ period: "last", from: "2026-10", to: "2026-10" });
    expect(resolvePeriod({ period: "last" }, "2027-01")).toMatchObject({ from: "2026-12", to: "2026-12" });
  });

  it("3, 6 and 12 months end with the current month", () => {
    expect(resolvePeriod({ period: "3" }, NOW)).toMatchObject({ from: "2026-09", to: "2026-11" });
    expect(resolvePeriod({ period: "6" }, NOW)).toMatchObject({ from: "2026-06", to: "2026-11" });
    expect(resolvePeriod({ period: "12" }, NOW)).toMatchObject({ from: "2025-12", to: "2026-11" });
  });

  it("a custom range is kept as given", () => {
    expect(resolvePeriod({ period: "custom", from: "2026-03", to: "2026-08" }, NOW)).toEqual({
      period: "custom",
      from: "2026-03",
      to: "2026-08",
    });
    expect(resolvePeriod({ period: "custom", from: "2026-08", to: "2026-08" }, NOW)).toMatchObject({ from: "2026-08", to: "2026-08" });
  });

  it("a custom range never runs past the current month or over 36 months", () => {
    expect(resolvePeriod({ period: "custom", from: "2026-09", to: "2027-03" }, NOW)).toMatchObject({ from: "2026-09", to: "2026-11" });
    expect(resolvePeriod({ period: "custom", from: "2020-01", to: "2026-11" }, NOW)).toMatchObject({ from: "2023-12", to: "2026-11" });
    expect(monthsBetween("2023-12", "2026-11")).toHaveLength(36);
  });

  it("a custom range that makes no sense falls back to this month", () => {
    const fallback = { period: "this", from: NOW, to: NOW };
    expect(resolvePeriod({ period: "custom" }, NOW)).toEqual(fallback);
    expect(resolvePeriod({ period: "custom", from: "2026-09", to: "2026-05" }, NOW)).toEqual(fallback);
    expect(resolvePeriod({ period: "custom", from: "2027-01", to: "2027-02" }, NOW)).toEqual(fallback);
    expect(resolvePeriod({ period: "custom", from: "2026-13", to: "2026-11" }, NOW)).toEqual(fallback);
    expect(resolvePeriod({ period: "custom", from: "nonsense", to: "2026-11" }, NOW)).toEqual(fallback);
  });
});

describe("monthsBetween", () => {
  it("lists every month, both ends included, across a year end", () => {
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthsBetween("2026-11", "2026-11")).toEqual(["2026-11"]);
    expect(monthsBetween("2026-12", "2026-11")).toEqual([]);
  });
});
