// Notifications — docs/SPEC.md → "Notifications".
// These files have no runtime imports from the app, so the test script in
// scripts/ can load the providers directly.

export type Channel = "telegram" | "sms";
export type MessageType =
  | "payment_due"
  | "payment_overdue"
  | "lesson_reminder"
  | "custom"
  | "points_weekly"
  | "points_deduction"
  | "points_month_result"
  | "reward_update"
  /** To the owner and managers, about a lead in the shared inbox. */
  | "staff_new_lead"
  | "staff_lead_reminder"
  /** To the owner: an integration (the Meta connection) needs attention. */
  | "staff_integration_alert"
  /** Student app — docs/STUDENT_APP_SPEC.md → "Rules → Notifications". */
  | "visit_arrived"
  | "visit_left"
  | "account_linked"
  | "voucher_expiring"
  | "open_lesson_reminder"
  | "receipt_approved"
  | "receipt_rejected"
  | "staff_new_receipt";
/** The four points messages: Telegram only, to the student and the parent. */
export const POINTS_MESSAGE_TYPES = ["points_weekly", "points_deduction", "points_month_result", "reward_update"] as const;
/** Whose chat a Telegram link is. */
export type LinkRole = "student" | "parent";
export type Language = "uz" | "ru" | "en";

export type SendResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** True when trying again cannot help: the parent blocked the bot, the chat is gone. */
      permanent?: boolean;
    };

/** Anything that can deliver a text to a recipient on one channel. */
export interface MessageProvider {
  readonly channel: Channel;
  /** `recipient` is a Telegram chat id, or a phone as +998XXXXXXXXX. */
  send(recipient: string, body: string): Promise<SendResult>;
}

/** SMS behind an interface, so another provider can replace Eskiz. */
export interface SmsProvider extends MessageProvider {
  readonly channel: "sms";
}

export type Providers = { telegram: MessageProvider; sms: SmsProvider };

/** The fetch the providers use; tests pass their own. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
