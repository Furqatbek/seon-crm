import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type { AppAccount, AppEventData, AppLanguage, AppNotifyStore } from "./app-notify";
import type { OfferEventData } from "./offer-notify";
import type { ReceiptAlertData, ReceiptDecisionData } from "./receipt-notify";
import type { BotStore, RequestOutcome } from "./bot";
import type { MessageLog } from "./deliver";
import { EskizProvider } from "./eskiz";
import { FcmSender, readServiceAccount } from "./fcm";
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
        .select("id, name, cost, stock, reward_variants(id, archived_at)")
        .eq("is_active", true)
        .is("archived_at", null)
        .order("cost")
        .order("name");
      if (error) throw new Error(error.message);
      // A reward with variants (sizes) is ordered in the app or at the desk, where the variant can be chosen.
      return data
        .filter((reward) => reward.reward_variants.every((variant) => variant.archived_at !== null))
        .map(({ id, name, cost, stock }) => ({ id, name, cost, stock }));
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
      const [links, accounts] = await Promise.all([
        admin.from("telegram_links").select("student_id, role, chat_id, language, student:students(status, archived_at)"),
        // Students with the app are told there, with or without a Telegram chat.
        admin.from("profiles").select("student_id, student:students(status, archived_at)").eq("is_active", true).not("student_id", "is", null),
      ]);
      if (links.error) throw new Error(links.error.message);
      if (accounts.error) throw new Error(accounts.error.message);
      const active = links.data.filter((row) => row.student.status === "active" && row.student.archived_at === null);
      const withApp = accounts.data
        .filter((row) => row.student?.status === "active" && row.student.archived_at === null)
        .map((row) => row.student_id as string);
      return [...new Set([...active.map((row) => row.student_id), ...withApp])].map((id) => ({
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
        .select("id, student_id, cost, status, note, created_at, ready_at, handled_at, reward:rewards(name)")
        .or(`created_at.gte.${from},ready_at.gte.${from},handled_at.gte.${from}`)
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
        // Ready for pickup, unless it has been closed since.
        if (row.ready_at && row.ready_at >= from && row.status === "ready") events.push({ ...base, update: "ready" });
        // An order the student cancelled themselves needs no message.
        if (row.handled_at && row.handled_at >= from && row.note !== "cancelled_by_student") {
          if (row.status === "given") events.push({ ...base, update: "given" });
          else if (row.status === "rejected" || row.status === "cancelled") events.push({ ...base, update: "rejected" });
        }
      }
      return events;
    },
  };
}

// ── The student app: notifications and push (app-notify.ts) ──

// One sender per server instance, so its Firebase access token is asked for once.
let push: FcmSender | undefined;

/** Push through Firebase, from FIREBASE_SERVICE_ACCOUNT. Unconfigured, every push fails and Telegram is used. */
export function getPushSender(): FcmSender {
  push ??= new FcmSender({ account: readServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT) });
  return push;
}

const messageLanguage = (value: string | null | undefined): Language => (value === "ru" || value === "en" ? value : "uz");
const appLanguage = (value: string | null | undefined): AppLanguage => (value === "ko" ? "ko" : messageLanguage(value));

type AccountRow = { id: string; language: string; student: { language: string } | null; device_tokens: Array<{ token: string }> };
const ACCOUNT_COLUMNS = "id, language, student:students(language), device_tokens(token)";

function toAccount(row: AccountRow): AppAccount {
  const language = appLanguage(row.language);
  return {
    profileId: row.id,
    language,
    // The centre's templates have no Korean: such a student is written to in their record's language.
    messageLanguage: language === "ko" ? messageLanguage(row.student?.language) : language,
    tokens: row.device_tokens.map((device) => device.token),
  };
}

