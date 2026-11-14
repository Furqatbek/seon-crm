import type { Fetch, SendResult, SmsProvider } from "./types";

const API = "https://notify.eskiz.uz/api";
/** Eskiz's shared sender name, used until the centre has its own. */
const DEFAULT_SENDER = "4546";

/**
 * SMS through Eskiz.uz: log in with email and password for a token, keep it,
 * and log in again once when a request comes back 401.
 * `recipient` is a phone as +998XXXXXXXXX.
 */
export class EskizProvider implements SmsProvider {
  readonly channel = "sms" as const;
  private readonly email: string | undefined;
  private readonly password: string | undefined;
  private readonly sender: string;
  private readonly fetch: Fetch;
  private token: string | null = null;
  /** One login at a time, however many messages are waiting for it. */
  private login: Promise<string> | null = null;

  constructor(options: { email: string | undefined; password: string | undefined; sender?: string; fetch?: Fetch }) {
    this.email = options.email;
    this.password = options.password;
    this.sender = options.sender || DEFAULT_SENDER;
    this.fetch = options.fetch ?? fetch;
  }

  private async logIn(): Promise<string> {
    const form = new FormData();
    form.set("email", this.email ?? "");
    form.set("password", this.password ?? "");
    const response = await this.fetch(`${API}/auth/login`, { method: "POST", body: form });
    const result = (await response.json().catch(() => null)) as { data?: { token?: string }; message?: string } | null;
    const token = result?.data?.token;
    if (!response.ok || !token) {
      throw new Error(`Eskiz login ${response.status}: ${result?.message ?? "no token"}`);
    }
    return token;
  }

  private async getToken(fresh: boolean): Promise<string> {
    if (this.token && !fresh) return this.token;
    this.login ??= this.logIn().finally(() => {
      this.login = null;
    });
    this.token = await this.login;
    return this.token;
  }

  private async post(recipient: string, body: string, fresh: boolean): Promise<Response> {
    const token = await this.getToken(fresh);
    const form = new FormData();
    form.set("mobile_phone", recipient.replace(/\D/g, ""));
    form.set("message", body);
    form.set("from", this.sender);
    return this.fetch(`${API}/message/sms/send`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
  }

  async send(recipient: string, body: string): Promise<SendResult> {
    if (!this.email || !this.password) return { ok: false, error: "SMS is not configured" };
    try {
      let response = await this.post(recipient, body, false);
      if (response.status === 401) {
        // The cached token ran out: log in again and try once more.
        this.token = null;
        response = await this.post(recipient, body, true);
      }
      const result = (await response.json().catch(() => null)) as { message?: unknown } | null;
      if (response.ok) return { ok: true };
      const details = typeof result?.message === "string" ? result.message : JSON.stringify(result?.message ?? "no details");
      return { ok: false, error: `Eskiz ${response.status}: ${details}` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Eskiz: request failed" };
    }
  }
}
