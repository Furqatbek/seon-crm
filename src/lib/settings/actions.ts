"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { appUrl } from "@/lib/app-url";
import { getCurrentUser, getSignedInUser } from "@/lib/auth";
import { generateKey } from "@/lib/intake/keys";
import { getProviders } from "@/lib/notify/store";
import { botCommands } from "@/lib/notify/bot-texts";
import { connectWebhook } from "@/lib/notify/telegram-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  centreSchema,
  inviteSchema,
  notificationsSchema,
  passwordSchema,
  profileSchema,
  roomSchema,
  templateSchema,
  testSmsSchema,
  userActiveSchema,
  userRoleSchema,
  type SettingsErrorKey,
  type SettingsResult,
  leadSourceSchema,
} from "@/lib/validation/settings";

// Everything here is written as the signed-in user, so Row Level Security and
// the guard triggers decide what is allowed. The service role is used only for
// what a user's own key cannot do: inviting, and closing a user's sessions.

const ERRORS: Record<string, SettingsErrorKey> = {
  "42501": "notAllowed",
  EU001: "lastOwner",
  // Rooms: supabase/migrations/20261116100000_rooms.sql.
  "23505": "numberTaken",
  EM003: "roomInUse",
  EM004: "capacityBelowGroup",
};

type Failure = { ok: false; error: SettingsErrorKey; detail?: string };

function invalid(error: z.ZodError): Failure {
  return { ok: false, error: (error.issues[0]?.message as SettingsErrorKey) ?? "generic" };
}

function failure(error: { code?: string } | null): Failure {
  return { ok: false, error: (error?.code && ERRORS[error.code]) || "generic" };
}

async function session() {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  return supabase && user ? { supabase, user } : null;
}

/** Anyone signed in, a teacher included: for their own profile only. */
async function ownSession() {
  const [supabase, user] = await Promise.all([createClient(), getSignedInUser()]);
  return supabase && user ? { supabase, user } : null;
}

/** One login per teacher: the unique index on profiles.teacher_id. */
const linkFailure = (error: { code?: string; message?: string }): Failure =>
  error.code === "23505" ? { ok: false, error: "teacherTaken" } : failure(error);

async function ownerSession() {
  const ctx = await session();
  return ctx && ctx.user.role === "owner" ? ctx : null;
}

// ── Centre ──

export async function saveCentre(input: unknown): Promise<SettingsResult> {
  const parsed = centreSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase.from("centre_settings").update(parsed.data).eq("singleton", true).select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notAllowed" };
  refresh();
  return { ok: true };
}

// ── Rooms ──

/** Add room. Owner only; the database refuses anyone else. */
export async function createRoom(input: unknown): Promise<SettingsResult> {
  const parsed = roomSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase.from("rooms").insert(parsed.data);
  if (error) return failure(error);
  refresh();
  return { ok: true };
}

/** Edit room. A room cannot be made smaller than a group that uses it. */
export async function updateRoom(id: unknown, input: unknown): Promise<SettingsResult> {
  const roomId = z.uuid().safeParse(id);
  const parsed = roomSchema.safeParse(input);
  if (!roomId.success) return { ok: false, error: "notFound" };
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase
    .from("rooms")
    .update(parsed.data)
    .eq("id", roomId.data)
    .is("archived_at", null)
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

/** Archive room: only when no active or forming group uses it (the database checks). */
export async function archiveRoom(id: unknown): Promise<SettingsResult> {
  const roomId = z.uuid().safeParse(id);
  if (!roomId.success) return { ok: false, error: "notFound" };
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase
    .from("rooms")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", roomId.data)
    .is("archived_at", null)
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

// ── Users ──

/**
 * Invite by email. Supabase creates the account and emails a link to choose a
 * password; the profile gets the name, role and language chosen here.
 */
export async function inviteUser(input: unknown): Promise<SettingsResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "notConfigured" };

  const { email, ...profile } = parsed.data;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: profile.full_name, language: profile.language },
    redirectTo: `${await appUrl()}/${profile.language}/accept-invite`,
  });
  if (error || !data.user) {
    const taken = error?.code === "email_exists" || error?.status === 422;
    return taken ? { ok: false, error: "emailTaken" } : { ok: false, error: "generic", detail: error?.message };
  }

  // A new account starts with an inactive manager profile. The owner's own
  // rights, checked by the database, are what give it its role and switch it on.
  const activated = await ctx.supabase
    .from("profiles")
    .update({ ...profile, is_active: true })
    .eq("id", data.user.id)
    .select("id");
  if (activated.error || activated.data.length === 0) {
    // Without a usable profile the invitation leads nowhere: take it back.
    await admin.auth.admin.deleteUser(data.user.id);
    return activated.error ? linkFailure(activated.error) : { ok: false, error: "generic" };
  }
  refresh();
  return { ok: true };
}

