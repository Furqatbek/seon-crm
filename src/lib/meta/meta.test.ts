// Meta lead ads — docs/SPEC.md → "Lead forms add-on → Public intake URL and
// Meta lead ads". Recorded sample payloads (fixtures.ts); Meta is never
// called: the client here is a stand-in that answers from memory.
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { IntakeStore } from "../intake/intake";
import { LEAD, LEAD_THREE, LEAD_TWO_NAMES, TEST_LEAD, TOKEN_ERROR, WEBHOOK_BODY, WEBHOOK_BODY_TWO } from "./fixtures";
import { GraphClient, MetaError, loginUrl, type MetaClient, type MetaLead } from "./graph";
import { BACKFILL_HOURS, handleLeadgenEvents, isTestLead, leadFields, questionLabel, runBackfill, type MetaConnection, type MetaDeps } from "./leads";
import { leadgenEvents, signatureMatches, verificationChallenge } from "./webhook";

const APP_SECRET = "app-secret-for-tests";
const sign = (body: string, secret = APP_SECRET) => `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
const PAGE = "104857600000001";
const NOW = new Date("2026-11-19T09:00:00Z");

describe("the verification handshake", () => {
  const ask = (mode: string | null, token: string | null, challenge: string | null = "1158201444") => verificationChallenge({ mode, token, challenge }, "our-verify-token");

  it("answers the challenge when the mode is subscribe and the token is ours", () => {
    expect(ask("subscribe", "our-verify-token")).toBe("1158201444");
    expect(ask("subscribe", "our-verify-token", "")).toBe("");
  });

  it("refuses a wrong token, another mode, a missing part, or when no token is configured", () => {
    expect(ask("subscribe", "someone-elses-token")).toBe(null);
    expect(ask("subscribe", "our-verify-token ")).toBe(null);
    expect(ask("unsubscribe", "our-verify-token")).toBe(null);
    expect(ask(null, "our-verify-token")).toBe(null);
    expect(ask("subscribe", null)).toBe(null);
    expect(ask("subscribe", "our-verify-token", null)).toBe(null);
    expect(verificationChallenge({ mode: "subscribe", token: "", challenge: "1" }, "")).toBe(null);
    expect(verificationChallenge({ mode: "subscribe", token: "x", challenge: "1" }, undefined)).toBe(null);
  });
});

describe("the signature check", () => {
  it("accepts a delivery signed with the app secret over the bytes as they arrived", () => {
    expect(signatureMatches(WEBHOOK_BODY, sign(WEBHOOK_BODY), APP_SECRET)).toBe(true);
    expect(signatureMatches(WEBHOOK_BODY, sign(WEBHOOK_BODY).toUpperCase().replace("SHA256=", "sha256="), APP_SECRET)).toBe(true);
    // Non-ASCII text is signed as UTF-8.
    const cyrillic = '{"object":"page","note":"заявка"}';
    expect(signatureMatches(cyrillic, sign(cyrillic), APP_SECRET)).toBe(true);
  });

  it("refuses a missing, malformed or wrong signature, a changed body, another secret, and SHA-1", () => {
    expect(signatureMatches(WEBHOOK_BODY, null, APP_SECRET)).toBe(false);
    expect(signatureMatches(WEBHOOK_BODY, "", APP_SECRET)).toBe(false);
    expect(signatureMatches(WEBHOOK_BODY, sign(WEBHOOK_BODY).replace("sha256=", ""), APP_SECRET)).toBe(false);
    expect(signatureMatches(WEBHOOK_BODY, `sha256=${"0".repeat(64)}`, APP_SECRET)).toBe(false);
    expect(signatureMatches(WEBHOOK_BODY, sign(WEBHOOK_BODY, "another-secret"), APP_SECRET)).toBe(false);
    expect(signatureMatches(WEBHOOK_BODY.replace("990000000000001", "990000000000009"), sign(WEBHOOK_BODY), APP_SECRET)).toBe(false);
    // The same JSON written out again is not the same bytes.
    expect(signatureMatches(JSON.stringify(JSON.parse(WEBHOOK_BODY), null, 1), sign(WEBHOOK_BODY), APP_SECRET)).toBe(false);
    expect(signatureMatches(WEBHOOK_BODY, `sha1=${createHmac("sha1", APP_SECRET).update(WEBHOOK_BODY).digest("hex")}`, APP_SECRET)).toBe(false);
    // No secret configured: nothing is accepted.
    expect(signatureMatches(WEBHOOK_BODY, sign(WEBHOOK_BODY, ""), "")).toBe(false);
    expect(signatureMatches(WEBHOOK_BODY, sign(WEBHOOK_BODY), undefined)).toBe(false);
  });
});

describe("reading a delivery", () => {
  it("finds each leadgen notification with its lead, form, page and ad", () => {
    expect(leadgenEvents(JSON.parse(WEBHOOK_BODY))).toEqual([
      { leadgenId: "990000000000001", formId: "777000000000001", pageId: PAGE, adId: "23850000000000001", createdTime: 1795000000 },
    ]);
    expect(leadgenEvents(JSON.parse(WEBHOOK_BODY_TWO)).map((event) => [event.leadgenId, event.formId, event.adId])).toEqual([
      ["990000000000002", "777000000000001", null],
      ["990000000000003", "777000000000002", null],
    ]);
  });

  it("skips everything that is not a page's leadgen notification", () => {
    expect(leadgenEvents(null)).toEqual([]);
    expect(leadgenEvents("text")).toEqual([]);
    expect(leadgenEvents({ object: "instagram", entry: [] })).toEqual([]);
    expect(leadgenEvents({ object: "page" })).toEqual([]);
    expect(leadgenEvents({ object: "page", entry: [{ id: PAGE, changes: [{ field: "leadgen", value: { form_id: "1" } }] }] })).toEqual([]);
    expect(leadgenEvents({ object: "page", entry: [{ id: PAGE, changes: [{ field: "leadgen", value: { leadgen_id: "1; drop table", form_id: "1", page_id: PAGE } }] }] })).toEqual([]);
    // The page id may come from the entry when the value has none; numbers are read as ids.
    expect(leadgenEvents({ object: "page", entry: [{ id: PAGE, changes: [{ field: "leadgen", value: { leadgen_id: 5, form_id: 6 } }] }] })).toEqual([
      { leadgenId: "5", formId: "6", pageId: PAGE, adId: null, createdTime: null },
    ]);
  });
});

describe("mapping a lead", () => {
  it("name, phone and email are recognised; custom questions become answers with readable labels", () => {
    expect(leadFields(LEAD)).toEqual({
      "Full name": "Aziza Karimova",
      "Phone number": "+998901234567",
      Email: "aziza@example.com",
      "Qaysi kursga qiziqasiz?": "TOPIK II",
      "Which days suit you?": ["Monday", "Wednesday"],
    });
    expect(questionLabel("what_is_your_level")).toBe("What is your level");
    expect(isTestLead(LEAD)).toBe(false);
    expect(isTestLead(TEST_LEAD)).toBe(true);
  });
});

// ── A world in memory: connections, forms, an intake that behaves like the database's ──

function world(options: { leads?: MetaLead[]; funnels?: Record<string, string | null>; connection?: Partial<MetaConnection> | null } = {}) {
  const leads = new Map((options.leads ?? [LEAD, LEAD_TWO_NAMES, LEAD_THREE, TEST_LEAD]).map((lead) => [lead.id, lead]));
  const funnels = new Map(Object.entries(options.funnels ?? { "777000000000001": "funnel-1", "777000000000002": null }));
  const connection: MetaConnection | null = options.connection === null ? null : { pageId: PAGE, pageName: "SEON TOPIK", status: "connected", token: "PAGE-TOKEN", ...options.connection };

  const created: Array<{ id: string; externalId: string | null; formId: string | null; fullName: string; phone: string; answers: unknown }> = [];
  const log: Array<{ outcome: string; externalId: string | null; detail?: string }> = [];
  const calls = { lead: [] as string[], formLeads: [] as string[], alerts: [] as string[], onLead: 0, touched: 0 };
  let failWith: MetaError | null = null;

  const intake: IntakeStore = {
    async submit({ channel, formId, externalId, lead }) {
      expect(channel).toBe("meta");
      // As intake_submit() does: an id already taken is not taken again.
      const before = created.find((row) => row.externalId === externalId);
      if (before) return { outcome: "merged", leadId: before.id };
      const samePhone = created.find((row) => row.phone === lead.phone);
      if (samePhone) {
        log.push({ outcome: "merged", externalId: externalId ?? null });
        return { outcome: "merged", leadId: samePhone.id };
      }
      const row = { id: `lead-${created.length + 1}`, externalId: externalId ?? null, formId, fullName: lead.fullName, phone: lead.phone, answers: lead.answers };
      created.push(row);
      log.push({ outcome: "created", externalId: externalId ?? null });
      return { outcome: "created", leadId: row.id };
    },
    async reject({ outcome, externalId, detail }) {
      log.push({ outcome, externalId: externalId ?? null, detail });
    },
  };

  const client: MetaClient = {
    async lead(id, token) {
      calls.lead.push(id);
      expect(token).toBe("PAGE-TOKEN");
      if (failWith) throw failWith;
      const lead = leads.get(id);
      if (!lead) throw new MetaError("Unsupported get request", false, 100);
      return lead;
    },
    async formLeads(formId, token, since) {
      calls.formLeads.push(formId);
      expect(token).toBe("PAGE-TOKEN");
      expect(since.toISOString()).toBe(new Date(NOW.getTime() - BACKFILL_HOURS * 3_600_000).toISOString());
      if (failWith) throw failWith;
      // Newest first, as Meta lists them.
      return [...leads.values()].filter((lead) => lead.form_id === formId).reverse();
    },
    forms: async () => [],
    pages: async () => [],
    subscribe: async () => {},
    exchangeCode: async () => "",
  };

  const deps: MetaDeps = {
    client,
    intake,
    secret: "signing-secret",
    store: {
      connection: async (pageId) => (connection && pageId === connection.pageId ? connection : null),
      connections: async () => (connection && connection.status === "connected" ? [connection] : []),
      forms: async () => [...funnels].map(([metaFormId, funnelId]) => ({ metaFormId, funnelId })),
      funnelOf: async (_page, metaFormId) => funnels.get(metaFormId) ?? null,
      known: async (ids) => new Set(ids.filter((id) => log.some((row) => row.externalId === id && ["created", "merged", "invalid", "test"].includes(row.outcome)))),
      markReconnect: async (_page, detail) => {
        if (!connection || connection.status !== "connected") return false;
        connection.status = "needs_reconnect";
        calls.alerts.push(`marked:${detail.slice(0, 30)}`);
        return true;
      },
      touch: async () => void (calls.touched += 1),
    },
    alertOwner: async (page, detail) => void calls.alerts.push(`alert:${page.pageName}:${detail.slice(0, 30)}`),
    onLead: () => void (calls.onLead += 1),
    now: () => NOW,
  };
  return { deps, created, log, calls, connection, fail: (error: MetaError | null) => (failWith = error) };
}

const deliver = (body: string, deps: MetaDeps) => handleLeadgenEvents(leadgenEvents(JSON.parse(body)), deps);

describe("a webhook delivery", () => {
  it("fetches the lead by its leadgen id and hands it to the shared intake with name, phone, answers, funnel and external id", async () => {
    const { deps, created, log, calls } = world();
    expect(await deliver(WEBHOOK_BODY, deps)).toMatchObject({ created: 1, merged: 0, known: 0, error: 0, skipped: 0 });
    expect(calls.lead).toEqual(["990000000000001"]);
    expect(created).toEqual([
      {
        id: "lead-1",
        externalId: "990000000000001",
        // The Meta form's funnel.
        formId: "funnel-1",
        fullName: "Aziza Karimova",
        phone: "+998901234567",
        answers: [
          { id: "email", type: "short_text", label: "Email", value: "aziza@example.com" },
          { id: "qaysikursgaqiziqasiz?", type: "short_text", label: "Qaysi kursga qiziqasiz?", value: "TOPIK II" },
          { id: "whichdayssuityou?", type: "short_text", label: "Which days suit you?", value: "Monday, Wednesday" },
        ],
      },
    ]);
    expect(log).toEqual([{ outcome: "created", externalId: "990000000000001" }]);
    expect(calls.onLead).toBe(1);
    expect(calls.touched).toBe(1);
  });

  it("a duplicate delivery creates one lead", async () => {
    const { deps, created, calls } = world();
    await deliver(WEBHOOK_BODY, deps);
    // Meta delivers at least once: the same notification again, and again.
    expect(await deliver(WEBHOOK_BODY, deps)).toMatchObject({ created: 0, merged: 0, known: 1 });
    expect(await deliver(WEBHOOK_BODY, deps)).toMatchObject({ created: 0, known: 1 });
    expect(created).toHaveLength(1);
    // It was not even fetched again.
    expect(calls.lead).toEqual(["990000000000001"]);
    expect(calls.onLead).toBe(1);
  });

  it("the same lead named twice in one delivery, or two deliveries racing, is still one lead", async () => {
    const { deps, created } = world();
    const twice = JSON.parse(WEBHOOK_BODY) as { entry: unknown[] };
    twice.entry.push(twice.entry[0]);
    expect(await handleLeadgenEvents(leadgenEvents(twice), deps)).toMatchObject({ created: 1, known: 1 });
    // Two deliveries at the same moment: both fetch, the intake takes the id once.
    const racing = world();
    const [first, second] = await Promise.all([deliver(WEBHOOK_BODY, racing.deps), deliver(WEBHOOK_BODY, racing.deps)]);
    expect(first.created + second.created).toBe(1);
    expect(first.merged + second.merged + first.known + second.known).toBe(1);
    expect(racing.created).toHaveLength(1);
    expect(created).toHaveLength(1);
  });

  it("several leads in one delivery: each to its own form's funnel, first and last name joined, the phone normalised", async () => {
    const { deps, created } = world();
    expect(await deliver(WEBHOOK_BODY_TWO, deps)).toMatchObject({ created: 2 });
    expect(created.map((row) => [row.externalId, row.formId, row.fullName, row.phone])).toEqual([
      ["990000000000002", "funnel-1", "Bobur Aliyev", "+998907654321"],
      // A Meta form with no funnel: the lead still comes in.
      ["990000000000003", null, "Dilnoza Rahimova", "+998935550011"],
    ]);
  });

  it("a lead from the Lead Ads Testing Tool is logged as a test and makes no lead", async () => {
    const { deps, created, log, calls } = world();
    const body = WEBHOOK_BODY.replace("990000000000001", TEST_LEAD.id);
    expect(await deliver(body, deps)).toMatchObject({ test: 1, created: 0, invalid: 0 });
    expect(created).toEqual([]);
    expect(log).toEqual([{ outcome: "test", externalId: TEST_LEAD.id, detail: "Meta test lead" }]);
    expect(calls.touched).toBe(1);
    // Delivered again: already known.
    expect(await deliver(body, deps)).toMatchObject({ known: 1, test: 0 });
  });

  it("a lead without a usable phone is refused and remembered, not retried for ever", async () => {
    const broken: MetaLead = { ...LEAD, field_data: [{ name: "full_name", values: ["No Phone"] }, { name: "phone_number", values: ["12345"] }] };
    const { deps, created, log } = world({ leads: [broken] });
    expect(await deliver(WEBHOOK_BODY, deps)).toMatchObject({ invalid: 1 });
    expect(created).toEqual([]);
    expect(log).toMatchObject([{ outcome: "invalid", externalId: "990000000000001", detail: "phone:phone" }]);
    expect(await deliver(WEBHOOK_BODY, deps)).toMatchObject({ known: 1, invalid: 0 });
  });

  it("a Page that is not connected here is skipped without asking Meta", async () => {
    const { deps, calls, created } = world({ connection: null });
    expect(await deliver(WEBHOOK_BODY, deps)).toMatchObject({ skipped: 1, created: 0 });
    expect(calls.lead).toEqual([]);
    expect(created).toEqual([]);
  });
});

describe("a failing token", () => {
  it("sets Needs reconnect and alerts the owner once; later deliveries wait for the reconnect", async () => {
    const { deps, calls, created, connection, fail } = world();
    fail(new MetaError(TOKEN_ERROR.error.message, true, TOKEN_ERROR.error.code));
    expect(await deliver(WEBHOOK_BODY, deps)).toMatchObject({ error: 1, created: 0 });
    expect(connection?.status).toBe("needs_reconnect");
    expect(calls.alerts).toEqual(["marked:Error validating access token:", "alert:SEON TOPIK:Error validating access token:"]);
    // Another lead while it is broken: nothing is fetched, nobody is alerted again.
    expect(await deliver(WEBHOOK_BODY_TWO, deps)).toMatchObject({ skipped: 2 });
    expect(calls.lead).toEqual(["990000000000001"]);
    expect(calls.alerts).toHaveLength(2);
    expect(created).toEqual([]);
  });

  it("an error that is not about the token changes nothing: the catch-up will try again", async () => {
    const { deps, calls, connection, fail } = world();
    fail(new MetaError("An unknown error occurred", false, 1));
    expect(await deliver(WEBHOOK_BODY, deps)).toMatchObject({ error: 1 });
    expect(connection?.status).toBe("connected");
    expect(calls.alerts).toEqual([]);
  });

  it("is recognised from what Meta answers: code 190, a missing permission, HTTP 401", async () => {
    const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    const failure = async (doFetch: typeof fetch) => new GraphClient({ id: "1", secret: "s" }, doFetch).lead("990000000000001", "PAGE-TOKEN").catch((error: unknown) => error as MetaError);
    expect(await failure(answer(400, TOKEN_ERROR))).toMatchObject({ name: "MetaError", reconnect: true, code: 190 });
    expect(await failure(answer(403, { error: { message: "(#200) Requires leads_retrieval permission", code: 200 } }))).toMatchObject({ reconnect: true, code: 200 });
    expect(await failure(answer(401, {}))).toMatchObject({ reconnect: true });
    expect(await failure(answer(500, { error: { message: "An unknown error occurred", code: 1 } }))).toMatchObject({ reconnect: false, code: 1 });
    expect(await failure(answer(400, { error: { message: "(#4) Application request limit reached", code: 4 } }))).toMatchObject({ reconnect: false });
    expect(await failure((async () => Promise.reject(new Error("socket hang up"))) as unknown as typeof fetch)).toMatchObject({ reconnect: false });
  });
});

describe("the hourly catch-up", () => {
  it("reads the last 48 hours of every listed form and takes what the webhook missed", async () => {
    const { deps, created, calls } = world();
    expect(await runBackfill(deps)).toMatchObject({ created: 3, test: 1, known: 0, error: 0 });
    expect(calls.formLeads).toEqual(["777000000000001", "777000000000002"]);
    // Taken from the list itself: no lead is fetched one by one.
    expect(calls.lead).toEqual([]);
    expect(created.map((row) => row.externalId)).toEqual(["990000000000001", "990000000000002", "990000000000003"]);
  });

  it("skips known external ids: what the webhook already took, and what an earlier catch-up took", async () => {
    const { deps, created, calls } = world();
    await deliver(WEBHOOK_BODY, deps);
    expect(await runBackfill(deps)).toMatchObject({ created: 2, test: 1, known: 1 });
    // An hour later: everything is known, nothing is created, nobody is told again.
    const alertsBefore = calls.onLead;
    expect(await runBackfill(deps)).toMatchObject({ created: 0, merged: 0, test: 0, known: 4 });
    expect(created).toHaveLength(3);
    expect(calls.onLead).toBe(alertsBefore);
  });

  it("a lead merged into an open lead by its phone is not merged again an hour later", async () => {
    const repeat: MetaLead = { ...LEAD, id: "990000000000050", created_time: "2026-11-19T08:40:00+0000" };
    const { deps, created, log } = world({ leads: [LEAD, repeat] });
    expect(await runBackfill(deps)).toMatchObject({ created: 1, merged: 1 });
    expect(await runBackfill(deps)).toMatchObject({ created: 0, merged: 0, known: 2 });
    expect(created).toHaveLength(1);
    expect(log.filter((row) => row.outcome === "merged")).toHaveLength(1);
  });

  it("a failing token marks the Page once and stops reading its other forms", async () => {
    const { deps, calls, connection, fail } = world();
    fail(new MetaError(TOKEN_ERROR.error.message, true, 190));
    expect(await runBackfill(deps)).toMatchObject({ error: 1, created: 0 });
    expect(calls.formLeads).toEqual(["777000000000001"]);
    expect(connection?.status).toBe("needs_reconnect");
    expect(calls.alerts.filter((entry) => entry.startsWith("alert:"))).toHaveLength(1);
    // The next run leaves a Page that needs reconnecting alone.
    expect(await runBackfill(deps)).toMatchObject({ error: 0, created: 0 });
    expect(calls.formLeads).toHaveLength(1);
  });
});

describe("Connect with Facebook", () => {
  it("sends the owner to Facebook's dialog with the app, the return address, a state and the permissions", () => {
    const url = new URL(loginUrl("1234567890", "https://crm.example.uz/auth/meta/callback", "state-abc", "v23.0"));
    expect(`${url.origin}${url.pathname}`).toBe("https://www.facebook.com/v23.0/dialog/oauth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "1234567890",
      redirect_uri: "https://crm.example.uz/auth/meta/callback",
      state: "state-abc",
      scope: "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_manage_ads,leads_retrieval",
      response_type: "code",
    });
  });

  it("the Graph client asks for what it should, and never leaks a token into an error", async () => {
    const seen: string[] = [];
    const doFetch = (async (input: URL, init?: RequestInit) => {
      seen.push(`${init?.method} ${input.origin}${input.pathname}?${[...input.searchParams.keys()].sort().join("&")}`);
      const path = input.pathname;
      if (path.endsWith("/leadgen_forms")) return Response.json({ data: [{ id: "777000000000001", name: "TOPIK autumn", status: "ACTIVE" }] });
      if (path.endsWith("/me/accounts")) return Response.json({ data: [{ id: PAGE, name: "SEON TOPIK", access_token: "PAGE-TOKEN" }, { id: "2", name: "No token" }] });
      if (path.endsWith("/oauth/access_token")) return Response.json({ access_token: input.searchParams.has("code") ? "SHORT" : "LONG" });
      if (path.endsWith("/leads")) return Response.json({ data: [LEAD] });
      if (path.endsWith("/subscribed_apps")) return Response.json({ success: true });
      return Response.json(LEAD);
    }) as unknown as typeof fetch;
    const client = new GraphClient({ id: "1234567890", secret: APP_SECRET }, doFetch, "v23.0");

    expect(await client.exchangeCode("CODE", "https://crm.example.uz/auth/meta/callback")).toBe("LONG");
    expect(await client.pages("LONG")).toEqual([{ id: PAGE, name: "SEON TOPIK", accessToken: "PAGE-TOKEN" }]);
    await client.subscribe(PAGE, "PAGE-TOKEN");
    expect(await client.forms(PAGE, "PAGE-TOKEN")).toEqual([{ id: "777000000000001", name: "TOPIK autumn", status: "ACTIVE" }]);
    expect((await client.lead("990000000000001", "PAGE-TOKEN")).id).toBe("990000000000001");
    expect(await client.formLeads("777000000000001", "PAGE-TOKEN", NOW)).toHaveLength(1);
    expect(seen).toEqual([
      "GET https://graph.facebook.com/v23.0/oauth/access_token?client_id&client_secret&code&redirect_uri",
      "GET https://graph.facebook.com/v23.0/oauth/access_token?client_id&client_secret&fb_exchange_token&grant_type",
      "GET https://graph.facebook.com/v23.0/me/accounts?access_token&fields&limit",
      `POST https://graph.facebook.com/v23.0/${PAGE}/subscribed_apps?access_token&subscribed_fields`,
      `GET https://graph.facebook.com/v23.0/${PAGE}/leadgen_forms?access_token&fields&limit`,
      "GET https://graph.facebook.com/v23.0/990000000000001?access_token&fields",
      "GET https://graph.facebook.com/v23.0/777000000000001/leads?access_token&fields&filtering&limit",
    ]);

    const failing = new GraphClient({ id: "1", secret: "s" }, (async () => new Response(JSON.stringify(TOKEN_ERROR), { status: 400 })) as unknown as typeof fetch);
    const error = await failing.lead("1", "SECRET-PAGE-TOKEN").then(
      () => new Error("no error"),
      (caught: unknown) => caught as Error,
    );
    expect(error.message).toContain("Error validating access token");
    expect(error.message).not.toContain("SECRET-PAGE-TOKEN");
  });
});
