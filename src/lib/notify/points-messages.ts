import { handledInApp, type StudentPush } from "./app-notify.ts";
import { deliver, type MessageLog, type Outgoing } from "./deliver.ts";
import type { PointsSummary, Texts } from "./points-data.ts";
import { dedupeKey, isQuiet, routesFor, type ChatLink, type Route } from "./rules.ts";
import { monthValue, renderTemplate, type TemplateValues } from "./templates.ts";
import type { Channel, Language, LinkRole, MessageType, Providers } from "./types.ts";

// The points messages — docs/SPEC.md → "Telegram for students and parents →
// Scheduled points messages". Telegram only, to the student's chat and the
// parent's, each in its own language. Every message has a dedupe key, so a run
// can be repeated without anything being sent twice.

export type PointsTemplate = { type: MessageType; channel: Channel; language: Language; body: string };

export type PointsSettings = {
  centreName: string;
  remindersEnabled: boolean;
  /** The points programme: off stops the weekly summary and the month results. */
  pointsEnabled: boolean;
  /** "HH:MM" */
  quietFrom: string;
  quietTo: string;
  /** 1 = Monday … 7 = Sunday */
  weeklyDay: number;
  /** "HH:MM" */
  weeklyTime: string;
};

/** Month results go out from this time on the 1st. */
export const MONTH_RESULT_TIME = "10:00";
/** An event older than this is no longer announced. */
export const EVENT_WINDOW_HOURS = 48;
/** A deduction can be undone for a few seconds: it is announced only after that. */
export const DEDUCTION_DELAY_SECONDS = 30;

export type Chats = { studentChat: ChatLink | null; parentChat: ChatLink | null };

/** A student with at least one linked chat, or with the app. */
export type LinkedStudent = Chats & { id: string };

export type DeductionEvent = Chats & {
  ledgerId: string;
  studentId: string;
  /** Points taken, above zero. */
  points: number;
  groupName: string | null;
  /** The teacher's own words, or null when a preset was used. */
  reason: string | null;
  preset: Record<Language, string> | null;
};

export type RewardEvent = Chats & {
  redemptionId: string;
  studentId: string;
  reward: string;
  cost: number;
  /** requested: received; ready: come and collect; given: handed over; rejected: declined, with the reason. */
  update: "requested" | "ready" | "given" | "rejected";
  /** Why it was rejected or cancelled. */
  note: string | null;
};

