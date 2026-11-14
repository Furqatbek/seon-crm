import { z } from "zod";

import { resetPasswordSchema } from "./auth";

// Messages are keys under settings.errors in messages/*.json.

const LANGUAGES = ["uz", "ru", "en"] as const;
export const ROLES = ["owner", "manager"] as const;
export const MESSAGE_TYPES = ["payment_due", "payment_overdue", "lesson_reminder", "custom"] as const;
export const MESSAGE_CHANNELS = ["telegram", "sms"] as const;
export const TEMPLATE_LANGUAGES = LANGUAGES;

const name = z.string().trim().min(1, "nameRequired").max(100, "tooLong");
/** A day of the month every month has: 1–28. */
const monthDay = z.coerce.number("dayInvalid").int("dayInvalid").min(1, "dayInvalid").max(28, "dayInvalid");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "timeInvalid");

/** Centre: name, billing day, due day. */
export const centreSchema = z
  .object({ centre_name: name, billing_day: monthDay, due_day: monthDay })
  .refine((value) => value.due_day >= value.billing_day, { path: ["due_day"], message: "dueBeforeBilling" });
export type CentreInput = z.input<typeof centreSchema>;
export type CentreValues = z.output<typeof centreSchema>;

/** Invite a user by email. */
export const inviteSchema = z.object({
  email: z.email("emailInvalid").max(200, "tooLong"),
  full_name: name,
  role: z.enum(ROLES),
  language: z.enum(LANGUAGES),
});
export type InviteInput = z.input<typeof inviteSchema>;

export const userRoleSchema = z.object({ user_id: z.uuid(), role: z.enum(ROLES) });
export const userActiveSchema = z.object({ user_id: z.uuid(), active: z.boolean() });

/** Notifications: on or off, lesson reminder hours, quiet hours. */
export const notificationsSchema = z.object({
  reminders_enabled: z.boolean(),
  lesson_reminder_hours: z.coerce.number("hoursInvalid").int("hoursInvalid").min(1, "hoursInvalid").max(48, "hoursInvalid"),
  quiet_from: time,
  quiet_to: time,
});
export type NotificationsInput = z.input<typeof notificationsSchema>;
export type NotificationsValues = z.output<typeof notificationsSchema>;

export const testSmsSchema = z.object({ phone: z.string().regex(/^\+998\d{9}$/, "phoneInvalid") });

/** One template: a message type on a channel in a language. */
export const templateSchema = z.object({
  type: z.enum(MESSAGE_TYPES),
  channel: z.enum(MESSAGE_CHANNELS),
  language: z.enum(LANGUAGES),
  body: z.string().trim().min(1, "textRequired").max(1000, "tooLong"),
});

/** Profile: name and interface language. */
export const profileSchema = z.object({ full_name: name, language: z.enum(LANGUAGES) });
export type ProfileInput = z.input<typeof profileSchema>;

export const passwordSchema = resetPasswordSchema;

export type SettingsErrorKey =
  | "nameRequired"
  | "tooLong"
  | "dayInvalid"
  | "dueBeforeBilling"
  | "timeInvalid"
  | "hoursInvalid"
  | "emailInvalid"
  | "emailTaken"
  | "phoneInvalid"
  | "textRequired"
  | "passwordTooShort"
  | "passwordMismatch"
  | "notSelf"
  | "lastOwner"
  | "notAllowed"
  | "notConfigured"
  | "notFound"
  | "generic";

export type SettingsResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | {
      ok: false;
      error: SettingsErrorKey;
      /** What the outside service said, when it was one that refused. */
      detail?: string;
    };

export const SETTINGS_TABS = ["centre", "users", "notifications", "templates", "profile"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** URL state of /settings. */
export const settingsSearchSchema = z.object({
  tab: z.enum(SETTINGS_TABS).optional().catch(undefined),
});
