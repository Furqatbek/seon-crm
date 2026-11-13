// Notifications — docs/SPEC.md → "Notifications".
// These files have no runtime imports from the app, so the test script in
// scripts/ can load the providers directly.

export type Channel = "telegram" | "sms";
export type MessageType = "payment_due" | "payment_overdue" | "lesson_reminder" | "custom";
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
