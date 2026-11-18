import { describe, expect, it } from "vitest";

import { attendanceLock, attendanceRate } from "./attendance";

describe("attendanceRate", () => {
  it("counts present and late as attended", () => {
    expect(attendanceRate(["present", "present", "late", "absent"])).toBe(75);
    expect(attendanceRate(["present", "late"])).toBe(100);
    expect(attendanceRate(["absent", "absent"])).toBe(0);
  });

  it("leaves excused out of both sides", () => {
    expect(attendanceRate(["present", "excused", "excused"])).toBe(100);
    expect(attendanceRate(["present", "absent", "excused"])).toBe(50);
  });

  it("is null when there is nothing to count", () => {
    expect(attendanceRate([])).toBeNull();
    expect(attendanceRate(["excused"])).toBeNull();
  });

  it("rounds to a whole percent", () => {
    expect(attendanceRate(["present", "present", "absent"])).toBe(67);
    expect(attendanceRate(["present", "absent", "absent"])).toBe(33);
  });
});

describe("attendanceLock", () => {
  const today = "2026-11-13";
  const lock = (lessonDate: string, status: "scheduled" | "held" | "cancelled" = "scheduled") =>
    attendanceLock({ lessonDate, status, today });

  it("today's lesson can be marked, also once it is held", () => {
    expect(lock("2026-11-13")).toBeNull();
    expect(lock("2026-11-13", "held")).toBeNull();
  });

  it("a past day is closed to everyone, even yesterday", () => {
    expect(lock("2026-11-12")).toBe("tooOld");
    expect(lock("2026-11-12", "held")).toBe("tooOld");
    expect(lock("2026-09-01", "held")).toBe("tooOld");
  });

  it("a lesson that has not happened or was cancelled cannot be marked", () => {
    expect(lock("2026-11-14")).toBe("future");
    expect(lock("2026-11-13", "cancelled")).toBe("cancelled");
    expect(lock("2026-11-10", "cancelled")).toBe("cancelled");
  });
});
