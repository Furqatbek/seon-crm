// Alerts to staff about leads waiting in the shared inbox.
// docs/SPEC.md → "Lead forms add-on → Shared inbox and staff alerts → On Telegram".
//
//   - Every lead that enters the inbox is announced once to each owner and
//     manager who linked Telegram and left alerts on.
//   - A lead still untaken 30 minutes after its alert gets one reminder.
//   - Nothing goes out in quiet hours (21:00–09:00 unless the centre changed
//     them): a lead that arrives at night is announced when they end.
//   - Staff alerts never go to a student's or a parent's chat.
// Every message is logged in the messages table under a dedupe key, so the
// job can run as often as it likes.

import { packId } from "./bot.ts";
import type { MessageLog } from "./deliver.ts";
import { isQuiet } from "./rules.ts";
import type { SendResult } from "./types.ts";

/** Staff read the interface in four languages; their alerts follow. */
export type StaffLanguage = "uz" | "ru" | "en" | "ko";
export type StaffTexts = (language: StaffLanguage) => (key: string, values?: Record<string, string | number>) => string;

export const REMINDER_AFTER_MINUTES = 30;
/** A lead older than this in the inbox is not announced any more. */
export const ALERT_WINDOW_HOURS = 72;
/** How many answers an alert shows. */
export const TOP_ANSWERS = 3;

export type InboxLead = {
  id: string;
  fullName: string;
  phone: string;
  formName: string | null;
  /** The saved answers, in order; consent and empty ones are left out when shown. */
  answers: Array<{ label: string; value: string | boolean }>;
  /** When it entered the inbox (ISO). */
  inboxSince: string;
};

export type StaffRecipient = { id: string; chatId: number | string; language: StaffLanguage };

/** A button under a Telegram message: it opens a link, or sends `data` back to the bot. */
export type AlertButton = { text: string; data?: string; url?: string };
export interface AlertSender {
  sendWithButtons(recipient: string, body: string, buttons?: AlertButton[][]): Promise<SendResult>;
}

export interface StaffAlertData {
  quietHours(): Promise<{ from: string; to: string }>;
  /** Leads waiting in the inbox since `since` or later. */
  inboxLeads(since: Date): Promise<InboxLead[]>;
  /** Active owners and managers with Telegram linked and alerts on. */
  recipients(): Promise<StaffRecipient[]>;
}

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const local = (instant: Date) => new Date(instant.getTime() + TASHKENT_OFFSET_MS).toISOString();
const tashkentTime = (instant: Date) => local(instant).slice(11, 16);
const tashkentDay = (instant: Date) => local(instant).slice(0, 10);

/**
 * When a lead's alert may first go: at once, or — when it arrived in quiet
 * hours — the moment they end (09:00 by default).
 */
