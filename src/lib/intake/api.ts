// POST /api/v1/leads — the intake API for websites and landing pages.
// docs/SPEC.md → "Lead forms add-on → Public intake URL and Meta lead ads".
// The route (src/app/api/v1/leads/route.ts) only reads the request and hands
// it here, so every answer can be tested without a server.
//
//   201  { id, outcome: "created" | "merged" }
//   200  { ok: true, test: true }            a builder's connection test
//   400  { error: "invalid", fields: { phone: "phone", … } }  or  { error: "invalid_body" }
//   401  { error: "unauthorized" }           no key, a wrong key, a switched-off source
//   429  { error: "rate_limited" }           60 a minute per key; 3 a day per phone
//   500  { error: "server_error" }

import { mapLead, parseFieldMap } from "./field-map.ts";
import { submitIntake, type IntakeStore } from "./intake.ts";
import { hashKey, presentedKey } from "./keys.ts";

/** Requests a key may make in a minute. */
export const KEY_LIMIT_PER_MINUTE = 60;
/** The largest body read. */
export const MAX_BODY_BYTES = 64 * 1024;

export type IntakeSource = { id: string; name: string; fieldMap: unknown; formId: string | null; limited: boolean };

export type ApiDeps = {
  /** The active source with this key hash, or null. Also counts the key's requests in the last minute. */
  findSource(keyHash: string): Promise<IntakeSource | null>;
  store: IntakeStore;
  secret: string;
  /** Called after a lead was created or merged, so staff can be alerted. */
  onLead?: (leadId: string | null) => void;
  now?: () => Date;
};

export type ApiRequest = {
  authorization: string | null;
  /** The `key` query parameter. */
  queryKey: string | null;
  contentType: string | null;
  /** The raw body. */
  body: string;
};

export type ApiResponse = { status: 200 | 201 | 400 | 401 | 429 | 500; body: Record<string, unknown>; headers?: Record<string, string> };

/** JSON or an ordinary form post → field names and values. Null when it is neither. */
export function parseBody(contentType: string | null, raw: string): Record<string, unknown> | null {
  const type = (contentType ?? "").toLowerCase();
  const fromJson = () => {
    try {
      const value: unknown = JSON.parse(raw);
      return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const fromForm = () => {
    const fields: Record<string, unknown> = {};
    for (const [name, value] of new URLSearchParams(raw)) {
      // A name sent several times (checkboxes) becomes a list.
      const before = fields[name];
      fields[name] = before === undefined ? value : Array.isArray(before) ? [...before, value] : [before, value];
    }
    return Object.keys(fields).length > 0 ? fields : null;
  };
  if (type.includes("json")) return fromJson();
  if (type.includes("x-www-form-urlencoded")) return fromForm();
  // No or another content type: page builders are careless about it.
  return raw.trimStart().startsWith("{") ? fromJson() : fromForm();
}

export async function handleIntakeRequest(request: ApiRequest, deps: ApiDeps): Promise<ApiResponse> {
  const key = presentedKey(request.authorization, request.queryKey);
  const source = key ? await deps.findSource(hashKey(key)) : null;
  if (!source) return { status: 401, body: { error: "unauthorized" } };

  const reject = (outcome: "invalid" | "test" | "rate_limited", detail: string) =>
    deps.store.reject({ channel: "api", formId: source.formId, sourceId: source.id, outcome, detail, ipHash: null }).catch(() => undefined);

  if (source.limited) {
    await reject("rate_limited", "key");
    return { status: 429, body: { error: "rate_limited" }, headers: { "retry-after": "60" } };
  }

  const fields = request.body.length <= MAX_BODY_BYTES ? parseBody(request.contentType, request.body) : null;
  if (!fields) {
    await reject("invalid", "body");
    return { status: 400, body: { error: "invalid_body" } };
  }

  const mapped = mapLead(fields, parseFieldMap(source.fieldMap));
  // A page builder checks the connection with a made-up request that has no phone: it passes.
  if (!mapped.hasPhone && Object.keys(fields).some((name) => name.toLowerCase() === "test")) {
    await reject("test", "connection test");
    return { status: 200, body: { ok: true, test: true } };
  }

  const result = await submitIntake(
    {
      channel: "api",
      mapped: mapped.check,
      formId: source.formId,
      sourceId: source.id,
      language: mapped.language,
      // The request comes from a website's server, not from the visitor: there is no visitor address to limit by.
      ip: null,
      now: (deps.now ?? (() => new Date()))(),
    },
    { store: deps.store, secret: deps.secret },
  );

  if (result.status === "accepted") {
    deps.onLead?.(result.leadId);
    return { status: 201, body: { id: result.leadId, outcome: result.outcome } };
  }
  if (result.status === "invalid") return { status: 400, body: { error: "invalid", fields: result.errors } };
  if (result.status === "rate_limited") return { status: 429, body: { error: "rate_limited" }, headers: { "retry-after": "3600" } };
  return { status: 500, body: { error: "server_error" } };
}
