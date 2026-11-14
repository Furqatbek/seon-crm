import type { Fetch, MessageProvider, SendResult } from "./types";

const API = "https://api.telegram.org";

/** Sends through the Telegram Bot API. `recipient` is the chat id. */
export class TelegramProvider implements MessageProvider {
  readonly channel = "telegram" as const;
  private readonly token: string | undefined;
  private readonly fetch: Fetch;

  constructor(options: { token: string | undefined; fetch?: Fetch }) {
    this.token = options.token;
    this.fetch = options.fetch ?? fetch;
  }

  async send(recipient: string, body: string): Promise<SendResult> {
    if (!this.token) return { ok: false, error: "Telegram is not configured" };
    try {
      const response = await this.fetch(`${API}/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: recipient, text: body }),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
      if (response.ok && result?.ok) return { ok: true };
      return {
        ok: false,
        error: `Telegram ${response.status}: ${result?.description ?? "no details"}`,
        // 403: the bot was blocked or the user is gone. 400: the chat does not exist.
        permanent: response.status === 403 || response.status === 400,
      };
    } catch (error) {
      return { ok: false, error: `Telegram: ${error instanceof Error ? error.message : "request failed"}` };
    }
  }
}
