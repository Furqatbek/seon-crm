import type { Channel, MessageType } from "./types";

// When messages go out and to whom. All times are Tashkent wall-clock
// ("HH:MM"), all days "YYYY-MM-DD".

/** Payment messages go out from this time on their day. */
export const PAYMENT_SEND_TIME = "10:00";
/** Payment overdue: the day after the due day, then every 7 days, 3 times at most. */
export const OVERDUE_OFFSETS = [1, 8, 15] as const;
/** The job runs every 15 minutes; a lesson reminder may leave this much late. */
export const LESSON_WINDOW_MINUTES = 30;

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * True inside quiet hours, when nothing is sent. `from` is included, `to` is
 * not: with 21:00–09:00, 21:00 is quiet and 09:00 is not. The hours may run
 * over midnight; from = to means there are none.
 */
export function isQuiet(time: string, quietFrom: string, quietTo: string): boolean {
  const now = minutes(time);
  const from = minutes(quietFrom);
  const to = minutes(quietTo);
  if (from === to) return false;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/**
 * Whether a payment message planned for a day can go now: on that day, from
 * 10:00, and outside quiet hours — if 10:00 is quiet, it waits until they end.
 */
export function paymentMessageDue(
  now: { day: string; time: string },
  plannedDay: string,
  quiet: { from: string; to: string },
): boolean {
  return now.day === plannedDay && now.time >= PAYMENT_SEND_TIME && !isQuiet(now.time, quiet.from, quiet.to);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The day a billing month ("YYYY-MM") is due. */
export function dueDate(month: string, dueDay: number): string {
  return `${month}-${String(dueDay).padStart(2, "0")}`;
}

/** The three days an overdue reminder for a billing month goes out. */
export function overdueDays(month: string, dueDay: number): string[] {
  return OVERDUE_OFFSETS.map((offset) => addDays(dueDate(month, dueDay), offset));
}

/**
 * Which overdue reminder (1, 2 or 3) of a billing month falls on a day, or
 * null: the day after the due day, +7, +14, and then no more.
 */
export function overdueNumber(day: string, month: string, dueDay: number): 1 | 2 | 3 | null {
  const index = overdueDays(month, dueDay).indexOf(day);
  return index === -1 ? null : ((index + 1) as 1 | 2 | 3);
}

/**
 * Whether a lesson's reminder goes now: the lesson starts N hours from now,
 * give or take the job's 30-minute window. A lesson created later than that
 * gets no late reminder.
 */
export function lessonReminderDue(minutesUntilLesson: number, hoursBefore: number): boolean {
  const lead = hoursBefore * 60;
  return minutesUntilLesson <= lead && minutesUntilLesson > lead - LESSON_WINDOW_MINUTES;
}

export type Reach = {
  telegramChatId: number | string | null;
  parentPhone: string | null;
  phone: string | null;
};

/** SMS goes to the parent's phone when there is one, otherwise the student's. */
export function smsRecipient(reach: Reach): string | null {
  return reach.parentPhone || reach.phone || null;
}

/**
 * Where a message goes.
 * - Payment messages and Remind: Telegram when linked, else SMS.
 * - Lesson reminders: Telegram only.
 * - Custom: the channel staff chose, if the student can be reached on it.
 */
export function chooseChannel(
  type: MessageType,
  reach: Reach,
  requested?: Channel,
): { channel: Channel; recipient: string } | null {
  const telegram = reach.telegramChatId !== null && reach.telegramChatId !== "" ? String(reach.telegramChatId) : null;
  const sms = smsRecipient(reach);
  const viaTelegram = telegram ? { channel: "telegram" as const, recipient: telegram } : null;
  const viaSms = sms ? { channel: "sms" as const, recipient: sms } : null;

  if (type === "custom" && requested) return requested === "telegram" ? viaTelegram : viaSms;
  if (type === "lesson_reminder") return viaTelegram;
  return viaTelegram ?? viaSms;
}

/** Whether a failed Telegram message is tried again by SMS. Lesson reminders are Telegram only. */
export function fallsBackToSms(type: MessageType): boolean {
  return type === "payment_due" || type === "payment_overdue";
}

// One key per message that must never be sent twice.
export const dedupeKey = {
  paymentDue: (studentId: string, month: string) => `payment_due:${studentId}:${month}`,
  paymentOverdue: (studentId: string, month: string, number: number) => `payment_overdue:${studentId}:${month}:${number}`,
  lesson: (lessonId: string, studentId: string) => `lesson_reminder:${lessonId}:${studentId}`,
  /** Remind: at most once per student per day. */
  remind: (studentId: string, day: string) => `remind:${studentId}:${day}`,
  custom: (id: string) => `custom:${id}`,
  /** The SMS sent because the Telegram message with this key failed. */
  smsFallback: (key: string) => `${key}:sms`,
};
