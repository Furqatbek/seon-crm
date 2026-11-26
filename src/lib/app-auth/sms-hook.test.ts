import { describe, expect, it } from "vitest";

import { CODE_TEXTS, codeText, handleSendSms, hookSignatureValid, readHookPayload, signHook, type HookDeps } from "./sms-hook";

// A secret in the shape Supabase shows it, and a payload as its docs give it.
const SECRET = `v1,whsec_${Buffer.from("a-test-secret-of-32-bytes-or-more!").toString("base64")}`;
const NOW = new Date("2026-11-26T10:00:00Z");
const TIMESTAMP = String(NOW.getTime() / 1000);
const ID = "msg_2b7Xq";

const payload = (overrides: { phone?: string; confirmed?: boolean; newPhone?: string; otp?: string } = {}) =>
  JSON.stringify({
    user: {
      id: "6481a5c1-3d37-4a56-9f6a-bee08c554965",
      aud: "authenticated",
      role: "authenticated",
      email: "",
      phone: overrides.phone ?? "998901234567",
      phone_confirmed_at: overrides.confirmed ? "2026-11-01T08:00:00Z" : null,
      app_metadata: { provider: "phone", providers: ["phone"] },
      user_metadata: { full_name: "Aziza Karimova", korean_level: "beginner" },
      is_anonymous: false,
    },
    sms: { otp: overrides.otp ?? "561166", ...(overrides.newPhone ? { phone: overrides.newPhone } : {}) },
  });

const signed = (body: string, timestamp = TIMESTAMP) => ({ id: ID, timestamp, signature: signHook(SECRET, ID, timestamp, body) });

function deps(overrides: Partial<HookDeps> = {}) {
  const sent: Array<{ phone: string; text: string }> = [];
  const counts = new Map<string, number>();
  const hook: HookDeps = {
    secret: SECRET,
    now: () => NOW,
    // Three an hour per phone, as sms_code_allowed() counts them.
    allowed: async (phone) => {
      const used = counts.get(phone) ?? 0;
      if (used >= 3) return false;
      counts.set(phone, used + 1);
      return true;
    },
    release: async (phone) => void counts.set(phone, (counts.get(phone) ?? 1) - 1),
    centreName: async () => "Seon oʻquv markazi",
    send: async (phone, text) => {
      sent.push({ phone, text });
      return { ok: true };
    },
    ...overrides,
  };
  return { hook, sent };
}

