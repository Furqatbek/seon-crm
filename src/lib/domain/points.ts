/**
 * Point rules — docs/SPEC.md → "Points and rewards add-on → Point rules".
 * Pure functions. The database enforces the same rules in
 * supabase/migrations/20261120100000_points_engine.sql; keep the two in step.
 */
import type { AttendanceStatus } from "./attendance";

export type PointsSettings = {
  enabled: boolean;
  present: number;
  late: number;
  perfect_month: number;
  perfect_month_min_lessons: number;
  on_time: number;
  referral: number;
  max_per_action: number;
  teacher_daily_cap: number;
  /** The 1v1 game: coins for a win, rewarded wins a day, rewarded games a day between the same two, and the active questions a bank needs. */
  game_win_coins: number;
  game_daily_rewarded_wins: number;
  game_pair_daily_cap: number;
  game_min_questions: number;
};

export const DEFAULT_POINTS_SETTINGS: PointsSettings = {
  enabled: true,
  present: 2,
  late: 1,
  perfect_month: 10,
  perfect_month_min_lessons: 4,
  on_time: 10,
  referral: 50,
  max_per_action: 5,
  teacher_daily_cap: 10,
  game_win_coins: 5,
  game_daily_rewarded_wins: 5,
  game_pair_daily_cap: 2,
  game_min_questions: 30,
};

/** The sources points are earned from, in the order the report stacks them. */
export const EARNED_SOURCES = ["attendance", "teacher_award", "perfect_month", "on_time_payment", "referral", "owner_adjustment"] as const;
export type EarnedSource = (typeof EARNED_SOURCES)[number];

/** Sources that are spending, not earning: left out of rankings. */
export const REWARD_SOURCES = ["reward_hold", "reward_return"] as const;

/** What a mark is worth. A cancelled lesson, or no mark, is worth nothing. */
export function attendanceTarget(
  status: AttendanceStatus | null,
  settings: Pick<PointsSettings, "present" | "late">,
  lessonCancelled = false,
): number {
  if (lessonCancelled) return 0;
  if (status === "present") return settings.present;
  if (status === "late") return settings.late;
  return 0;
}

/**
 * The row to post when a mark is saved or changed: what the mark is worth now
 * minus what was already posted for that student and lesson. 0 posts nothing,
 * and so does a programme that is switched off.
 */
export function attendanceDelta(
  status: AttendanceStatus | null,
  alreadyPosted: number,
  settings: Pick<PointsSettings, "enabled" | "present" | "late">,
  lessonCancelled = false,
): number {
  if (!settings.enabled) return 0;
  return attendanceTarget(status, settings, lessonCancelled) - alreadyPosted;
}

/**
 * A perfect month in one group: enough held lessons marked, none Absent.
 * Late and Excused are allowed.
 */
export function isPerfectMonth(
  marks: readonly AttendanceStatus[],
  settings: Pick<PointsSettings, "perfect_month_min_lessons">,
): boolean {
  return marks.length >= settings.perfect_month_min_lessons && !marks.includes("absent");
}

/**
 * Fee paid on time: the student has a fee for that month, and the payments
 * made by the end of the due day cover everything charged up to that month.
 * A prorated first month counts like any other fee.
 */
export function isPaidOnTime(input: {
  /** Monthly fees of that month, whole soʻm. */
  monthFees: readonly number[];
  /** Everything charged up to and including that month (credits are negative). */
  chargedByDueDay: number;
  /** Payments that are not voided, made by the end of the due day. */
  paidByDueDay: number;
}): boolean {
  return input.monthFees.some((fee) => fee > 0) && input.paidByDueDay >= input.chargedByDueDay;
}

export type AwardCheck =
  | { ok: true; /** Signed points that will be posted; 0 when there is nothing to take. */ applied: number }
  | { ok: false; error: "programmeOff" | "amountInvalid" | "reasonRequired" | "dailyLimit"; left?: number };

/**
 * A teacher's award (positive) or deduction (negative).
 * - 1 to max_per_action points per action;
 * - a custom amount needs a reason, a preset carries its own;
 * - a deduction is reduced to the student's balance;
 * - today's awards from this teacher to this student stay within the daily
 *   cap, and so do today's deductions.
 */
export function checkAward(input: {
  points: number;
  fromPreset: boolean;
  reason: string;
  balance: number;
  /** Points this teacher already gave this student today (awards), undone ones taken out. */
  awardedToday: number;
  /** Points this teacher already took from this student today, as a positive number. */
  deductedToday: number;
  settings: Pick<PointsSettings, "enabled" | "max_per_action" | "teacher_daily_cap">;
}): AwardCheck {
  const { points, settings } = input;
  if (!settings.enabled) return { ok: false, error: "programmeOff" };
  if (!input.fromPreset && input.reason.trim() === "") return { ok: false, error: "reasonRequired" };
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > settings.max_per_action) {
    return { ok: false, error: "amountInvalid" };
  }

  const applied = points > 0 ? points : -Math.min(-points, Math.max(input.balance, 0));
  if (applied === 0) return { ok: true, applied: 0 };

  const used = applied > 0 ? input.awardedToday : input.deductedToday;
  if (used + Math.abs(applied) > settings.teacher_daily_cap) {
    return { ok: false, error: "dailyLimit", left: Math.max(settings.teacher_daily_cap - used, 0) };
  }
  return { ok: true, applied };
}

/** The Undo button shows for this long after an award or deduction. */
export const UNDO_SECONDS = 10;
