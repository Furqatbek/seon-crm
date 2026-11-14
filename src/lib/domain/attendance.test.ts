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
  const lock = (lessonDate: string, role: "owner" | "manager", status: "scheduled" | "held" | "cancelled" = "scheduled") =>
    attendanceLock({ lessonDate, status, today, role });

  it("today's and recent lessons can be marked by both", () => {
    expect(lock("2026-11-13", "manager")).toBeNull();
    expect(lock("2026-11-10", "manager", "held")).toBeNull();
    expect(lock("2026-11-13", "owner")).toBeNull();
  });

  it("a manager has 7 days; the owner has no limit", () => {
    expect(lock("2026-11-06", "manager")).toBeNull(); // exactly 7 days ago
    expect(lock("2026-11-05", "manager")).toBe("tooOld");
    expect(lock("2026-09-01", "manager", "held")).toBe("tooOld");
    expect(lock("2026-09-01", "owner", "held")).toBeNull();
  });

  it("a lesson that has not happened or was cancelled cannot be marked by anyone", () => {
    expect(lock("2026-11-14", "owner")).toBe("future");
    expect(lock("2026-11-14", "manager")).toBe("future");
    expect(lock("2026-11-10", "owner", "cancelled")).toBe("cancelled");
  });
});
