import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type { BotStore, RequestOutcome } from "./bot";
import type { MessageLog } from "./deliver";
import { EskizProvider } from "./eskiz";
import type { BotTop, PointsSummary } from "./points-data";
import type { Chats, DeductionEvent, PointsMessageData, RewardEvent } from "./points-messages";
import type { LessonCandidate, NotifySettings, ReminderData, Template } from "./reminders";
import type { ChatLink } from "./rules";
import type { InboxLead, StaffAlertData, StaffBotStore, StaffLanguage } from "./staff-alerts";
import { TelegramProvider } from "./telegram";
import type { Language, LinkRole, Providers } from "./types";

type Db = SupabaseClient<Database>;

// One Eskiz provider per server instance, so its token is logged in for once.
let providers: (Providers & { telegram: TelegramProvider }) | undefined;

/** The real providers, from the environment. Unconfigured ones fail every send with a clear error. */
export function getProviders(): Providers & { telegram: TelegramProvider } {
  providers ??= {
    telegram: new TelegramProvider({ token: process.env.TELEGRAM_BOT_TOKEN }),
    sms: new EskizProvider({
      email: process.env.ESKIZ_EMAIL,
      password: process.env.ESKIZ_PASSWORD,
      sender: process.env.ESKIZ_SENDER,
    }),
  };
  return providers;
}

/**
 * The messages table as a log. `writer` inserts the row: the signed-in user
 * for a message staff send (so Row Level Security decides who may), the
 * service role for the job. The delivery status is always written by `admin`.
 */