export async function setUserRole(input: unknown): Promise<SettingsResult> {
  const parsed = userRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };
  // Changing your own role could lock you out of this very screen.
  if (parsed.data.user_id === ctx.user.id) return { ok: false, error: "notSelf" };

  const { data, error } = await ctx.supabase
    .from("profiles")
    .update({ role: parsed.data.role, teacher_id: parsed.data.teacher_id })
    .eq("id", parsed.data.user_id)
    .select("id");
  if (error) return linkFailure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

/** About a century: Supabase has no "for ever". */
const BAN_FOR_GOOD = "876000h";

/**
 * Deactivate or reactivate a user. The profile flag is what blocks them: Row
 * Level Security returns nothing to an inactive profile from that moment, and
 * the app signs them out on their next request. Banning the account as well
 * stops the session from being renewed and the password from working.
 */
export async function setUserActive(input: unknown): Promise<SettingsResult> {
  const parsed = userActiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };
  if (parsed.data.user_id === ctx.user.id) return { ok: false, error: "notSelf" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "notConfigured" };

  const { data, error } = await ctx.supabase
    .from("profiles")
    .update({ is_active: parsed.data.active })
    .eq("id", parsed.data.user_id)
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };

  const ban = await admin.auth.admin.updateUserById(parsed.data.user_id, {
    ban_duration: parsed.data.active ? "none" : BAN_FOR_GOOD,
  });
  refresh();
  // The profile is already switched; say so if the account itself could not be.
  if (ban.error) return { ok: false, error: "generic", detail: ban.error.message };
  return { ok: true };
}

// ── Notifications ──

export async function saveNotifications(input: unknown): Promise<SettingsResult> {
  const parsed = notificationsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase.from("centre_settings").update(parsed.data).eq("singleton", true).select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notAllowed" };
  refresh();
  return { ok: true };
}

/** Connect webhook: calls Telegram's setWebhook and remembers the bot's username for student links. */
export async function connectTelegramWebhook(): Promise<SettingsResult<{ username: string }>> {
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const result = await connectWebhook({
    token: process.env.TELEGRAM_BOT_TOKEN,
    secret: process.env.TELEGRAM_WEBHOOK_SECRET,
    appUrl: await appUrl(),
    commands: botCommands(),
  });
  if (!result.ok) return { ok: false, error: "generic", detail: result.error };

  const { error } = await ctx.supabase
    .from("centre_settings")
    .update({ telegram_bot_username: result.username || null })
    .eq("singleton", true);
  if (error) return failure(error);
  refresh();
  return { ok: true, data: { username: result.username } };
}

/** The text an Eskiz account in test status is allowed to send. */
const ESKIZ_TEST_TEXT = "Bu Eskiz dan test";

/** Send test SMS: one real SMS through Eskiz to the number given. */
export async function sendTestSms(input: unknown): Promise<SettingsResult> {
  const parsed = testSmsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const result = await getProviders().sms.send(parsed.data.phone, ESKIZ_TEST_TEXT);
  return result.ok ? { ok: true } : { ok: false, error: "generic", detail: result.error };
}

// ── Templates ──

export async function saveTemplate(input: unknown): Promise<SettingsResult> {
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase
    .from("message_templates")
    .upsert(parsed.data, { onConflict: "type,channel,language" });
  if (error) return failure(error);
  refresh();
  return { ok: true };
}

// ── Lead sources: keys for websites that post leads. Owner only; the database refuses anyone else. ──

