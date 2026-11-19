// Meta's webhook for lead ads — docs/SPEC.md → "Lead forms add-on → Public
// intake URL and Meta lead ads". Three pure checks: the verification
// handshake, the signature of a delivery, and reading the leadgen
// notifications out of it.

import { createHmac, timingSafeEqual } from "node:crypto";

const same = (a: string, b: string) => {
  const [left, right] = [Buffer.from(a), Buffer.from(b)];
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * The GET Meta sends when the webhook is saved in the app's dashboard:
 * hub.mode=subscribe, hub.verify_token=<our token>, hub.challenge=<text>.
 * The answer is the challenge, or null when the token is not ours.
 */
export function verificationChallenge(
  params: { mode: string | null; token: string | null; challenge: string | null },
  verifyToken: string | undefined,
): string | null {
  if (!verifyToken || params.mode !== "subscribe" || !params.token || params.challenge === null) return null;
  return same(params.token, verifyToken) ? params.challenge : null;
}

/**
 * Whether a delivery was signed with the app's secret:
 * `X-Hub-Signature-256: sha256=<HMAC-SHA256 of the raw body, in hex>`.
 * The body must be the bytes as they arrived, not JSON written out again.
 */
export function signatureMatches(rawBody: string, header: string | null | undefined, appSecret: string | undefined): boolean {
  if (!appSecret || !header) return false;
  const given = /^sha256=([0-9a-f]{64})$/i.exec(header.trim())?.[1];
  if (!given) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return same(given.toLowerCase(), expected);
}

/** One "a lead was submitted" notification. */
export type LeadgenEvent = { leadgenId: string; formId: string; pageId: string; adId: string | null; createdTime: number | null };

const id = (value: unknown): string | null => {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  return /^[0-9]{1,32}$/.test(text) ? text : null;
};

/** The leadgen notifications in a delivery. Anything else in it is skipped. */
export function leadgenEvents(payload: unknown): LeadgenEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const { object, entry } = payload as { object?: unknown; entry?: unknown };
  if (object !== "page" || !Array.isArray(entry)) return [];
  const events: LeadgenEvent[] = [];
  for (const item of entry as Array<{ id?: unknown; changes?: unknown }>) {
    if (!Array.isArray(item?.changes)) continue;
    for (const change of item.changes as Array<{ field?: unknown; value?: Record<string, unknown> }>) {
      if (change?.field !== "leadgen" || !change.value) continue;
      const leadgenId = id(change.value.leadgen_id);
      const formId = id(change.value.form_id);
      const pageId = id(change.value.page_id) ?? id(item.id);
      if (!leadgenId || !formId || !pageId) continue;
      events.push({
        leadgenId,
        formId,
        pageId,
        adId: id(change.value.ad_id),
        createdTime: typeof change.value.created_time === "number" ? change.value.created_time : null,
      });
    }
  }
  return events;
}
