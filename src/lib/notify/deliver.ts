import { dedupeKey, fallsBackToSms } from "./rules";
import { forChannel } from "./templates";
import type { Channel, MessageType, Providers } from "./types";

export type Outgoing = {
  studentId: string;
  type: MessageType;
  channel: Channel;
  recipient: string;
  body: string;
  dedupeKey: string;
};

/**
 * The messages table, as the sender needs it. Every message is written
 * before it is sent, under its dedupe key; the row is the lock that stops a
 * second send.
 */
export interface MessageLog {
  /** Writes the message. Returns its id, or null when the key already exists. */
  begin(message: Outgoing, status: "queued" | "skipped"): Promise<string | null>;
  /** Records what happened to a queued message. */
  finish(id: string, result: { status: "sent" | "failed"; error: string | null; sentAt: string | null }): Promise<void>;
}

export type Delivery =
  /** Delivered on the first channel. */
  | "sent"
  /** Telegram failed and the SMS went out instead. */
  | "sent_by_sms"
  | "failed"
  /** A message with this key was already written: nothing was sent. */
  | "duplicate";

async function attempt(log: MessageLog, providers: Providers, message: Outgoing, now: () => Date): Promise<Delivery> {
  const text = forChannel(message.body, message.channel);
  const id = await log.begin({ ...message, body: text }, "queued");
  if (id === null) return "duplicate";
  const result = await providers[message.channel].send(message.recipient, text);
  await log.finish(id, {
    status: result.ok ? "sent" : "failed",
    error: result.ok ? null : result.error,
    sentAt: result.ok ? now().toISOString() : null,
  });
  return result.ok ? "sent" : "failed";
}

/**
 * Sends one message and logs it, sent or failed. A payment message that
 * fails on Telegram is tried once by SMS, as its own logged message.
 */
export async function deliver(
  log: MessageLog,
  providers: Providers,
  message: Outgoing,
  options: { smsFallback?: string | null; now?: () => Date } = {},
): Promise<Delivery> {
  const now = options.now ?? (() => new Date());
  const first = await attempt(log, providers, message, now);
  if (first !== "failed" || message.channel !== "telegram" || !fallsBackToSms(message.type) || !options.smsFallback) {
    return first;
  }
  const second = await attempt(
    log,
    providers,
    { ...message, channel: "sms", recipient: options.smsFallback, dedupeKey: dedupeKey.smsFallback(message.dedupeKey) },
    now,
  );
  return second === "sent" ? "sent_by_sms" : "failed";
}

/** A message that is written down but deliberately not sent (a lesson reminder in quiet hours). */
export async function skip(log: MessageLog, message: Outgoing): Promise<"skipped" | "duplicate"> {
  return (await log.begin({ ...message, body: forChannel(message.body, message.channel) }, "skipped")) === null
    ? "duplicate"
    : "skipped";
}