describe("Send SMS hook", () => {
  it("accepts a signed sample payload and sends the sign-up code through the SMS provider", async () => {
    const { hook, sent } = deps();
    const body = payload();
    const response = await handleSendSms(signed(body), body, hook);
    expect(response).toEqual({ status: 200, body: {} });
    expect(sent).toEqual([
      { phone: "+998901234567", text: "Seon o'quv markazi: ro'yxatdan o'tish kodi 561166. Kodni hech kimga aytmang." },
    ]);
  });

  it("sends the confirmation text to someone who already has an account, and to a new phone when it is changing", async () => {
    const { hook, sent } = deps();
    const reset = payload({ confirmed: true });
    await handleSendSms(signed(reset), reset, hook);
    const change = payload({ confirmed: true, newPhone: "+998935550011" });
    await handleSendSms(signed(change), change, hook);
    expect(sent).toEqual([
      { phone: "+998901234567", text: "Seon o'quv markazi: tasdiqlash kodi 561166. Kodni hech kimga aytmang." },
      { phone: "+998935550011", text: "Seon o'quv markazi: tasdiqlash kodi 561166. Kodni hech kimga aytmang." },
    ]);
  });

  it("refuses a wrong, missing or tampered signature and sends nothing", async () => {
    const { hook, sent } = deps();
    const body = payload();
    const good = signed(body);
    const other = `v1,whsec_${Buffer.from("another-secret-entirely-0123456789").toString("base64")}`;
    const attempts = [
      { ...good, signature: signHook(other, ID, TIMESTAMP, body) },
      { ...good, signature: null },
      { ...good, id: null },
      { ...good, timestamp: null },
      { ...good, id: "msg_other" },
      { ...good, signature: "v1,AAAA" },
    ];
    for (const headers of attempts) {
      expect((await handleSendSms(headers, body, hook)).status).toBe(401);
    }
    // The same signature over a body with another phone.
    expect((await handleSendSms(good, payload({ phone: "998907654321" }), hook)).status).toBe(401);
    expect(sent).toEqual([]);
  });

  it("refuses everything while the secret is not set", async () => {
    const { hook, sent } = deps({ secret: undefined });
    const body = payload();
    expect((await handleSendSms(signed(body), body, hook)).status).toBe(401);
    expect(sent).toEqual([]);
  });

  it("refuses a replay: a signature more than five minutes old or from the future", async () => {
    const body = payload();
    const at = (seconds: number) => String(NOW.getTime() / 1000 + seconds);
    expect(hookSignatureValid(signed(body, at(-299)), body, SECRET, NOW)).toBe(true);
    expect(hookSignatureValid(signed(body, at(-301)), body, SECRET, NOW)).toBe(false);
    expect(hookSignatureValid(signed(body, at(301)), body, SECRET, NOW)).toBe(false);
    expect(hookSignatureValid(signed(body, "not-a-time"), body, SECRET, NOW)).toBe(false);
  });

  it("accepts any of several signatures while the secret is being rotated", () => {
    const body = payload();
    const good = signed(body);
    expect(hookSignatureValid({ ...good, signature: `v1,AAAA ${good.signature}` }, body, SECRET, NOW)).toBe(true);
  });

  it("sends at most 3 codes per phone per hour and answers 429 after that", async () => {
    const { hook, sent } = deps();
    const body = payload();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) statuses.push((await handleSendSms(signed(body), body, hook)).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(sent).toHaveLength(3);

    const fourth = await handleSendSms(signed(body), body, hook);
    expect(fourth.body).toEqual({ error: { http_code: 429, message: "sms_rate_limited" } });
    expect(fourth.headers).toEqual({ "retry-after": "3600" });

    // Another phone has its own count.
    const another = payload({ phone: "998907654321" });
    expect((await handleSendSms(signed(another), another, hook)).status).toBe(200);
  });

  it("refuses a phone that is not Uzbek, and a payload without a code, before counting or sending", async () => {
    let asked = 0;
    const { hook, sent } = deps({ allowed: async () => ((asked += 1), true) });
    for (const body of [payload({ phone: "15551234567" }), payload({ otp: "" }), "not json", JSON.stringify({})]) {
      expect((await handleSendSms(signed(body), body, hook)).status).toBe(400);
    }
    expect(asked).toBe(0);
    expect(sent).toEqual([]);
  });

  it("answers 500 when the SMS provider fails, without giving its error away or using up the phone's codes", async () => {
    const { hook } = deps({ send: async () => ({ ok: false, error: "Eskiz 400: balance" }) });
    const body = payload();
    for (let i = 0; i < 5; i += 1) {
      const response = await handleSendSms(signed(body), body, hook);
      expect(response).toEqual({ status: 500, body: { error: { http_code: 500, message: "sms_send_failed" } } });
    }
  });

  it("without sms.phone, a phone change just asked for goes to the new number; an abandoned one does not", async () => {
    const change = (askedAt: string) => ({
      user: { phone: "998901234567", phone_confirmed_at: "2026-11-01T08:00:00Z", new_phone: "998935550011", phone_change_sent_at: askedAt },
      sms: { otp: "561166" },
    });
    expect(readHookPayload(change("2026-11-26T09:59:30Z"), NOW)?.phone).toBe("+998935550011");
    expect(readHookPayload(change("2026-11-20T09:00:00Z"), NOW)?.phone).toBe("+998901234567");
  });

  it("answers with codes the app translates, never with a text of its own", async () => {
    const { hook } = deps();
    const foreign = payload({ phone: "15551234567" });
    expect((await handleSendSms(signed(foreign), foreign, hook)).body).toEqual({ error: { http_code: 400, message: "phone_not_supported" } });
    expect((await handleSendSms({ id: null, timestamp: null, signature: null }, foreign, hook)).body).toEqual({ error: { http_code: 401, message: "invalid_signature" } });
  });

  it("reads the phone with or without a plus", () => {
    expect(readHookPayload(JSON.parse(payload({ phone: "+998901234567" })))).toEqual({ phone: "+998901234567", code: "561166", kind: "sign_up" });
    expect(readHookPayload(JSON.parse(payload({ phone: "998901234567" })))?.phone).toBe("+998901234567");
  });

  it("the texts are Latin Uzbek with a straight apostrophe and fit one SMS", () => {
    for (const kind of ["sign_up", "confirm"] as const) {
      expect(CODE_TEXTS[kind]).not.toMatch(/[ʻʼ‘’]/);
      const text = codeText(kind, "Seon oʻquv markazi", "123456");
      expect(text).toMatch(/^[\x20-\x7e]+$/);
      expect(text.length).toBeLessThanOrEqual(160);
    }
  });
});