/** The app's notifications and device tokens, with the service role. */
export function appNotifyStore(admin: Db): AppNotifyStore {
  return {
    async accountOfStudent(studentId) {
      const { data, error } = await admin.from("profiles").select(ACCOUNT_COLUMNS).eq("student_id", studentId).eq("is_active", true).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toAccount(data) : null;
    },
    async insert(profileId, notification) {
      const { error } = await admin.from("notifications").insert({
        profile_id: profileId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: { ...notification.data, dedupe: notification.dedupeKey },
      });
      // The unique dedupe key: this account was already told.
      if (error?.code === "23505") return false;
      if (error) throw new Error(error.message);
      return true;
    },
    async dropToken(token) {
      const { error } = await admin.from("device_tokens").delete().eq("token", token);
      if (error) throw new Error(error.message);
    },
  };
}

/** A classmate's challenge with the invited student's app account, for its push. */
export async function inviteToPush(admin: Db, id: string, shortName: (fullName: string) => string) {
  const { data, error } = await admin.from("match_invites").select("id, status, expires_at, from_profile, to_profile").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [from, to] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", data.from_profile).maybeSingle(),
    admin.from("profiles").select(ACCOUNT_COLUMNS).eq("id", data.to_profile).eq("is_active", true).maybeSingle(),
  ]);
  if (!to.data) return null;
  return { id: data.id, fromName: shortName(from.data?.full_name ?? ""), to: toAccount(to.data), status: data.status, expiresAt: new Date(data.expires_at) };
}

/** What the app's own notifications read, with the service role. */
export function appEventData(admin: Db): AppEventData {
  return {
    async centreName() {
      const { data } = await admin.from("centre_settings").select("centre_name").maybeSingle();
      return data?.centre_name ?? "";
    },
    async linkedSince(since) {
      const { data, error } = await admin
        .from("profiles")
        .select(`${ACCOUNT_COLUMNS}, linked_at`)
        .eq("is_active", true)
        .not("student_id", "is", null)
        .gte("linked_at", since.toISOString())
        .order("linked_at");
      if (error) throw new Error(error.message);
      return data.map((row) => ({ account: toAccount(row), linkedAt: row.linked_at as string }));
    },
  };
}

/** What the receipt messages read, with the service role. */
export function receiptAlertData(admin: Db): ReceiptAlertData {
  const staff = staffAlertData(admin);
  return {
    quietHours: staff.quietHours,
    recipients: staff.recipients,
    async pendingReceipts(since) {
      const { data, error } = await admin.from("payment_receipts").select("id, student_id, group_id, amount, created_at").eq("status", "pending").gte("created_at", since.toISOString()).order("created_at").limit(200);
      if (error) throw new Error(error.message);
      if (data.length === 0) return [];
      const [students, groups] = await Promise.all([
        admin.from("students").select("id, full_name").in("id", [...new Set(data.map((row) => row.student_id))]),
        admin.from("groups").select("id, name").in("id", [...new Set(data.map((row) => row.group_id))]),
      ]);
      const studentOf = new Map((students.data ?? []).map((row) => [row.id, row.full_name]));
      const groupOf = new Map((groups.data ?? []).map((row) => [row.id, row.name]));
      return data.map((row) => ({ id: row.id, studentName: studentOf.get(row.student_id) ?? "", groupName: groupOf.get(row.group_id) ?? "", amount: row.amount, createdAt: row.created_at }));
    },
  };
}

export function receiptDecisionData(admin: Db): ReceiptDecisionData {
  return {
    async reviewedSince(since) {
      const { data, error } = await admin
        .from("payment_receipts")
        .select("id, status, amount, reject_reason, profile_id")
        .in("status", ["approved", "rejected"])
        .not("profile_id", "is", null)
        .gte("reviewed_at", since.toISOString())
        .order("reviewed_at")
        .limit(500);
      if (error) throw new Error(error.message);
      const ids = [...new Set(data.flatMap((row) => (row.profile_id ? [row.profile_id] : [])))];
      if (ids.length === 0) return [];
      const accounts = await admin.from("profiles").select(ACCOUNT_COLUMNS).in("id", ids).eq("is_active", true);
      if (accounts.error) throw new Error(accounts.error.message);
      const accountOf = new Map(accounts.data.map((row) => [row.id, toAccount(row)]));
      return data.flatMap((row) => {
        const account = row.profile_id ? accountOf.get(row.profile_id) : undefined;
        return account && row.status !== "pending" ? [{ id: row.id, status: row.status, amount: row.amount, rejectReason: row.reject_reason, account }] : [];
      });
    },
  };
}

