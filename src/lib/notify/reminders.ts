import { deliver, skip, type MessageLog, type Outgoing } from "./deliver";
import {
  chooseChannel,
  dedupeKey,
  dueDate,
  isQuiet,
  lessonReminderDue,
  overdueNumber,
  paymentMessageDue,
  smsRecipient,
  type Reach,
} from "./rules";
import { amountValue, dateValue, monthValue, renderTemplate, type TemplateValues } from "./templates";
import type { Channel, Language, MessageType, Providers } from "./types";

export type NotifySettings = {
  centreName: string;
  billingDay: number;
  dueDay: number;
  remindersEnabled: boolean;
  lessonReminderHours: number;
  /** "HH:MM" */
  quietFrom: string;
  quietTo: string;
};

export type Template = { type: MessageType; channel: Channel; language: Language; body: string };

export type Recipient = Reach & { id: string; fullName: string; language: Language };

/** A student who owes money today. */
export type DebtCandidate = Recipient & {
  /** Whole soʻm, above zero. */
  debt: number;
  /** Billing months ("YYYY-MM") the student has a monthly fee for. */
  chargedMonths: string[];
};

export type LessonCandidate = {
  lessonId: string;
  groupName: string;
  /** "YYYY-MM-DD" and "HH:MM", Tashkent time. */
  lessonDate: string;
  startTime: string;
  /** Students active in the group. */
  students: Recipient[];
};

/** What the reminders job reads. */
export interface ReminderData {
  settings(): Promise<NotifySettings>;
  templates(): Promise<Template[]>;
  /** Students with a balance below zero. */
  debtors(): Promise<DebtCandidate[]>;
  /** Lessons still scheduled on these days. */
  lessons(days: string[]): Promise<LessonCandidate[]>;
}

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** The Tashkent day and wall-clock time of an instant. */
export function tashkentNow(now: Date): { day: string; time: string; month: string } {
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MS).toISOString();
  return { day: local.slice(0, 10), time: local.slice(11, 16), month: local.slice(0, 7) };
}

function shiftMonth(month: string, by: number): string {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

/** The text of a message: the template for its type, channel and language, filled in. */
export function compose(
  templates: readonly Template[],
  type: MessageType,
  channel: Channel,
  language: Language,
  values: TemplateValues,
): string | null {
  const template = templates.find(
    (candidate) => candidate.type === type && candidate.channel === channel && candidate.language === language,
  );
  return template ? renderTemplate(template.body, values) : null;
}

/** A payment message for a debtor, on the channel that reaches them. Null if nothing does. */
export function paymentMessage(
  templates: readonly Template[],
  settings: Pick<NotifySettings, "centreName" | "dueDay">,
  type: "payment_due" | "payment_overdue",
  student: DebtCandidate,
  month: string,
  key: string,
): Outgoing | null {
  const target = chooseChannel(type, student);
  if (!target) return null;
  const body = compose(templates, type, target.channel, student.language, {
    student: student.fullName,
    month: monthValue(month, student.language),
    amount: amountValue(student.debt),
    due_date: dateValue(dueDate(month, settings.dueDay), student.language),
    centre: settings.centreName,
  });
  if (body === null) return null;
  return { studentId: student.id, type, ...target, body, dedupeKey: key };
}

export type ReminderSummary = {
  sent: number;
  failed: number;
  skipped: number;
  duplicate: number;
  /** Why nothing was done, when nothing was. */
  idle?: "reminders_off";
};

/**
 * One run of the reminders job (every 15 minutes):
 * - payment due at 10:00 on the billing day, when this month's fee exists and
 *   the balance is below zero;
 * - payment overdue at 10:00 the day after the due day, then +7 and +14;
 * - lesson reminders N hours before a scheduled lesson, Telegram only.
 * Nothing goes out in quiet hours: payment messages wait for them to end, a
 * lesson reminder is skipped. Every message has a dedupe key, so a run can be
 * repeated or overlap another without anything being sent twice.
 */
export async function runReminders(
  now: Date,
  deps: { data: ReminderData; log: MessageLog; providers: Providers },
): Promise<ReminderSummary> {
  const summary: ReminderSummary = { sent: 0, failed: 0, skipped: 0, duplicate: 0 };
  const settings = await deps.data.settings();
  if (!settings.remindersEnabled) return { ...summary, idle: "reminders_off" };

  const clock = tashkentNow(now);
  const quiet = { from: settings.quietFrom, to: settings.quietTo };
  const templates = await deps.data.templates();
  const count = (result: "sent" | "sent_by_sms" | "failed" | "duplicate" | "skipped") => {
    summary[result === "sent_by_sms" ? "sent" : result] += 1;
  };

  // ── Payment due and overdue ──
  const previous = shiftMonth(clock.month, -1);
  const dueToday = paymentMessageDue(clock, `${clock.month}-${String(settings.billingDay).padStart(2, "0")}`, quiet);
  // An overdue reminder belongs to this month's fee or, late in its cycle, last month's.
  const overdue = [clock.month, previous]
    .map((month) => ({ month, number: overdueNumber(clock.day, month, settings.dueDay) }))
    .filter((entry) => entry.number !== null && paymentMessageDue(clock, clock.day, quiet));

  if (dueToday || overdue.length > 0) {
    for (const student of await deps.data.debtors()) {
      if (student.debt <= 0) continue;
      const planned: Array<Outgoing | null> = [];
      if (dueToday && student.chargedMonths.includes(clock.month)) {
        planned.push(
          paymentMessage(templates, settings, "payment_due", student, clock.month, dedupeKey.paymentDue(student.id, clock.month)),
        );
      }
      for (const { month, number } of overdue) {
        if (!student.chargedMonths.includes(month)) continue;
        planned.push(
          paymentMessage(
            templates,
            settings,
            "payment_overdue",
            student,
            month,
            dedupeKey.paymentOverdue(student.id, month, number!),
          ),
        );
      }
      for (const message of planned) {
        if (message) count(await deliver(deps.log, deps.providers, message, { smsFallback: smsRecipient(student), now: () => now }));
      }
    }
  }

  // ── Lesson reminders ──
  const horizon = tashkentNow(new Date(now.getTime() + settings.lessonReminderHours * 60 * 60 * 1000));
  const days = [...new Set([clock.day, horizon.day])];
  const lessonsQuiet = isQuiet(clock.time, quiet.from, quiet.to);
  for (const lesson of await deps.data.lessons(days)) {
    const startsAt = Date.parse(`${lesson.lessonDate}T${lesson.startTime}:00+05:00`);
    const minutesUntil = (startsAt - now.getTime()) / 60_000;
    if (!lessonReminderDue(minutesUntil, settings.lessonReminderHours)) continue;
    for (const student of lesson.students) {
      const target = chooseChannel("lesson_reminder", student);
      if (!target) continue;
      const body = compose(templates, "lesson_reminder", target.channel, student.language, {
        student: student.fullName,
        group: lesson.groupName,
        time: lesson.startTime,
        centre: settings.centreName,
      });
      if (body === null) continue;
      const message: Outgoing = {
        studentId: student.id,
        type: "lesson_reminder",
        ...target,
        body,
        dedupeKey: dedupeKey.lesson(lesson.lessonId, student.id),
      };
      // A reminder that would land in quiet hours is written down and not sent.
      count(lessonsQuiet ? await skip(deps.log, message) : await deliver(deps.log, deps.providers, message, { now: () => now }));
    }
  }

  return summary;
}
