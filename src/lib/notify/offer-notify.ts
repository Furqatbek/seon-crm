import { addDays } from "../domain/open-lessons.ts";
import { formatDate } from "../format.ts";
import { notifyAccount, type AppAccount, type AppNotifyDeps, type AppRunSummary, type AppTexts } from "./app-notify.ts";
import { tashkentNow } from "./reminders.ts";
import { isQuiet } from "./rules.ts";

// Pushes about the offer an App user got — docs/STUDENT_APP_SPEC.md → "Rules
// → Vouchers" (a push 3 days before expiry) and "Rules → Free open lessons"
// (pushes at 18:00 the evening before and 2 hours before). They ride on the
// job that runs every 15 minutes; every push has a dedupe key, so a person is
// told once however often the job runs.

export type ExpiringVoucher = { id: string; code: string; expiresAt: string; account: AppAccount };

export type BookedLesson = {
  bookingId: string;
  title: string;
  /** "YYYY-MM-DD" and "HH:MM", Tashkent time. */
  sessionDate: string;
  startTime: string;
  account: AppAccount;
};

export interface OfferEventData {
  quietHours(): Promise<{ from: string; to: string }>;
  /** Vouchers still valid that expire by then, of people who still have their account. */
  expiringVouchers(now: Date, until: Date): Promise<ExpiringVoucher[]>;
  /** Bookings still "booked" for sessions on these Tashkent days. */
  bookedLessons(days: string[]): Promise<BookedLesson[]>;
}

export const VOUCHER_REMINDER_DAYS = 3;
/** The evening-before reminder goes from this time, Tashkent. */
export const EVENING_FROM = "18:00";
export const SOON_HOURS = 2;

/** When a session starts, as an instant: Tashkent is UTC+5 all year. */
export const lessonStart = (lesson: Pick<BookedLesson, "sessionDate" | "startTime">) => new Date(`${lesson.sessionDate}T${lesson.startTime}:00+05:00`);

/**
 * Which reminder of a booked lesson is due now: "soon" in its last two hours
 * before the start, "evening" from 18:00 on the day before; null otherwise.
 */
export function lessonReminderDue(now: Date, lesson: Pick<BookedLesson, "sessionDate" | "startTime">): "evening" | "soon" | null {
  const left = lessonStart(lesson).getTime() - now.getTime();
  if (left <= 0) return null;
  if (left <= SOON_HOURS * 60 * 60 * 1000) return "soon";
  const { day, time } = tashkentNow(now);
  return day === addDays(lesson.sessionDate, -1) && time >= EVENING_FROM ? "evening" : null;
}

/**
 * One run: the voucher reminder for vouchers within 3 days of expiring, and
 * the two reminders of each booked open lesson. Nothing is sent in quiet
 * hours: the voucher reminder waits for the morning, a lesson reminder that
 * falls in them is skipped, as the CRM's lesson reminders are.
 */
export async function runOfferNotifications(now: Date, deps: AppNotifyDeps & { data: OfferEventData; texts: AppTexts }): Promise<AppRunSummary> {
  const summary: AppRunSummary = { pushed: 0, stored: 0, duplicate: 0 };
  const quiet = await deps.data.quietHours();
  const { day, time } = tashkentNow(now);
  if (isQuiet(time, quiet.from, quiet.to)) return summary;
  const count = (outcome: Awaited<ReturnType<typeof notifyAccount>>) => {
    if (outcome !== "none") summary[outcome] += 1;
  };

  const vouchers = await deps.data.expiringVouchers(now, new Date(now.getTime() + VOUCHER_REMINDER_DAYS * 24 * 60 * 60 * 1000));
  for (const voucher of vouchers) {
    const t = deps.texts(voucher.account.language);
    count(
      await notifyAccount(deps, voucher.account, {
        type: "voucher_expiring",
        title: t("voucher_expiring.title"),
        body: t("voucher_expiring.body", { code: voucher.code, date: formatDate(voucher.expiresAt, voucher.account.language, { month: "long" }) }),
        data: { screen: "voucher" },
        dedupeKey: `voucher_expiring:${voucher.id}`,
      }),
    );
  }

  // Today's lessons (two hours before) and tomorrow's (the evening before).
  for (const lesson of await deps.data.bookedLessons([day, addDays(day, 1)])) {
    const due = lessonReminderDue(now, lesson);
    if (!due) continue;
    const t = deps.texts(lesson.account.language);
    count(
      await notifyAccount(deps, lesson.account, {
        type: "open_lesson_reminder",
        title: t("open_lesson.title"),
        body: t(`open_lesson.${due}`, { time: lesson.startTime, title: lesson.title }),
        data: { screen: "open_lessons" },
        dedupeKey: `open_lesson:${lesson.bookingId}:${due}`,
      }),
    );
  }
  return summary;
}
