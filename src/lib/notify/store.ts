import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import type { BotStore } from "./bot";
import type { MessageLog } from "./deliver";
import { EskizProvider } from "./eskiz";
import type { LessonCandidate, NotifySettings, ReminderData, Template } from "./reminders";
import { TelegramProvider } from "./telegram";
import type { Providers } from "./types";

type Db = SupabaseClient<Database>;

// One Eskiz provider per server instance, so its token is logged in for once.
let providers: Providers | undefined;

/** The real providers, from the environment. Unconfigured ones fail every send with a clear error. */
export function getProviders(): Providers {
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
        telegramChatId: row.telegram_chat_id,
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
          telegramChatId: row.telegram_chat_id,
          parentPhone: row.parent_phone,
          phone: row.phone,
        });
      }
      return [...lessons.values()];
    },
  };
}

/** What the Telegram bot reads and writes, with the service role. */
export function botStore(admin: Db): BotStore {
  return {
    async link(code, chatId) {
      const { data, error } = await admin
        .from("students")
        .update({ telegram_chat_id: chatId })
        .eq("telegram_link_code", code)
        .is("archived_at", null)
        .select("full_name, language")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { fullName: data.full_name, language: data.language } : null;
    },
    async unlink(chatId) {
      const { data, error } = await admin
        .from("students")
        .update({ telegram_chat_id: null })
        .eq("telegram_chat_id", chatId)
        .select("language");
      if (error) throw new Error(error.message);
      return data.map((row) => row.language);
    },
    async centreName() {
      const { data } = await admin.from("centre_settings").select("centre_name").maybeSingle();
      return data?.centre_name ?? "";
    },
  };
}
