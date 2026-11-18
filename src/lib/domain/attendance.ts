// Attendance — docs/SPEC.md → "Business rules → Lessons and attendance".

export const ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/**
 * Attendance rate in whole percent: (present + late) ÷ (present + late + absent).
 * Excused is left out. Null when there is nothing to count.
 */
export function attendanceRate(marks: readonly AttendanceStatus[]): number | null {
  let attended = 0;
  let counted = 0;
  for (const mark of marks) {
    if (mark === "excused") continue;
    counted += 1;
    if (mark === "present" || mark === "late") attended += 1;
  }
  return counted === 0 ? null : Math.round((attended / counted) * 100);
}

export type AttendanceLock = "cancelled" | "future" | "tooOld" | null;

/**
 * Why a lesson's attendance cannot be marked right now, or null when it can.
 * Attendance is marked on the day of the lesson, by anyone: not before, not
 * after. The database enforces the same rule (save_attendance and the
 * attendance policies).
 */
export function attendanceLock(lesson: {
  /** "YYYY-MM-DD" */
  lessonDate: string;
  status: "scheduled" | "held" | "cancelled";
  /** "YYYY-MM-DD" in Tashkent. */
  today: string;
}): AttendanceLock {
  if (lesson.status === "cancelled") return "cancelled";
  if (lesson.lessonDate > lesson.today) return "future";
  if (lesson.lessonDate < lesson.today) return "tooOld";
  return null;
}
