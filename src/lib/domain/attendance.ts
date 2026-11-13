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
