import { createSign } from "node:crypto";

import type { Fetch } from "./types.ts";

// Push through the Firebase Cloud Messaging HTTP v1 API —
// docs/STUDENT_APP_SPEC.md → "Rules → Notifications". The server signs a
// short-lived token with the Firebase service account (FIREBASE_SERVICE_ACCOUNT:
// the downloaded JSON key, as it is or base64-encoded) and sends one message
// per device token. No runtime imports from the app, so tests load it directly.

export type ServiceAccount = { project_id: string; client_email: string; private_key: string };

export type PushMessage = {
  title: string;
  body: string;
  /** Where a tap leads; FCM carries strings only. */
  data?: Record<string, string>;
};

export type PushResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** The app was removed or the token replaced: forget this token. */
      unregistered?: boolean;
    };

/** Anything that can push to one device. */
export interface PushSender {
  send(token: string, message: PushMessage): Promise<PushResult>;
}

/** The service account from the environment, or null when it is missing or not a key. */
export function readServiceAccount(raw: string | undefined): ServiceAccount | null {
  const text = raw?.trim();
  if (!text) return null;
  for (const candidate of [text, Buffer.from(text, "base64").toString("utf8")]) {
    try {
      const parsed = JSON.parse(candidate) as Partial<ServiceAccount>;
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        // A key pasted into an environment variable often has its line breaks escaped.
        return { project_id: parsed.project_id, client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") };
      }
    } catch {
      // Not JSON as it is: try the base64 reading.
    }
  }
  return null;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export class FcmSender implements PushSender {
  private readonly account: ServiceAccount | null;
  private readonly fetch: Fetch;
  private readonly now: () => Date;
  private token: { value: string; expiresAt: number } | null = null;
  /** One token request at a time, however many pushes are waiting for it. */
  private pending: Promise<string> | null = null;

  constructor(options: { account: ServiceAccount | null; fetch?: Fetch; now?: () => Date }) {
    this.account = options.account;
    this.fetch = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  get configured(): boolean {
    return this.account !== null;
  }

  private async requestToken(account: ServiceAccount): Promise<string> {
    const issued = Math.floor(this.now().getTime() / 1000);
    const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
      JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: issued, exp: issued + 3600 }),
    )}`;
    const assertion = `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(account.private_key).toString("base64url")}`;
    const response = await this.fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    });
    const result = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string } | null;
    if (!response.ok || !result?.access_token) {
      throw new Error(`Firebase token ${response.status}: ${result?.error_description ?? "no token"}`);
    }
    this.token = { value: result.access_token, expiresAt: this.now().getTime() + ((result.expires_in ?? 3600) - 60) * 1000 };
    return result.access_token;
  }

  private async accessToken(account: ServiceAccount, fresh: boolean): Promise<string> {
    if (!fresh && this.token && this.token.expiresAt > this.now().getTime()) return this.token.value;
    this.pending ??= this.requestToken(account).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async post(account: ServiceAccount, token: string, message: PushMessage, fresh: boolean): Promise<Response> {
    const access = await this.accessToken(account, fresh);
    return this.fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: message.title, body: message.body },
          ...(message.data && Object.keys(message.data).length > 0 ? { data: message.data } : {}),
        },
      }),
    });
  }

  async send(token: string, message: PushMessage): Promise<PushResult> {
    const account = this.account;
    if (!account) return { ok: false, error: "Push is not configured" };
    try {
      let response = await this.post(account, token, message, false);
      if (response.status === 401) {
        // The cached access token ran out early: ask for a new one and try once more.
        this.token = null;
        response = await this.post(account, token, message, true);
      }
      if (response.ok) return { ok: true };
      const result = (await response.json().catch(() => null)) as {
        error?: { message?: string; status?: string; details?: Array<{ errorCode?: string }> };
      } | null;
      const code = result?.error?.details?.find((detail) => detail.errorCode)?.errorCode ?? result?.error?.status ?? "";
      // 404 UNREGISTERED: the app is gone from that phone. Any other refusal may be
      // about the message, not the token, so the token is kept.
      const unregistered = response.status === 404 || code === "UNREGISTERED";
      return { ok: false, error: `FCM ${response.status}: ${result?.error?.message ?? "no details"}`, ...(unregistered ? { unregistered } : {}) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "FCM: request failed" };
    }
  }
}
