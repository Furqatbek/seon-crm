import "server-only";

import { appUrl } from "@/lib/app-url";
import type { UserRole } from "@/lib/auth";
import type { Template } from "@/lib/notify/reminders";
import { getTemplates } from "@/lib/notify/store";
import { getBotStatus, webhookUrl, type BotStatus } from "@/lib/notify/telegram-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export type CentreSettings = Pick<
  Tables<"centre_settings">,
  | "centre_name"
  | "billing_day"
  | "due_day"
  | "reminders_enabled"
  | "lesson_reminder_hours"
  | "quiet_from"
  | "quiet_to"
  | "telegram_bot_username"
>;

export async function getCentreSettings(): Promise<CentreSettings> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("centre_settings")
    .select(
      "centre_name, billing_day, due_day, reminders_enabled, lesson_reminder_hours, quiet_from, quiet_to, telegram_bot_username",
    )
    .single();
  if (error) throw new Error(error.message);
  return { ...data, quiet_from: data.quiet_from.slice(0, 5), quiet_to: data.quiet_to.slice(0, 5) };
}

export type UserRow = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  /** active: can sign in. invited: has not accepted the invitation yet. deactivated: blocked. */
  status: "active" | "invited" | "deactivated";
  isSelf: boolean;
};

/**
 * Everyone with a login. Names and roles come from profiles, which only
 * staff can read; emails live in Supabase Auth and are read with the service
 * role, so this is only ever called for the owner.
 */
export async function getUsers(currentUserId: string): Promise<UserRow[]> {
  const supabase = await db();
  const admin = createAdminClient();
  const [profiles, accounts] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, is_active").order("full_name"),
    admin ? admin.auth.admin.listUsers({ perPage: 1000 }) : null,
  ]);
  if (profiles.error) throw new Error(profiles.error.message);
  const byId = new Map((accounts?.data.users ?? []).map((account) => [account.id, account]));

  return profiles.data.map((profile) => {
    const account = byId.get(profile.id);
    return {
      id: profile.id,
      fullName: profile.full_name,
      email: account?.email ?? "",
      role: profile.role === "owner" ? "owner" : "manager",
      status: !profile.is_active ? "deactivated" : account && !account.last_sign_in_at ? "invited" : "active",
      isSelf: profile.id === currentUserId,
    };
  });
}

export type Integrations = {
  telegram: BotStatus;
  /** The address Telegram is asked to call. */
  webhookUrl: string;
  /** Telegram only calls https addresses. */
  webhookPossible: boolean;
  eskiz: { configured: boolean; sender: string | null };
  /** False while SUPABASE_SECRET_KEY is missing: nothing can be sent or invited. */
  serverReady: boolean;
};

/** Whether the bot and the SMS account are set up, without showing any secret. */
export async function getIntegrations(): Promise<Integrations> {
  const url = await appUrl();
  return {
    telegram: await getBotStatus({ token: process.env.TELEGRAM_BOT_TOKEN, appUrl: url }),
    webhookUrl: webhookUrl(url),
    webhookPossible: url.startsWith("https://") && Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    eskiz: {
      configured: Boolean(process.env.ESKIZ_EMAIL && process.env.ESKIZ_PASSWORD),
      sender: process.env.ESKIZ_SENDER || null,
    },
    serverReady: Boolean(process.env.SUPABASE_SECRET_KEY),
  };
}

export async function getAllTemplates(): Promise<Template[]> {
  return getTemplates(await db());
}

export type Profile = { fullName: string; language: "uz" | "ru" | "en"; email: string };

export async function getProfile(user: { id: string; email: string }): Promise<Profile> {
  const supabase = await db();
  const { data, error } = await supabase.from("profiles").select("full_name, language").eq("id", user.id).single();
  if (error) throw new Error(error.message);
  return { fullName: data.full_name, language: data.language, email: user.email };
}
