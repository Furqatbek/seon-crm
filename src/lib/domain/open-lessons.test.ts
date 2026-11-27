import { describe, expect, it } from "vitest";

import { addDays, conversionPercent, isoWeekday, sessionsOf } from "./open-lessons";

describe("open lesson sessions", () => {
  it("knows the weekday of a date, Monday first", () => {
    expect(isoWeekday("2026-11-23")).toBe(1);
    expect(isoWeekday("2026-11-27")).toBe(5);
    expect(isoWeekday("2026-11-29")).toBe(7);
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-11-27", 4)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("lists every session of the next four weeks, the earliest first", () => {
    const slots = [
      { id: "sat", weekday: 6, start_time: "11:00:00" },
      { id: "wed-late", weekday: 3, start_time: "18:30:00" },
      { id: "wed", weekday: 3, start_time: "10:00:00" },
    ];
    const sessions = sessionsOf(slots, "2026-11-27", 28);
    // Four Saturdays and four Wednesdays with two lessons each.
    expect(sessions.length).toBe(12);
    expect(sessions.slice(0, 4)).toEqual([
      { slotId: "sat", date: "2026-11-28", startTime: "11:00" },
      { slotId: "wed", date: "2026-12-02", startTime: "10:00" },
      { slotId: "wed-late", date: "2026-12-02", startTime: "18:30" },
      { slotId: "sat", date: "2026-12-05", startTime: "11:00" },
    ]);
    expect(sessions.at(-1)).toEqual({ slotId: "wed-late", date: "2026-12-23", startTime: "18:30" });
    expect(sessionsOf(slots, "2026-11-27", 0)).toEqual([]);
  });

  it("works out how many vouchers turned into enrolments", () => {
    expect(conversionPercent(0, 0)).toBeNull();
    expect(conversionPercent(8, 2)).toBe(25);
    expect(conversionPercent(3, 1)).toBe(33);
    expect(conversionPercent(3, 3)).toBe(100);
  });
});
