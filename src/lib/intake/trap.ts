// The spam trap: a hidden field a person never fills, and a signed timestamp
// that shows how long the page was open. docs/SPEC.md → "Lead forms add-on →
// Defaults to confirm → Trap".

import { createHmac, timingSafeEqual } from "node:crypto";

/** Sent sooner than this after the page opened: a script, not a person. */
export const MIN_FILL_MS = 3_000;
/** Older than this, the page is stale and the visitor is asked to send again. */
export const MAX_FILL_MS = 24 * 60 * 60 * 1000;

/** The name of the hidden field. It reads like a real one, so scripts fill it. */
export const HONEYPOT_FIELD = "website";
export const TOKEN_FIELD = "ts";

const sign = (secret: string, formId: string, issuedAt: number) =>
  createHmac("sha256", secret).update(`${formId}.${issuedAt}`).digest("base64url");

/** Put in the page when it is served: when, signed so it cannot be made up. */
export function issueToken(secret: string, formId: string, now: Date): string {
  const issuedAt = now.getTime();
  return `${issuedAt}.${sign(secret, formId, issuedAt)}`;
}

export type TrapVerdict = "ok" | "honeypot" | "bad_token" | "too_fast" | "expired";

/**
 * "ok" lets the answers through. "expired" is an honest visitor whose page sat
 * open for more than a day. Everything else is spam.
 */
export function checkTrap(
  input: { honeypot: string | null | undefined; token: string | null | undefined },
  secret: string,
  formId: string,
  now: Date,
): TrapVerdict {
  if ((input.honeypot ?? "").trim() !== "") return "honeypot";

  const match = /^(\d{10,16})\.([A-Za-z0-9_-]{20,})$/.exec(input.token ?? "");
  if (!match) return "bad_token";
  const issuedAt = Number(match[1]);
  const given = Buffer.from(match[2]);
  const expected = Buffer.from(sign(secret, formId, issuedAt));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "bad_token";

  const age = now.getTime() - issuedAt;
  if (age < MIN_FILL_MS) return "too_fast";
  if (age > MAX_FILL_MS) return "expired";
  return "ok";
}

/** A visitor's address as it is stored: enough to count attempts, not to find anyone. */
export function hashVisitor(secret: string, ip: string | null | undefined): string | null {
  const address = (ip ?? "").trim();
  if (!address) return null;
  return createHmac("sha256", secret).update(`visitor:${address}`).digest("base64url").slice(0, 32);
}
