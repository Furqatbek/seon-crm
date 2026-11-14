"use server";

import { randomUUID } from "node:crypto";

import { refresh } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendMessageSchema, type NotifyErrorKey, type NotifyFailure } from "@/lib/validation/notify";

import { deliver, type Delivery } from "./deliver";
import { compose, paymentMessage, tashkentNow, type DebtCandidate } from "./reminders";
import { chooseChannel, dedupeKey, isQuiet, smsRecipient } from "./rules";
import { getNotifySettings, getProviders, getTemplates, messageLog } from "./store";
import { forChannel } from "./templates";

// Messages staff send by hand. The message row is inserted as the signed-in
// user, so Row Level Security decides who may send what; only the delivery
// status is written with the service role.

async function ready() {
  const [supabase, user, admin] = await Promise.all([createClient(), getCurrentUser(), createAdminClient()]);
  if (!supabase || !user) return "notAllowed" as const;
  if (!admin) return "notConfigured" as const;
  const settings = await getNotifySettings(supabase);
  const now = new Date();
  return { supabase, admin, settings, now, clock: tashkentNow(now), log: messageLog(supabase, admin) };
}
type Ready = Exclude<Awaited<ReturnType<typeof ready>>, string>;

/** Who is asking, and whether anything may be sent right now. */
async function context(): Promise<{ blocked: NotifyFailure; ctx: null } | { blocked: null; ctx: Ready }> {
  const ctx = await ready();
  if (typeof ctx === "string") return { blocked: { ok: false, error: ctx }, ctx: null };
  // Nothing is sent in quiet hours, by a job or by a person.
  if (isQuiet(ctx.clock.time, ctx.settings.quietFrom, ctx.settings.quietTo)) {
    return {
      blocked: { ok: false, error: "quietHours", quiet: { from: ctx.settings.quietFrom, to: ctx.settings.quietTo } },
      ctx: null,
    };
  }
  return { blocked: null, ctx };
}

function failure(error: unknown): NotifyFailure {
  const code = (error as { code?: string } | null)?.code;
  return { ok: false, error: code === "42501" ? "notAllowed" : "generic" };
}

const STUDENT = "id, full_name, language, telegram_chat_id, parent_phone, phone, archived_at";

export type MessageDraft = {
  telegramLinked: boolean;
  /** Where an SMS would go: the parent's phone, else the student's. */
  smsTo: string | null;
  /** The one-off template in the student's language, filled in, per channel. */
  drafts: { telegram: string; sms: string };
};

/** What the Send message sheet starts with. */
export async function getMessageDraft(studentIdInput: unknown): Promise<MessageDraft | null> {
  const studentId = z.uuid().safeParse(studentIdInput);
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  if (!studentId.success || !supabase || !user) return null;

  const [student, templates, settings] = await Promise.all([
    supabase.from("students").select(STUDENT).eq("id", studentId.data).maybeSingle(),
    getTemplates(supabase),
    getNotifySettings(supabase),
  ]);
  const row = student.data;
  if (!row) return null;
  // The SMS draft is shown as it will go out: plain Latin, straight apostrophes.
  const draft = (channel: "telegram" | "sms") =>
    forChannel(
      compose(templates, "custom", channel, row.language, { student: row.full_name, centre: settings.centreName }) ?? "",
      channel,
    );
  return {
    telegramLinked: row.telegram_chat_id !== null,
    smsTo: smsRecipient({ telegramChatId: row.telegram_chat_id, parentPhone: row.parent_phone, phone: row.phone }),
    drafts: { telegram: draft("telegram"), sms: draft("sms") },
  };
}

