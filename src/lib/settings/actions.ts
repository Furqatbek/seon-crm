"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { appUrl } from "@/lib/app-url";
import { getCurrentUser } from "@/lib/auth";
import { getProviders } from "@/lib/notify/store";
import { connectWebhook } from "@/lib/notify/telegram-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  centreSchema,
  inviteSchema,
  notificationsSchema,
  passwordSchema,
  profileSchema,
  templateSchema,
  testSmsSchema,
  userActiveSchema,
  userRoleSchema,
  type SettingsErrorKey,
  type SettingsResult,
} from "@/lib/validation/settings";

// Everything here is written as the signed-in user, so Row Level Security and
// the guard triggers decide what is allowed. The service role is used only for
// what a user's own key cannot do: inviting, and closing a user's sessions.

const ERRORS: Record<string, SettingsErrorKey> = {
  "42501": "notAllowed",
  EU001: "lastOwner",
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
    return activated.error ? failure(activated.error) : { ok: false, error: "generic" };
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
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.user_id)
    .select("id");
  if (error) return failure(error);
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

// ── Profile: everyone, for themselves ──

export async function saveProfile(input: unknown): Promise<SettingsResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase.from("profiles").update(parsed.data).eq("id", ctx.user.id).select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notAllowed" };
  refresh();
  return { ok: true };
}

/** The language switch in the account menu: remembered on the profile for next sign-in. */
export async function saveLanguage(languageInput: unknown): Promise<void> {
  const language = profileSchema.shape.language.safeParse(languageInput);
  const ctx = await session();
  if (!language.success || !ctx) return;
  await ctx.supabase.from("profiles").update({ language: language.data }).eq("id", ctx.user.id);
}

export async function changePassword(input: unknown): Promise<SettingsResult> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "generic", detail: error.message };
  return { ok: true };
}
