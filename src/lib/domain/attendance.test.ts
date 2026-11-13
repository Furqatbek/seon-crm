import { describe, expect, it } from "vitest";

import { attendanceRate } from "./attendance";

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
