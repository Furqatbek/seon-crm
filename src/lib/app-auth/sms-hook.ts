import { createHmac, timingSafeEqual } from "node:crypto";

import { toSmsText } from "../notify/templates.ts";

// Supabase Auth's Send SMS hook — docs/STUDENT_APP_SPEC.md → "How to hand off"
// and App 1. Supabase calls the CRM with the code; the CRM sends it through
// Eskiz. Requests are signed the Standard Webhooks way: HMAC-SHA256 over
// "<id>.<timestamp>.<body>" with the secret Supabase shows as
// "v1,whsec_<base64>". No runtime imports from the app, so tests load it directly.

/** A signature older or newer than this is refused: it may be a replay. */
export const TOLERANCE_SECONDS = 5 * 60;
/** How long after a phone change was asked for its code still goes to the new number. */
export const PHONE_CHANGE_SECONDS = 2 * 60;
/** Codes one phone may be sent in an hour; the database counts them. */
export const CODES_PER_HOUR = 3;

export type HookHeaders = { id: string | null; timestamp: string | null; signature: string | null };

function secretBytes(secret: string): Buffer | null {
  const base64 = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const bytes = Buffer.from(base64, "base64");
  return bytes.length > 0 ? bytes : null;
}

/** The signature Supabase sends for a body: "v1,<base64 HMAC>". */
export function signHook(secret: string, id: string, timestamp: string, body: string): string {
  const key = secretBytes(secret);
  if (!key) throw new Error("The hook secret is empty");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

/**
 * True when the request was signed with our secret, recently. The header may
 * carry several signatures separated by spaces (while a secret is rotated);
 * one match is enough. False when anything is missing: an unset secret never
 * opens the route.
 */
export function hookSignatureValid(headers: HookHeaders, body: string, secret: string | undefined, now: Date = new Date()): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const sentAt = Number(headers.timestamp);
  if (!Number.isInteger(sentAt) || Math.abs(now.getTime() / 1000 - sentAt) > TOLERANCE_SECONDS) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(signHook(secret, headers.id, headers.timestamp, body));
  } catch {
    return false;
  }
  return headers.signature.split(" ").some((candidate) => {
    const presented = Buffer.from(candidate);
    return presented.length === expected.length && timingSafeEqual(presented, expected);
  });
}

export type HookPayload = {
  user?: {
    phone?: string | null;
    phone_confirmed_at?: string | null;
    /** The number a phone change is waiting to confirm, and when its code was asked for. */
    new_phone?: string | null;
    phone_change_sent_at?: string | null;
  } | null;
  sms?: { otp?: string | null; phone?: string | null } | null;
};

export type CodeRequest = {
  /** +998XXXXXXXXX */
  phone: string;
  code: string;
  /** First code for a new account, or a code for someone who has one (password reset, new phone). */
  kind: "sign_up" | "confirm";
};

/**
 * What to send, from the hook's payload, or null when it is not a code for an
 * Uzbek phone. The destination is sms.phone when Supabase gives it. Without
 * it, a phone change asked for in the last few minutes goes to the new
 * number (an older, abandoned change is ignored); everything else to the user's.
 */
export function readHookPayload(payload: HookPayload | null, now: Date = new Date()): CodeRequest | null {
  const code = payload?.sms?.otp?.trim();
  const user = payload?.user;
  const changeAskedAt = user?.phone_change_sent_at ? Date.parse(user.phone_change_sent_at) : Number.NaN;
  const changing = Boolean(user?.new_phone) && Math.abs(now.getTime() - changeAskedAt) <= PHONE_CHANGE_SECONDS * 1000;
  const raw = payload?.sms?.phone || (changing ? user?.new_phone : null) || user?.phone;
  if (!code || !/^\d{4,10}$/.test(code) || !raw) return null;
  const phone = `+${raw.replace(/\D/g, "")}`;
  if (!/^\+998\d{9}$/.test(phone)) return null;
  return { phone, code, kind: payload?.user?.phone_confirmed_at ? "confirm" : "sign_up" };
}

/**
 * The two texts Eskiz has to approve, in Latin Uzbek with a straight
 * apostrophe. Keep them exactly in step with what was approved: Eskiz refuses
 * a text it does not know.
 */
export const CODE_TEXTS: Record<CodeRequest["kind"], string> = {
  sign_up: "{centre}: ro'yxatdan o'tish kodi {code}. Kodni hech kimga aytmang.",
  confirm: "{centre}: tasdiqlash kodi {code}. Kodni hech kimga aytmang.",
};

export function codeText(kind: CodeRequest["kind"], centre: string, code: string): string {
  return toSmsText(CODE_TEXTS[kind].replace("{centre}", centre.trim()).replace("{code}", code));
}

export type HookDeps = {
  secret: string | undefined;
  /** True, and counted, when this phone may have another code now. */
  allowed(phone: string): Promise<boolean>;
  /** Gives back the code just counted, when it could not be sent. */
  release(phone: string): Promise<void>;
  centreName(): Promise<string>;
  send(phone: string, text: string): Promise<{ ok: true } | { ok: false; error: string }>;
  now?: () => Date;
};

export type HookResponse = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };

const refuse = (status: number, message: string, headers?: Record<string, string>): HookResponse => ({
  status,
  body: { error: { http_code: status, message } },
  headers,
});

/**
 * One call of the hook: check the signature, the limit of 3 codes an hour per
 * phone, then send through the SMS provider. The answers are in the shape
 * Supabase Auth expects. The message of a refusal is a code, not a text: the
 * app shows its own translated words for it.
 */
export async function handleSendSms(headers: HookHeaders, rawBody: string, deps: HookDeps): Promise<HookResponse> {
  if (!hookSignatureValid(headers, rawBody, deps.secret, deps.now?.())) return refuse(401, "invalid_signature");
  let payload: HookPayload | null = null;
  try {
    payload = JSON.parse(rawBody) as HookPayload;
  } catch {
    return refuse(400, "invalid_payload");
  }
  const request = readHookPayload(payload, deps.now?.());
  if (!request) return refuse(400, "phone_not_supported");
  if (!(await deps.allowed(request.phone))) {
    return refuse(429, "sms_rate_limited", { "retry-after": "3600" });
  }
  const sent = await deps.send(request.phone, codeText(request.kind, await deps.centreName(), request.code));
  if (!sent.ok) {
    console.error("send-sms hook", sent.error);
    await deps.release(request.phone);
    return refuse(500, "sms_send_failed");
  }
  return { status: 200, body: {} };
}
