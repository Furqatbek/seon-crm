import type { Fetch, MessageProvider, SendResult } from "./types.ts";

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

  send(recipient: string, body: string): Promise<SendResult> {
    return this.sendWithButtons(recipient, body);
  }

  /** A message may carry inline buttons, one row each: `data` comes back when one is pressed, `url` opens a link. */
  async sendWithButtons(
    recipient: string,
    body: string,
    buttons?: Array<Array<{ text: string; data?: string; url?: string }>>,
  ): Promise<SendResult> {
    if (!this.token) return { ok: false, error: "Telegram is not configured" };
    try {
      const response = await this.fetch(`${API}/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: recipient,
          text: body,
          ...(buttons?.length
            ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((button) => (button.url ? { text: button.text, url: button.url } : { text: button.text, callback_data: button.data }))) } }
            : {}),
        }),
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

  /** Tells Telegram a button press was handled, so its spinner stops. Failures do not matter. */
  async answerCallback(callbackId: string): Promise<void> {
    if (!this.token) return;
    await this.fetch(`${API}/bot${this.token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackId }),
    }).catch(() => undefined);
  }
}