const fieldMapOf = (rows: Array<{ from: string; to: string }>) => Object.fromEntries(rows.map((row) => [row.from, row.to]));

/**
 * A new source and its key. The key is returned here once and never again:
 * the database keeps only its hash and a short prefix.
 */
export async function createLeadSource(input: unknown): Promise<SettingsResult<{ key: string }>> {
  const parsed = leadSourceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { key, prefix, hash } = generateKey();
  const { error } = await ctx.supabase.from("intake_sources").insert({
    name: parsed.data.name,
    form_id: parsed.data.form_id,
    field_map: fieldMapOf(parsed.data.fields),
    key_prefix: prefix,
    key_hash: hash,
  });
  if (error) return error.code === "42501" ? { ok: false, error: "notAllowed" } : { ok: false, error: "generic" };
  refresh();
  return { ok: true, data: { key } };
}

/** Name, funnel and field map of a source. Its key stays as it is. */
export async function updateLeadSource(id: unknown, input: unknown): Promise<SettingsResult> {
  const sourceId = z.uuid().safeParse(id);
  const parsed = leadSourceSchema.safeParse(input);
  if (!sourceId.success) return { ok: false, error: "notFound" };
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase
    .from("intake_sources")
    .update({ name: parsed.data.name, form_id: parsed.data.form_id, field_map: fieldMapOf(parsed.data.fields) })
    .eq("id", sourceId.data)
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

/** Switch a source on or off. Off: its key is refused at once. */
export async function setLeadSourceActive(id: unknown, active: unknown): Promise<SettingsResult> {
  const sourceId = z.uuid().safeParse(id);
  if (!sourceId.success || typeof active !== "boolean") return { ok: false, error: "notFound" };
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { data, error } = await ctx.supabase.from("intake_sources").update({ is_active: active }).eq("id", sourceId.data).select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

export type SourceLogRow = { id: string; receivedAt: string; outcome: string; detail: string | null; leadId: string | null; leadName: string | null };

/** The last 100 requests of a source, newest first. */
export async function getLeadSourceLog(id: unknown): Promise<SettingsResult<SourceLogRow[]>> {
  const sourceId = z.uuid().safeParse(id);
  if (!sourceId.success) return { ok: false, error: "notFound" };
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { data, error } = await ctx.supabase.rpc("intake_source_log", { p_source_id: sourceId.data });
  if (error) return failure(error);
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      receivedAt: row.received_at,
      outcome: row.outcome,
      detail: row.detail,
      leadId: row.lead_id,
      leadName: row.lead_name,
    })),
  };
}

// ── Profile: everyone, for themselves ──

export async function saveProfile(input: unknown): Promise<SettingsResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await ownSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase.from("profiles").update(parsed.data).eq("id", ctx.user.id).select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notAllowed" };
  refresh();
  return { ok: true };
}

/** Lead alerts on Telegram on or off, and the sound in the browser. */
export async function saveAlertSettings(input: unknown): Promise<SettingsResult> {
  const parsed = z.object({ alerts_on: z.boolean().optional(), alert_sound: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await ownSession();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { data, error } = await ctx.supabase.from("profiles").update(parsed.data).eq("id", ctx.user.id).select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notAllowed" };
  refresh();
  return { ok: true };
}

/** Takes the person's Telegram off their profile: no more lead alerts there. */
export async function unlinkTelegram(): Promise<SettingsResult> {
  const ctx = await ownSession();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { error } = await ctx.supabase.rpc("unlink_my_telegram");
  if (error) return failure(error);
  refresh();
  return { ok: true };
}

/** The language switch in the account menu: remembered on the profile for next sign-in. */
export async function saveLanguage(languageInput: unknown): Promise<void> {
  const language = profileSchema.shape.language.safeParse(languageInput);
  const ctx = await ownSession();
  if (!language.success || !ctx) return;
  await ctx.supabase.from("profiles").update({ language: language.data }).eq("id", ctx.user.id);
}

export async function changePassword(input: unknown): Promise<SettingsResult> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await ownSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "generic", detail: error.message };
  return { ok: true };
}
