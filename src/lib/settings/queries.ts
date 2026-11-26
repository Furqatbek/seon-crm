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
  | "parent_visit_alerts"
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
      "centre_name, billing_day, due_day, reminders_enabled, parent_visit_alerts, lesson_reminder_hours, quiet_from, quiet_to, telegram_bot_username",
    )
    .single();
  if (error) throw new Error(error.message);
  return { ...data, quiet_from: data.quiet_from.slice(0, 5), quiet_to: data.quiet_to.slice(0, 5) };
}

export type AppTexts = { about: Record<AppTextLanguage, string>; privacy_policy: Record<AppTextLanguage, string> };
type AppTextLanguage = "uz" | "ru" | "en" | "ko";

/** About the centre and the privacy policy for the student app, in its four languages. */
export async function getAppTexts(): Promise<AppTexts> {
  const supabase = await db();
  const { data, error } = await supabase.from("centre_settings").select("about, privacy_policy").single();
  if (error) throw new Error(error.message);
  const texts = (value: unknown) => {
    const stored = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    const of = (language: AppTextLanguage) => (typeof stored[language] === "string" ? (stored[language] as string) : "");
    return { uz: of("uz"), ru: of("ru"), en: of("en"), ko: of("ko") };
  };
  return { about: texts(data.about), privacy_policy: texts(data.privacy_policy) };
}

export type UserRow = {
  id: string;
  fullName: string;
  email: string;
  /** A kiosk signs in on the reception tablet only; its role never changes. */
  role: LoginRole | "kiosk";
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
  const profiles = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active, teacher:teachers (id, full_name)")
      // Students and app users sign up in the mobile app: they are not users of the CRM.
      .in("role", ["owner", "manager", "teacher", "kiosk"])
      .order("full_name");
  if (profiles.error) throw new Error(profiles.error.message);
  // One account at a time, by id: the list of all accounts also holds everyone
  // who signed up in the student app, and comes a page at a time.
  const accounts = admin ? await Promise.all(profiles.data.map((profile) => admin.auth.admin.getUserById(profile.id))) : [];
  const byId = new Map(accounts.flatMap((account) => (account.data.user ? [[account.data.user.id, account.data.user] as const] : [])));

  return profiles.data.map((profile) => {
    const account = byId.get(profile.id);
    return {
      id: profile.id,
      fullName: profile.full_name,
      email: account?.email ?? "",
      role: profile.role as UserRow["role"],
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

/** A person's own lead alerts: their Telegram link and the two switches. Null for a teacher, or before the inbox migration. */
export type AlertSettings = { linkUrl: string | null; linked: boolean; alertsOn: boolean; alertSound: boolean };

export async function getAlertSettings(user: { id: string }): Promise<AlertSettings | null> {
  const supabase = await db();
  const [link, switches, centre] = await Promise.all([
    supabase.rpc("my_telegram_link").maybeSingle(),
    supabase.from("profiles").select("alerts_on, alert_sound").eq("id", user.id).maybeSingle(),
    supabase.from("centre_settings").select("telegram_bot_username").maybeSingle(),
  ]);
  if (link.error || switches.error || !link.data || !switches.data) return null;
  const bot = centre.data?.telegram_bot_username;
  return {
    linkUrl: bot ? `https://t.me/${bot}?start=u_${link.data.code}` : null,
    linked: link.data.linked,
    alertsOn: switches.data.alerts_on,
    alertSound: switches.data.alert_sound,
  };
}

// ── Lead sources (owner): keys for websites that post leads ──

export type LeadSource = {
  id: string;
  name: string;
  /** The part of the key that may be shown: "lk_ab12cd34". */
  keyPrefix: string;
  fieldMap: Record<string, string>;
  formId: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
};
export type LeadSourcesData = { sources: LeadSource[]; forms: Array<{ id: string; name: string }> };

/** The sources and the funnels one can be tied to. Null while the intake migration is not applied. */
export async function getLeadSources(): Promise<LeadSourcesData | null> {
  const supabase = await db();
  const [sources, forms] = await Promise.all([
    supabase.from("intake_sources").select("id, name, key_prefix, field_map, form_id, is_active, last_used_at").order("created_at"),
    supabase.from("lead_forms").select("id, name").is("archived_at", null).order("name"),
  ]);
  if (sources.error || forms.error) return null;
  return {
    sources: sources.data.map((row) => ({
      id: row.id,
      name: row.name,
      keyPrefix: row.key_prefix,
      fieldMap: row.field_map && typeof row.field_map === "object" && !Array.isArray(row.field_map) ? (row.field_map as Record<string, string>) : {},
      formId: row.form_id,
      isActive: row.is_active,
      lastUsedAt: row.last_used_at,
    })),
    forms: forms.data,
  };
}