export function messageLog(writer: Db, admin: Db): MessageLog {
  return {
    async begin(message, status) {
      const { data, error } = await writer
        .from("messages")
        .insert({
          student_id: message.studentId,
          staff_id: message.staffId ?? null,
          lead_id: message.leadId ?? null,
          type: message.type,
          channel: message.channel,
          recipient: message.recipient,
          body: message.body,
          dedupe_key: message.dedupeKey,
          status,
        })
        .select("id")
        .single();
      // The unique dedupe key: this message was already written.
      if (error?.code === "23505") return null;
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data.id;
    },
    async finish(id, result) {
      const { error } = await admin
        .from("messages")
        .update({ status: result.status, error: result.error, sent_at: result.sentAt })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}

export async function getNotifySettings(db: Db): Promise<NotifySettings> {
  const { data, error } = await db
    .from("centre_settings")
    .select("centre_name, billing_day, due_day, reminders_enabled, lesson_reminder_hours, quiet_from, quiet_to")
    .single();
  if (error) throw new Error(error.message);
  return {
    centreName: data.centre_name,
    billingDay: data.billing_day,
    dueDay: data.due_day,
    remindersEnabled: data.reminders_enabled,
    lessonReminderHours: data.lesson_reminder_hours,
    quietFrom: data.quiet_from.slice(0, 5),
    quietTo: data.quiet_to.slice(0, 5),
  };
}

export async function getTemplates(db: Db): Promise<Template[]> {
  const { data, error } = await db.from("message_templates").select("type, channel, language, body");
  if (error) throw new Error(error.message);
  return data;
}

const chat = (chatId: number | null, language: Language | null): ChatLink | null =>
  chatId === null ? null : { chatId, language: language ?? "uz" };

/** A student's two chats, from their telegram_links rows. */
function chatsOf(links: Array<{ role: LinkRole; chat_id: number; language: Language }>): Chats {
  const of = (role: LinkRole) => {
    const link = links.find((entry) => entry.role === role);
    return link ? { chatId: link.chat_id, language: link.language } : null;
  };
  return { studentChat: of("student"), parentChat: of("parent") };
}

/** Both chats of one student, as staff may read them (the Send message sheet, Remind). */
export async function getChats(db: Db, studentId: string): Promise<Chats> {
  const { data, error } = await db.from("telegram_links").select("role, chat_id, language").eq("student_id", studentId);
  if (error) throw new Error(error.message);
  return chatsOf(data);
}

/** What the reminders job reads, with the service role. */
export function reminderData(admin: Db): ReminderData {
  return {
    settings: () => getNotifySettings(admin),
    templates: () => getTemplates(admin),
    async debtors() {
      const { data, error } = await admin.rpc("notify_debtors");
      if (error) throw new Error(error.message);
      return data.map((row) => ({
        id: row.student_id,
        fullName: row.full_name,
        language: row.language,
        // Payment messages never go to the student's own chat.
        studentChat: null,
        parentChat: chat(row.parent_chat_id, row.parent_chat_language),
        parentPhone: row.parent_phone,
        phone: row.phone,
        debt: row.debt,
        chargedMonths: row.charged_months,
      }));
    },
    async lessons(days) {
      const { data, error } = await admin.rpc("notify_lessons", { p_days: days });
      if (error) throw new Error(error.message);
      const lessons = new Map<string, LessonCandidate>();
      for (const row of data) {
        let lesson = lessons.get(row.lesson_id);
        if (!lesson) {
          lesson = {
            lessonId: row.lesson_id,
            groupName: row.group_name,
            lessonDate: row.lesson_date,
            startTime: row.start_time.slice(0, 5),
            students: [],
          };
          lessons.set(row.lesson_id, lesson);
        }
        lesson.students.push({
          id: row.student_id,
          fullName: row.full_name,
          language: row.language,
          studentChat: chat(row.student_chat_id, row.student_chat_language),
          parentChat: chat(row.parent_chat_id, row.parent_chat_language),
          // Lesson reminders are never sent by SMS.
          parentPhone: null,
          phone: null,
        });
      }
      return [...lessons.values()];
    },
  };
}

const REQUEST_ERRORS: Record<string, RequestOutcome> = { ER001: "notEnough", ER002: "outOfStock", ER005: "notOnOffer" };

/** What the Telegram bot reads and writes, with the service role. */
export function botStore(admin: Db): BotStore {
  return {
    async link(role, code, chatId) {
      const student = await admin
        .from("students")
        .select("id, full_name, language")
        .eq(role === "student" ? "student_link_code" : "parent_link_code", code)
        .is("archived_at", null)
        .maybeSingle();
      if (student.error) throw new Error(student.error.message);
      if (!student.data) return null;
      const { error } = await admin
        .from("telegram_links")
        .upsert(
          { student_id: student.data.id, role, chat_id: chatId, language: student.data.language, linked_at: new Date().toISOString() },
          { onConflict: "student_id,role" },
        );
      if (error) throw new Error(error.message);
      return { fullName: student.data.full_name, language: student.data.language };
    },
    async unlink(chatId) {
      const { data, error } = await admin.from("telegram_links").delete().eq("chat_id", chatId).select("id");
      if (error) throw new Error(error.message);
      return data.length;
    },
    async links(chatId) {
      const { data, error } = await admin
        .from("telegram_links")
        .select("student_id, role, chat_id, language, student:students(full_name, archived_at)")
        .eq("chat_id", chatId)
        .order("linked_at");
      if (error) throw new Error(error.message);
      return data
        .filter((row) => row.student.archived_at === null)
        .map((row) => ({ studentId: row.student_id, fullName: row.student.full_name, role: row.role, chatId: row.chat_id, language: row.language }));
    },
    async setLanguage(chatId, language) {
      const { error } = await admin.from("telegram_links").update({ language }).eq("chat_id", chatId);
      if (error) throw new Error(error.message);
    },
    async centreName() {
      const { data } = await admin.from("centre_settings").select("centre_name").maybeSingle();
      return data?.centre_name ?? "";
    },
    async summary(studentId) {
      const { data, error } = await admin.rpc("points_summary", { p_student_id: studentId });
      return error ? null : ((data as PointsSummary | null) ?? null);
    },
    async top(studentId) {
      const { data, error } = await admin.rpc("bot_top", { p_student_id: studentId });
      return error ? null : ((data as BotTop | null) ?? null);
    },
    async rewards() {
      const { data, error } = await admin
        .from("rewards")
        .select("id, name, cost, stock")
        .eq("is_active", true)
        .is("archived_at", null)
        .order("cost")
        .order("name");
      if (error) throw new Error(error.message);
      return data;
    },
    async requestReward(studentId, rewardId, role, key) {
      const { error } = await admin.rpc("request_reward", {
        p_student_id: studentId,
        p_reward_id: rewardId,
        p_via: "bot",
        p_requested_by: role,
        p_request_key: key ?? undefined,
      });
      if (!error) return "ok";
      return (error.code && REQUEST_ERRORS[error.code]) || "failed";
    },
  };
}

/** What the points messages read, with the service role. */
export function pointsMessageData(admin: Db): PointsMessageData {
  /** The chats of these students, by student. */
  async function chatsFor(studentIds: string[]): Promise<Map<string, Chats>> {
    const byStudent = new Map<string, Chats>();
    if (studentIds.length === 0) return byStudent;
    const { data, error } = await admin.from("telegram_links").select("student_id, role, chat_id, language").in("student_id", studentIds);
    if (error) throw new Error(error.message);
    for (const id of new Set(studentIds)) byStudent.set(id, chatsOf(data.filter((row) => row.student_id === id)));
    return byStudent;
  }
  const none: Chats = { studentChat: null, parentChat: null };

  return {
    async settings() {
      const [centre, points] = await Promise.all([
        getNotifySettings(admin),
        admin.from("points_settings").select("enabled, weekly_day, weekly_time").single(),
      ]);
      if (points.error) throw new Error(points.error.message);
      return {
        centreName: centre.centreName,
        remindersEnabled: centre.remindersEnabled,
        quietFrom: centre.quietFrom,
        quietTo: centre.quietTo,
        pointsEnabled: points.data.enabled,
        weeklyDay: points.data.weekly_day,
        weeklyTime: points.data.weekly_time.slice(0, 5),
      };
    },
    templates: () => getTemplates(admin),
    async linkedStudents() {
      const { data, error } = await admin
        .from("telegram_links")
        .select("student_id, role, chat_id, language, student:students(status, archived_at)");
      if (error) throw new Error(error.message);
      const active = data.filter((row) => row.student.status === "active" && row.student.archived_at === null);
      return [...new Set(active.map((row) => row.student_id))].map((id) => ({
        id,
        ...chatsOf(active.filter((row) => row.student_id === id)),
      }));
    },
    async summary(studentId, month) {
      const { data, error } = await admin.rpc("points_summary", {
        p_student_id: studentId,
        p_month: month ? `${month}-01` : undefined,
      });
      return error ? null : ((data as PointsSummary | null) ?? null);
    },
    async deductions(since, until) {
      const { data, error } = await admin
        .from("points_ledger")
        .select("id, student_id, delta, reason, group:groups(name), preset:point_presets(label_uz, label_ru, label_en)")
        .eq("source", "teacher_deduction")
        .lt("delta", 0)
        .is("dedupe_key", null)
        .gte("created_at", since.toISOString())
        .lte("created_at", until.toISOString())
        .order("created_at");
      if (error) throw new Error(error.message);
      if (data.length === 0) return [];
      // A deduction that was undone is not announced.
      const undone = await admin.from("points_ledger").select("dedupe_key").in("dedupe_key", data.map((row) => `undo:${row.id}`));
      if (undone.error) throw new Error(undone.error.message);
      const gone = new Set(undone.data.map((row) => row.dedupe_key));
      const kept = data.filter((row) => !gone.has(`undo:${row.id}`));
      const chats = await chatsFor(kept.map((row) => row.student_id));
      return kept.map(
        (row): DeductionEvent => ({
          ledgerId: row.id,
          studentId: row.student_id,
          points: -row.delta,
          groupName: row.group?.name ?? null,
          reason: row.reason,
          preset: row.preset ? { uz: row.preset.label_uz, ru: row.preset.label_ru, en: row.preset.label_en } : null,
          ...(chats.get(row.student_id) ?? none),
        }),
      );
    },
    async rewardEvents(since) {
      const from = since.toISOString();
      const { data, error } = await admin
        .from("redemptions")
        .select("id, student_id, cost, status, note, created_at, handled_at, reward:rewards(name)")
        .or(`created_at.gte.${from},handled_at.gte.${from}`)
        .order("created_at");
      if (error) throw new Error(error.message);
      const chats = await chatsFor(data.map((row) => row.student_id));
      const events: RewardEvent[] = [];
      for (const row of data) {
        const base = {
          redemptionId: row.id,
          studentId: row.student_id,
          reward: row.reward.name,
          cost: row.cost,
          note: row.note,
          ...(chats.get(row.student_id) ?? none),
        };
        if (row.created_at >= from) events.push({ ...base, update: "requested" });
        if (row.handled_at && row.handled_at >= from && row.status !== "requested") {
          events.push({ ...base, update: row.status === "given" ? "given" : "rejected" });
        }
      }
      return events;
    },
  };
}

// ── Staff alerts about leads in the shared inbox (staff-alerts.ts) ──

const staffLanguage = (value: string | null | undefined): StaffLanguage =>
  value === "ru" || value === "en" || value === "ko" ? value : "uz";

/** What the staff-alert run reads, with the service role. */
export function staffAlertData(admin: Db): StaffAlertData {
  return {
    async quietHours() {
      const { data, error } = await admin.from("centre_settings").select("quiet_from, quiet_to").single();
      if (error) throw new Error(error.message);
      return { from: data.quiet_from.slice(0, 5), to: data.quiet_to.slice(0, 5) };
    },
    async inboxLeads(since) {
      const { data, error } = await admin.rpc("lead_inbox");
      if (error) throw new Error(error.message);
      return (data ?? [])
        .filter((row) => row.inbox_since >= since.toISOString())
        .map(
          (row): InboxLead => ({
            id: row.id,
            fullName: row.full_name,
            phone: row.phone,
            formName: row.form_name,
            answers: Array.isArray(row.answers) ? (row.answers as Array<{ label: string; value: string | boolean }>) : [],
            inboxSince: row.inbox_since,
          }),
        );
    },
    async recipients() {
      const { data, error } = await admin
        .from("profiles")
        .select("id, language, telegram_chat_id")
        .eq("is_active", true)
        .eq("alerts_on", true)
        .in("role", ["owner", "manager"])
        .not("telegram_chat_id", "is", null);
      if (error) throw new Error(error.message);
      return data.map((row) => ({ id: row.id, chatId: row.telegram_chat_id as number, language: staffLanguage(row.language) }));
    },
  };
}

/** The staff side of the bot: linking with u_<code>, and the Take button. */
export function staffBotStore(admin: Db): StaffBotStore {
  return {
    async linkStaff(code, chatId) {
      const person = await admin
        .from("profiles")
        .select("id, full_name, language")
        .eq("staff_link_code", code)
        .eq("is_active", true)
        .in("role", ["owner", "manager"])
        .maybeSingle();
      if (person.error) throw new Error(person.error.message);
      if (!person.data) return null;
      // One chat alerts one person: it leaves whoever had it before.
      const freed = await admin.from("profiles").update({ telegram_chat_id: null }).eq("telegram_chat_id", chatId).neq("id", person.data.id);
      if (freed.error) throw new Error(freed.error.message);
      const linked = await admin.from("profiles").update({ telegram_chat_id: chatId }).eq("id", person.data.id);
      if (linked.error) throw new Error(linked.error.message);
      return { fullName: person.data.full_name, language: staffLanguage(person.data.language) };
    },
    async unlinkStaff(chatId) {
      const { data, error } = await admin.from("profiles").update({ telegram_chat_id: null }).eq("telegram_chat_id", chatId).select("id");
      if (error) throw new Error(error.message);
      return data.length;
    },
    async staffByChat(chatId) {
      const { data, error } = await admin
        .from("profiles")
        .select("id, full_name, language")
        .eq("telegram_chat_id", chatId)
        .eq("is_active", true)
        .in("role", ["owner", "manager"])
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { id: data.id, fullName: data.full_name, language: staffLanguage(data.language) } : null;
    },
    async takeLead(leadId, staffId) {
      const { data, error } = await admin.rpc("take_lead", { p_lead_id: leadId, p_for: staffId });
      if (error) {
        if (error.code === "P0002") return null;
        throw new Error(error.message);
      }
      const row = data?.[0];
      if (!row) return null;
      if (!row.taken) return { taken: false, by: row.assigned_name };
      const lead = await admin.from("leads").select("full_name, phone").eq("id", leadId).single();
      if (lead.error) throw new Error(lead.error.message);
      return { taken: true, lead: { fullName: lead.data.full_name, phone: lead.data.phone } };
    },
  };
}
