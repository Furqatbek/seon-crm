import { describe, expect, it } from "vitest";

import {
  addDays,
  isoWeekday,
  shiftMonth,
  tashkentDate,
  tashkentDayStart,
  tashkentMonth,
  tashkentWeek,
} from "./time";

describe("tashkentMonth", () => {
  it("gives the first day of the month and of the next one", () => {
    expect(tashkentMonth(new Date("2026-11-13T06:00:00Z"))).toEqual({
      start: "2026-11-01",
      end: "2026-12-01",
    });
  });

  it("crosses the year and follows Tashkent, not UTC", () => {
    // 31 December 20:00 UTC is already 1 January in Tashkent.
    expect(tashkentMonth(new Date("2026-12-31T20:00:00Z"))).toEqual({
      start: "2027-01-01",
      end: "2027-02-01",
    });
    expect(tashkentMonth(new Date("2026-12-15T06:00:00Z"))).toEqual({
      start: "2026-12-01",
      end: "2027-01-01",
    });
  });

  it("moves by whole months", () => {
    const now = new Date("2026-01-31T06:00:00Z");
    expect(tashkentMonth(now, 1)).toEqual({ start: "2026-02-01", end: "2026-03-01" });
    expect(tashkentMonth(now, -1)).toEqual({ start: "2025-12-01", end: "2026-01-01" });
  });
});

describe("tashkentDate and tashkentDayStart", () => {
  it("agree on where a day starts", () => {
    const now = new Date("2026-11-13T20:30:00Z");
    expect(tashkentDate(now)).toBe("2026-11-14");
    expect(tashkentDate(tashkentDayStart(now))).toBe("2026-11-14");
    expect(tashkentDayStart(now)).toBe("2026-11-13T19:00:00.000Z");
  });
});

describe("weeks and day arithmetic", () => {
  it("a week runs Monday to Sunday", () => {
    // Friday 13 November 2026
    expect(tashkentWeek(new Date("2026-11-13T06:00:00Z"))).toEqual({ start: "2026-11-09", end: "2026-11-16" });
    // Sunday belongs to the week that started six days earlier.
    expect(tashkentWeek(new Date("2026-11-15T06:00:00Z"))).toEqual({ start: "2026-11-09", end: "2026-11-16" });
    // Monday starts a new one.
    expect(tashkentWeek(new Date("2026-11-16T06:00:00Z"))).toEqual({ start: "2026-11-16", end: "2026-11-23" });
    // Sunday 20:00 UTC is already Monday in Tashkent.
    expect(tashkentWeek(new Date("2026-11-15T20:00:00Z")).start).toBe("2026-11-16");
  });

  it("moves days and months across boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-13", -7)).toBe("2026-11-06");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("numbers weekdays from Monday = 1", () => {
    expect(isoWeekday("2026-11-09")).toBe(1);
    expect(isoWeekday("2026-11-13")).toBe(5);
    expect(isoWeekday("2026-11-15")).toBe(7);
  });
});
