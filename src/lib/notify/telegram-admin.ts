import type { Fetch } from "./types";

// Setting the bot up: who it is, where Telegram delivers its updates, and
// registering our webhook. docs/SPEC.md → "Notifications → Linking Telegram".

const API = "https://api.telegram.org";

type Reply<T> = { ok: true; result: T } | { ok: false; error: string };

async function call<T>(fetcher: Fetch, token: string, method: string, body?: unknown): Promise<Reply<T>> {
  try {
    const response = await fetcher(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      // A status check must not hold a settings page for long.
      signal: AbortSignal.timeout(5000),
    });
    const result = (await response.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (response.ok && result?.ok) return { ok: true, result: result.result as T };
    return { ok: false, error: `Telegram ${response.status}: ${result?.description ?? "no details"}` };
  } catch (error) {
    return { ok: false, error: `Telegram: ${error instanceof Error ? error.message : "request failed"}` };
  }
}

/** The address Telegram should call: <app url>/api/telegram/webhook. */
export function webhookUrl(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/telegram/webhook`;
}

export type BotStatus =
  | { state: "not_configured" }
  | { state: "unreachable"; error: string }
  | {
      state: "ready";
      username: string;
      /** Where Telegram sends updates now; empty when no webhook is set. */
      webhook: string;
      /** True when that is this app's webhook. */
      connected: boolean;
      lastError: string | null;
    };

/** Who the bot is and whether its webhook points at this app. */
export async function getBotStatus(options: { token: string | undefined; appUrl: string; fetch?: Fetch }): Promise<BotStatus> {
  if (!options.token) return { state: "not_configured" };
  const fetcher = options.fetch ?? fetch;
  const [me, info] = await Promise.all([
    call<{ username?: string }>(fetcher, options.token, "getMe"),
    call<{ url?: string; last_error_message?: string }>(fetcher, options.token, "getWebhookInfo"),
  ]);
  if (!me.ok) return { state: "unreachable", error: me.error };
  if (!info.ok) return { state: "unreachable", error: info.error };
  const webhook = info.result.url ?? "";
  return {
    state: "ready",
    username: me.result.username ?? "",
    webhook,
    connected: webhook !== "" && webhook === webhookUrl(options.appUrl),
    lastError: info.result.last_error_message ?? null,
  };
}

/**
 * Connect webhook: tells Telegram to deliver the bot's messages to this app,
 * with the secret token it must send back on every call. Returns the bot's
 * username, for the links on student pages.
 */
export async function connectWebhook(options: {
  token: string | undefined;
  secret: string | undefined;
  appUrl: string;
  fetch?: Fetch;
}): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  if (!options.token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" };
  // Telegram accepts 1–256 characters of A–Z, a–z, 0–9, _ and - as a secret token.
  if (!options.secret || !/^[A-Za-z0-9_-]{1,256}$/.test(options.secret)) {
    return { ok: false, error: "TELEGRAM_WEBHOOK_SECRET must be 1–256 letters, digits, _ or -" };
  }
  const url = webhookUrl(options.appUrl);
  if (!url.startsWith("https://")) return { ok: false, error: `Telegram only calls https addresses, not ${url}` };

  const fetcher = options.fetch ?? fetch;
  const me = await call<{ username?: string }>(fetcher, options.token, "getMe");
  if (!me.ok) return me;
  const set = await call<boolean>(fetcher, options.token, "setWebhook", {
    url,
    secret_token: options.secret,
    // The bot only reads messages: /start <code> and /stop.
    allowed_updates: ["message"],
  });
  if (!set.ok) return set;
  return { ok: true, username: me.result.username ?? "" };
}
