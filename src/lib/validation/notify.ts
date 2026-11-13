import { z } from "zod";

// Messages are keys under notify.errors in messages/*.json.

export const CHANNELS = ["telegram", "sms"] as const;

/** Send message: a one-off text to a student, on the channel staff choose. */
export const sendMessageSchema = z.object({
  student_id: z.uuid(),
  channel: z.enum(CHANNELS),
  body: z.string().trim().min(1, "textRequired").max(1000, "tooLong"),
});
export type SendMessageInput = z.input<typeof sendMessageSchema>;

export type NotifyErrorKey =
  | "notAllowed"
  | "notConfigured"
  | "quietHours"
  | "noChannel"
  | "textRequired"
  | "tooLong"
  | "notFound"
  | "noDebt"
  | "noTemplate"
  | "generic";

export type NotifyFailure = {
  ok: false;
  error: NotifyErrorKey;
  /** For quietHours: when nothing is sent, "HH:MM". */
  quiet?: { from: string; to: string };
};