export function alertDueAt(inboxSince: Date, quiet: { from: string; to: string }): Date {
  if (!isQuiet(tashkentTime(inboxSince), quiet.from, quiet.to)) return inboxSince;
  const end = new Date(`${tashkentDay(inboxSince)}T${quiet.to}:00+05:00`);
  return end.getTime() > inboxSince.getTime() ? end : new Date(end.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * What is due for a lead still in the inbox. The reminder is due 30 minutes
 * after the alert was; neither goes out during quiet hours.
 */
export function staffAlertsDue(now: Date, inboxSince: Date, quiet: { from: string; to: string }): { alert: boolean; reminder: boolean } {
  if (isQuiet(tashkentTime(now), quiet.from, quiet.to)) return { alert: false, reminder: false };
  const due = alertDueAt(inboxSince, quiet).getTime();
  return { alert: now.getTime() >= due, reminder: now.getTime() >= due + REMINDER_AFTER_MINUTES * 60_000 };
}

export const staffDedupeKey = {
  /** One alert per lead, per time it entered the inbox, per person. */
  newLead: (leadId: string, inboxSince: string, staffId: string) => `staff_new_lead:${leadId}:${Date.parse(inboxSince)}:${staffId}`,
  reminder: (leadId: string, inboxSince: string, staffId: string) => `staff_lead_reminder:${leadId}:${Date.parse(inboxSince)}:${staffId}`,
};

/** The data a Take button carries. */
export const takeData = (leadId: string) => `tk:${packId(leadId)}`;

function leadLines(t: ReturnType<StaffTexts>, lead: InboxLead): string[] {
  const lines = [lead.fullName, lead.phone];
  if (lead.formName) lines.push(t("form", { form: lead.formName }));
  const answers = lead.answers.filter((answer) => typeof answer.value === "string" && answer.value.trim() !== "").slice(0, TOP_ANSWERS);
  for (const answer of answers) lines.push(`${answer.label}: ${answer.value}`);
  return lines;
}

export function alertText(t: ReturnType<StaffTexts>, lead: InboxLead): string {
  return [t("newLead"), ...leadLines(t, lead)].join("\n");
}

export function reminderText(t: ReturnType<StaffTexts>, lead: InboxLead, waitedMinutes: number): string {
  return [t("reminder", { minutes: waitedMinutes }), ...leadLines(t, lead)].join("\n");
}

function buttons(t: ReturnType<StaffTexts>, lead: InboxLead, language: StaffLanguage, appUrl: string | null): AlertButton[][] {
  const rows: AlertButton[][] = [];
  // Telegram accepts only public https links on a button.
  if (appUrl?.startsWith("https://")) rows.push([{ text: t("open"), url: `${appUrl}/${language}/leads?lead=${lead.id}` }]);
  rows.push([{ text: t("take"), data: takeData(lead.id) }]);
  return rows;
}

export type StaffAlertSummary = { alerts: number; reminders: number; failed: number };

/** Sends what is due now. Safe to run again: nothing is sent twice. */
export async function runStaffAlerts(
  now: Date,
  deps: { data: StaffAlertData; log: MessageLog; telegram: AlertSender; texts: StaffTexts; appUrl: string | null },
): Promise<StaffAlertSummary> {
  const summary: StaffAlertSummary = { alerts: 0, reminders: 0, failed: 0 };
  const quiet = await deps.data.quietHours();
  if (isQuiet(tashkentTime(now), quiet.from, quiet.to)) return summary;

  const leads = await deps.data.inboxLeads(new Date(now.getTime() - ALERT_WINDOW_HOURS * 60 * 60 * 1000));
  if (leads.length === 0) return summary;
  const recipients = await deps.data.recipients();

  const send = async (
    type: "staff_new_lead" | "staff_lead_reminder",
    lead: InboxLead,
    person: StaffRecipient,
    body: string,
    key: string,
  ): Promise<"sent" | "failed" | "duplicate"> => {
    const recipient = String(person.chatId);
    const id = await deps.log.begin(
      { studentId: null, staffId: person.id, leadId: lead.id, type, channel: "telegram", recipient, body, dedupeKey: key },
      "queued",
    );
    if (id === null) return "duplicate";
    const result = await deps.telegram.sendWithButtons(recipient, body, buttons(deps.texts(person.language), lead, person.language, deps.appUrl));
    await deps.log.finish(id, { status: result.ok ? "sent" : "failed", error: result.ok ? null : result.error, sentAt: result.ok ? now.toISOString() : null });
    return result.ok ? "sent" : "failed";
  };

  for (const lead of leads) {
    const since = new Date(lead.inboxSince);
    const due = staffAlertsDue(now, since, quiet);
    if (!due.alert) continue;
    const waited = Math.floor((now.getTime() - alertDueAt(since, quiet).getTime()) / 60_000);
    for (const person of recipients) {
      const t = deps.texts(person.language);
      const first = await send("staff_new_lead", lead, person, alertText(t, lead), staffDedupeKey.newLead(lead.id, lead.inboxSince, person.id));
      if (first === "sent") summary.alerts += 1;
      if (first === "failed") summary.failed += 1;
      // The reminder follows an alert that already went out in an earlier run.
      if (first !== "duplicate" || !due.reminder) continue;
      const second = await send("staff_lead_reminder", lead, person, reminderText(t, lead, waited), staffDedupeKey.reminder(lead.id, lead.inboxSince, person.id));
      if (second === "sent") summary.reminders += 1;
      if (second === "failed") summary.failed += 1;
    }
  }
  return summary;
}

// ── The bot's side: linking a member of staff, and the Take button ──

export type TakeResult =
  | { taken: true; lead: { fullName: string; phone: string } }
  /** Somebody was faster; `by` is their name. */
  | { taken: false; by: string | null }
  /** The lead is gone. */
  | null;

export interface StaffBotStore {
  /** Saves this chat on the profile with that link code. Null when no active owner or manager has it. */
  linkStaff(code: string, chatId: number): Promise<{ fullName: string; language: StaffLanguage } | null>;
  /** Removes this chat from any profile; returns how many had it. */
  unlinkStaff(chatId: number): Promise<number>;
  staffByChat(chatId: number): Promise<{ id: string; fullName: string; language: StaffLanguage } | null>;
  /** The same atomic Take as in the CRM. */
  takeLead(leadId: string, staffId: string): Promise<TakeResult>;
}