/** What the voucher and open-lesson reminders read, with the service role. */
export function offerEventData(admin: Db): OfferEventData {
  /** The app accounts of these profiles that are still active, by profile id. */
  const accountsOf = async (profileIds: string[]) => {
    if (profileIds.length === 0) return new Map<string, AppAccount>();
    const { data, error } = await admin.from("profiles").select(ACCOUNT_COLUMNS).in("id", profileIds).eq("is_active", true);
    if (error) throw new Error(error.message);
    return new Map(data.map((row) => [row.id, toAccount(row)]));
  };
  return {
    async quietHours() {
      const { data, error } = await admin.from("centre_settings").select("quiet_from, quiet_to").single();
      if (error) throw new Error(error.message);
      return { from: data.quiet_from.slice(0, 5), to: data.quiet_to.slice(0, 5) };
    },
    async expiringVouchers(now, until) {
      const { data, error } = await admin
        .from("vouchers")
        .select("id, code, expires_at, profile_id")
        .eq("status", "issued")
        .not("profile_id", "is", null)
        .gt("expires_at", now.toISOString())
        .lte("expires_at", until.toISOString())
        .limit(500);
      if (error) throw new Error(error.message);
      const accounts = await accountsOf(data.flatMap((row) => (row.profile_id ? [row.profile_id] : [])));
      return data.flatMap((row) => {
        const account = row.profile_id ? accounts.get(row.profile_id) : undefined;
        return account ? [{ id: row.id, code: row.code, expiresAt: row.expires_at, account }] : [];
      });
    },
    async bookedLessons(days) {
      const { data, error } = await admin.from("open_lesson_bookings").select("id, slot_id, session_date, profile_id").eq("status", "booked").in("session_date", days).limit(1000);
      if (error) throw new Error(error.message);
      if (data.length === 0) return [];
      const [slots, accounts] = await Promise.all([
        admin.from("open_lesson_slots").select("id, title, start_time").in("id", [...new Set(data.map((row) => row.slot_id))]),
        accountsOf([...new Set(data.map((row) => row.profile_id))]),
      ]);
      if (slots.error) throw new Error(slots.error.message);
      const slotOf = new Map(slots.data.map((slot) => [slot.id, slot]));
      return data.flatMap((row) => {
        const slot = slotOf.get(row.slot_id);
        const account = accounts.get(row.profile_id);
        return slot && account ? [{ bookingId: row.id, title: slot.title, sessionDate: row.session_date, startTime: slot.start_time.slice(0, 5), account }] : [];
      });
    },
  };
}

/**
 * Removes the profile photos of accounts deleted in the app: everything under
 * avatars/<profile id>/, then the row that asked for it. Returns how many
 * accounts were cleaned; one that fails stays for the next run.
 */
export async function removeDeletedAvatars(admin: Db): Promise<number> {
  const { data, error } = await admin.from("deleted_app_accounts").select("profile_id").order("deleted_at").limit(50);
  if (error) throw new Error(error.message);
  let cleaned = 0;
  for (const { profile_id: id } of data) {
    const bucket = admin.storage.from("avatars");
    const files = await bucket.list(id, { limit: 100 });
    if (files.error) continue;
    if (files.data.length > 0) {
      const removed = await bucket.remove(files.data.map((file) => `${id}/${file.name}`));
      if (removed.error) continue;
    }
    const done = await admin.from("deleted_app_accounts").delete().eq("profile_id", id);
    if (!done.error) cleaned += 1;
  }
  return cleaned;
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