/** Send message, from the student page. `delivered` is false when the provider refused it; either way it is logged. */
export async function sendMessage(input: unknown): Promise<{ ok: true; delivered: boolean } | NotifyFailure> {
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: (parsed.error.issues[0]?.message as NotifyErrorKey) ?? "generic" };
  const { blocked, ctx } = await context();
  if (blocked) return blocked;

  const student = await ctx.supabase.from("students").select(STUDENT).eq("id", parsed.data.student_id).maybeSingle();
  if (!student.data || student.data.archived_at) return { ok: false, error: "notFound" };
  const target = chooseChannel(
    "custom",
    { telegramChatId: student.data.telegram_chat_id, parentPhone: student.data.parent_phone, phone: student.data.phone },
    parsed.data.channel,
  );
  if (!target) return { ok: false, error: "noChannel" };

  try {
    const result = await deliver(
      ctx.log,
      getProviders(),
      { studentId: student.data.id, type: "custom", ...target, body: parsed.data.body, dedupeKey: dedupeKey.custom(randomUUID()) },
      { now: () => ctx.now },
    );
    refresh();
    return { ok: true, delivered: result === "sent" };
  } catch (error) {
    return failure(error);
  }
}

type RemindOutcome = "sent" | "failed" | "already" | "noDebt" | "noTemplate" | "notFound";

/** One Remind: the payment-overdue text, by Telegram or else SMS, at most once per student per day. */
async function remind(ctx: Ready, studentId: string, templates: Awaited<ReturnType<typeof getTemplates>>): Promise<RemindOutcome> {
  const [student, balance] = await Promise.all([
    ctx.supabase.from("students").select(STUDENT).eq("id", studentId).maybeSingle(),
    ctx.supabase.from("student_balances").select("balance, oldest_unpaid_month").eq("student_id", studentId).maybeSingle(),
  ]);
  if (!student.data || student.data.archived_at) return "notFound";
  const debt = -(balance.data?.balance ?? 0);
  if (debt <= 0) return "noDebt";

  const candidate: DebtCandidate = {
    id: student.data.id,
    fullName: student.data.full_name,
    language: student.data.language,
    telegramChatId: student.data.telegram_chat_id,
    parentPhone: student.data.parent_phone,
    phone: student.data.phone,
    debt,
    chargedMonths: [],
  };
  // The reminder names the oldest month still unpaid.
  const month = (balance.data?.oldest_unpaid_month ?? ctx.clock.day).slice(0, 7);
  const message = paymentMessage(
    templates,
    ctx.settings,
    "payment_overdue",
    candidate,
    month,
    dedupeKey.remind(student.data.id, ctx.clock.day),
  );
  if (!message) return "noTemplate";

  const result: Delivery = await deliver(ctx.log, getProviders(), message, {
    smsFallback: smsRecipient(candidate),
    now: () => ctx.now,
  });
  if (result === "duplicate") return "already";
  return result === "failed" ? "failed" : "sent";
}

/** Remind, on a debtor's row. */
export async function remindDebtor(
  studentIdInput: unknown,
): Promise<{ ok: true; outcome: "sent" | "failed" | "already" } | NotifyFailure> {
  const studentId = z.uuid().safeParse(studentIdInput);
  if (!studentId.success) return { ok: false, error: "notFound" };
  const { blocked, ctx } = await context();
  if (blocked) return blocked;

  try {
    const outcome = await remind(ctx, studentId.data, await getTemplates(ctx.supabase));
    refresh();
    if (outcome === "sent" || outcome === "failed" || outcome === "already") return { ok: true, outcome };
    return { ok: false, error: outcome };
  } catch (error) {
    return failure(error);
  }
}

/** Remind all: every debtor on the list, one after another. Those reminded today are left out. */
export async function remindAllDebtors(): Promise<
  { ok: true; sent: number; failed: number; already: number } | NotifyFailure
> {
  const { blocked, ctx } = await context();
  if (blocked) return blocked;

  try {
    const [debtors, templates] = await Promise.all([
      ctx.supabase.rpc("list_debtors", { p_limit: 1000, p_offset: 0 }),
      getTemplates(ctx.supabase),
    ]);
    if (debtors.error) return failure(debtors.error);
    const totals = { sent: 0, failed: 0, already: 0 };
    for (const debtor of debtors.data) {
      const outcome = await remind(ctx, debtor.student_id, templates);
      if (outcome === "sent" || outcome === "failed" || outcome === "already") totals[outcome] += 1;
    }
    refresh();
    return { ok: true, ...totals };
  } catch (error) {
    return failure(error);
  }
}
