import "server-only";

import { appUrl } from "@/lib/app-url";
import type { LoginRole } from "@/lib/validation/settings";
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
  role: LoginRole;
  /** The teacher record a teacher login belongs to. */
  teacher: { id: string; name: string } | null;
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
    supabase.from("profiles").select("id, full_name, role, is_active, teacher:teachers (id, full_name)").order("full_name"),
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
      role: profile.role,
      teacher: profile.teacher ? { id: profile.teacher.id, name: profile.teacher.full_name } : null,
      status: !profile.is_active ? "deactivated" : account && !account.last_sign_in_at ? "invited" : "active",
      isSelf: profile.id === currentUserId,
    };
  });
}

export type TeacherOption = { id: string; name: string; hasLogin: boolean };

/** The teachers a login can be linked to, and whether each already has one. */
export async function getTeacherOptions(): Promise<TeacherOption[]> {
  const supabase = await db();
  const [teachers, linked] = await Promise.all([
    supabase.from("teachers").select("id, full_name").is("archived_at", null).eq("is_active", true).order("full_name"),
    supabase.from("profiles").select("teacher_id").not("teacher_id", "is", null),
  ]);
  if (teachers.error) throw new Error(teachers.error.message);
  if (linked.error) throw new Error(linked.error.message);
  const taken = new Set(linked.data.map((row) => row.teacher_id));
  return teachers.data.map((teacher) => ({ id: teacher.id, name: teacher.full_name, hasLogin: taken.has(teacher.id) }));
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

export type Profile = { fullName: string; language: "uz" | "ru" | "en" | "ko"; email: string };

export async function getProfile(user: { id: string; email: string }): Promise<Profile> {
  const supabase = await db();
  const { data, error } = await supabase.from("profiles").select("full_name, language").eq("id", user.id).single();
  if (error) throw new Error(error.message);
  return { fullName: data.full_name, language: data.language, email: user.email };
}

export type RoomRow = Pick<Tables<"rooms">, "id" | "number" | "name" | "capacity" | "is_active"> & {
  /** The groups that use the room now: active or forming, not archived. */
  groups: Array<{ id: string; name: string }>;
};

/** Every room that is not archived, by number, with the groups using it. */
export async function getRooms(): Promise<RoomRow[]> {
  const supabase = await db();
  const [rooms, groups] = await Promise.all([
    supabase.from("rooms").select("id, number, name, capacity, is_active").is("archived_at", null),
    supabase
      .from("groups")
      .select("id, name, room_id")
      .not("room_id", "is", null)
      .is("archived_at", null)
      .in("status", ["active", "forming"])
      .order("name"),
  ]);
  if (rooms.error) throw new Error(rooms.error.message);
  if (groups.error) throw new Error(groups.error.message);
  return rooms.data
    .map((room) => ({
      ...room,
      groups: groups.data.filter((group) => group.room_id === room.id).map(({ id, name }) => ({ id, name })),
    }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}
