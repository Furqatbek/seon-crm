import { describe, expect, it } from "vitest";

import { connectWebhook, getBotStatus, webhookUrl } from "./telegram-admin";
import type { Fetch } from "./types";

function fakeTelegram(replies: Record<string, { status?: number; body: unknown }>) {
  const calls: Array<{ method: string; body: unknown }> = [];
  const fetch: Fetch = async (url, init) => {
    const method = url.split("/").at(-1)!;
    calls.push({ method, body: JSON.parse(String(init?.body ?? "{}")) });
    const reply = replies[method] ?? { status: 404, body: { ok: false, description: "Not Found" } };
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  };
  return { fetch, calls };
}

const APP = "https://crm.example.uz";

describe("webhookUrl", () => {
  it("is the app's webhook route, whatever the trailing slash", () => {
    expect(webhookUrl("https://crm.example.uz")).toBe("https://crm.example.uz/api/telegram/webhook");
    expect(webhookUrl("https://crm.example.uz/")).toBe("https://crm.example.uz/api/telegram/webhook");
  });
});

describe("connectWebhook", () => {
  it("calls setWebhook with the app's address and the secret token", async () => {
    const { fetch, calls } = fakeTelegram({
      getMe: { body: { ok: true, result: { username: "seon_bot" } } },
      setWebhook: { body: { ok: true, result: true } },
    });
    expect(await connectWebhook({ token: "1:A", secret: "s3cret_token-1", appUrl: APP, fetch })).toEqual({ ok: true, username: "seon_bot" });
    expect(calls.at(-1)).toEqual({
      method: "setWebhook",
      body: { url: "https://crm.example.uz/api/telegram/webhook", secret_token: "s3cret_token-1", allowed_updates: ["message"] },
    });
  });

  it("refuses before calling Telegram when the token, the secret or the address cannot work", async () => {
    const { fetch, calls } = fakeTelegram({});
    expect(await connectWebhook({ token: undefined, secret: "s", appUrl: APP, fetch })).toMatchObject({ ok: false });
    expect(await connectWebhook({ token: "1:A", secret: undefined, appUrl: APP, fetch })).toMatchObject({ ok: false });
    expect(await connectWebhook({ token: "1:A", secret: "has space", appUrl: APP, fetch })).toMatchObject({ ok: false });
    expect(await connectWebhook({ token: "1:A", secret: "s", appUrl: "http://localhost:3000", fetch })).toEqual({
      ok: false,
      error: "Telegram only calls https addresses, not http://localhost:3000/api/telegram/webhook",
    });
    expect(calls).toEqual([]);
  });

  it("reports Telegram's own error", async () => {
    const wrongToken = fakeTelegram({ getMe: { status: 401, body: { ok: false, description: "Unauthorized" } } });
    expect(await connectWebhook({ token: "bad", secret: "s", appUrl: APP, fetch: wrongToken.fetch })).toEqual({ ok: false, error: "Telegram 401: Unauthorized" });
    const refused = fakeTelegram({
      getMe: { body: { ok: true, result: { username: "seon_bot" } } },
      setWebhook: { status: 400, body: { ok: false, description: "Bad Request: bad webhook" } },
    });
    expect(await connectWebhook({ token: "1:A", secret: "s", appUrl: APP, fetch: refused.fetch })).toEqual({ ok: false, error: "Telegram 400: Bad Request: bad webhook" });
  });
});

describe("getBotStatus", () => {
  it("says whether the webhook is this app's", async () => {
    const ours = fakeTelegram({
      getMe: { body: { ok: true, result: { username: "seon_bot" } } },
      getWebhookInfo: { body: { ok: true, result: { url: "https://crm.example.uz/api/telegram/webhook" } } },
    });
    expect(await getBotStatus({ token: "1:A", appUrl: APP, fetch: ours.fetch })).toEqual({
      state: "ready",
      username: "seon_bot",
      webhook: "https://crm.example.uz/api/telegram/webhook",
      connected: true,
      lastError: null,
    });
    const elsewhere = fakeTelegram({
      getMe: { body: { ok: true, result: { username: "seon_bot" } } },
      getWebhookInfo: { body: { ok: true, result: { url: "https://old.example.uz/hook", last_error_message: "Wrong response from the webhook: 403 Forbidden" } } },
    });
    expect(await getBotStatus({ token: "1:A", appUrl: APP, fetch: elsewhere.fetch })).toMatchObject({
      connected: false,
      lastError: "Wrong response from the webhook: 403 Forbidden",
    });
    const none = fakeTelegram({
      getMe: { body: { ok: true, result: { username: "seon_bot" } } },
      getWebhookInfo: { body: { ok: true, result: { url: "" } } },
    });
    expect(await getBotStatus({ token: "1:A", appUrl: APP, fetch: none.fetch })).toMatchObject({ state: "ready", connected: false, webhook: "" });
  });

  it("is not configured without a token, and unreachable when Telegram does not answer", async () => {
    expect(await getBotStatus({ token: undefined, appUrl: APP })).toEqual({ state: "not_configured" });
    const down: Fetch = async () => {
      throw new Error("network down");
    };
    expect(await getBotStatus({ token: "1:A", appUrl: APP, fetch: down })).toEqual({ state: "unreachable", error: "Telegram: network down" });
  });
});