/** What the points messages read. */
export interface PointsMessageData {
  settings(): Promise<PointsSettings>;
  templates(): Promise<PointsTemplate[]>;
  /** Active students who have a chat or an app account. */
  linkedStudents(): Promise<LinkedStudent[]>;
  summary(studentId: string, month?: string): Promise<PointsSummary | null>;
  /** Teacher deductions since then that were not undone. */
  deductions(since: Date, until: Date): Promise<DeductionEvent[]>;
  /** Reward requests made or handled since then. */
  rewardEvents(since: Date): Promise<RewardEvent[]>;
}

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** The Tashkent day, time, weekday (1 = Monday … 7 = Sunday) and the Monday of that week. */
export function tashkentClock(now: Date): { day: string; time: string; month: string; weekday: number; weekStart: string } {
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const iso = local.toISOString();
  const weekday = local.getUTCDay() === 0 ? 7 : local.getUTCDay();
  const monday = new Date(local.getTime() - (weekday - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { day: iso.slice(0, 10), time: iso.slice(11, 16), month: iso.slice(0, 7), weekday, weekStart: monday };
}

function previousMonth(month: string): string {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
}

function compose(templates: readonly PointsTemplate[], type: MessageType, language: Language, values: TemplateValues): string | null {
  const template = templates.find((entry) => entry.type === type && entry.channel === "telegram" && entry.language === language);
  return template ? renderTemplate(template.body, values) : null;
}

/** The values a summary gives a template, with the phrases written in the chat's language. */
export function summaryValues(summary: PointsSummary, language: Language, centre: string, texts: Texts): TemplateValues {
  const t = texts(language);
  const group = summary.groups[0];
  return {
    student: summary.name,
    centre,
    month: monthValue(`${summary.month}-01`, language),
    week_points: String(summary.week_points),
    month_points: String(summary.month_points),
    balance: String(summary.balance),
    group: group?.name ?? "",
    group_rank: group ? String(group.rank) : "",
    centre_rank: summary.centre_rank === null ? "" : String(summary.centre_rank),
    reward: summary.next_reward?.name ?? "",
    points_needed: summary.next_reward ? String(summary.next_reward.needed) : "",
    goal: summary.next_reward ? t("goal", { points: summary.next_reward.needed, reward: summary.next_reward.name }) : "",
    bonus: summary.perfect_month_bonus > 0 ? t("bonus", { points: summary.perfect_month_bonus }) : "",
  };
}

export type PointsRunSummary = { sent: number; failed: number; duplicate: number; idle?: "reminders_off" | "quiet_hours" };

/**
 * One run, every 15 minutes with the reminders job:
 * - weekly summary on the chosen day from the chosen time, for active students;
 * - month results on the 1st from 10:00, for last month;
 * - points taken away, as soon as the Undo window has passed;
 * - reward updates: request received, handed over, rejected with the reason.
 * Nothing goes out in quiet hours: everything waits for them to end.
 */
export async function runPointsMessages(
  now: Date,
  deps: {
    data: PointsMessageData;
    log: MessageLog;
    providers: Providers;
    texts: Texts;
    /** The student app: a student who has it gets a push instead of the message in their own Telegram chat. */
    app?: StudentPush;
  },
): Promise<PointsRunSummary> {
  const result: PointsRunSummary = { sent: 0, failed: 0, duplicate: 0 };
  const settings = await deps.data.settings();
  if (!settings.remindersEnabled) return { ...result, idle: "reminders_off" };
  const clock = tashkentClock(now);
  if (isQuiet(clock.time, settings.quietFrom, settings.quietTo)) return { ...result, idle: "quiet_hours" };

  const templates = await deps.data.templates();
  const summaries = new Map<string, Promise<PointsSummary | null>>();
  const summaryOf = (studentId: string, month?: string) => {
    const key = `${studentId}:${month ?? ""}`;
    if (!summaries.has(key)) summaries.set(key, deps.data.summary(studentId, month));
    return summaries.get(key)!;
  };

  /** One message per linked chat, each in that chat's language. Never an SMS. */
  async function send(
    type: MessageType,
    studentId: string,
    chats: Chats,
    key: (role: LinkRole) => string,
    values: (language: Language) => TemplateValues | null,
  ) {
    const routes: Route[] = routesFor(type, { ...chats, parentPhone: null, phone: null });
    // The student's own copy: by push when they have the app, otherwise to their Telegram chat.
    let inApp = false;
    if (deps.app) {
      const outcome = await deps.app(studentId, type, key("student"), (language) => {
        const filled = values(language);
        return filled ? compose(templates, type, language, filled) : null;
      });
      inApp = handledInApp(outcome);
      if (outcome === "pushed") result.sent += 1;
      else if (outcome === "duplicate") result.duplicate += 1;
    }
    for (const route of routes) {
      if (route.channel !== "telegram" || !route.role || !route.language) continue;
      if (route.role === "student" && inApp) continue;
      const filled = values(route.language);
      const body = filled ? compose(templates, type, route.language, filled) : null;
      if (body === null) continue;
      const message: Outgoing = { studentId, type, channel: "telegram", recipient: route.recipient, body, dedupeKey: key(route.role) };
      const outcome = await deliver(deps.log, deps.providers, message, { now: () => now });
      result[outcome === "sent_by_sms" ? "sent" : outcome] += 1;
    }
  }

  // ── Weekly summary and month results: active students in a group ──
  const weeklyDue = settings.pointsEnabled && clock.weekday === settings.weeklyDay && clock.time >= settings.weeklyTime;
  const monthDue = settings.pointsEnabled && clock.day.endsWith("-01") && clock.time >= MONTH_RESULT_TIME;
  if (weeklyDue || monthDue) {
    const lastMonth = previousMonth(clock.month);
    for (const student of await deps.data.linkedStudents()) {
      if (weeklyDue) {
        const summary = await summaryOf(student.id);
        if (summary?.active && summary.groups.length > 0) {
          await send(
            "points_weekly",
            student.id,
            student,
            (role) => dedupeKey.weekly(student.id, role, clock.weekStart),
            (language) => summaryValues(summary, language, settings.centreName, deps.texts),
          );
        }
      }
      if (monthDue) {
        const summary = await summaryOf(student.id, lastMonth);
        if (summary?.active && summary.groups.length > 0) {
          await send(
            "points_month_result",
            student.id,
            student,
            (role) => dedupeKey.monthResult(student.id, role, lastMonth),
            (language) => summaryValues(summary, language, settings.centreName, deps.texts),
          );
        }
      }
    }
  }

  // ── Points taken away ──
  const since = new Date(now.getTime() - EVENT_WINDOW_HOURS * 60 * 60 * 1000);
  const settled = new Date(now.getTime() - DEDUCTION_DELAY_SECONDS * 1000);
  for (const event of await deps.data.deductions(since, settled)) {
    const summary = await summaryOf(event.studentId);
    if (!summary) continue;
    await send(
      "points_deduction",
      event.studentId,
      event,
      (role) => dedupeKey.deduction(event.ledgerId, role),
      (language) => ({
        ...summaryValues(summary, language, settings.centreName, deps.texts),
        points: String(event.points),
        group: event.groupName ?? "",
        reason: event.preset?.[language] ?? event.reason ?? "",
      }),
    );
  }

  // ── Reward updates ──
  for (const event of await deps.data.rewardEvents(since)) {
    const summary = await summaryOf(event.studentId);
    if (!summary) continue;
    await send(
      "reward_update",
      event.studentId,
      event,
      (role) => dedupeKey.reward(event.redemptionId, event.update, role),
      (language) => ({
        ...summaryValues(summary, language, settings.centreName, deps.texts),
        reward: event.reward,
        points: String(event.cost),
        reason: event.note ?? "",
        update: deps.texts(language)(`reward.${event.update}`, { points: event.cost, reason: event.note ?? "" }),
      }),
    );
  }

  return result;
}
