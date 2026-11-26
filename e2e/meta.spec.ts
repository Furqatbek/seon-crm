import { createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";

import { WEBHOOK_BODY } from "../src/lib/meta/fixtures";
import { signIn } from "./support/auth";
import { withDb } from "./support/db";

// Meta lead ads — docs/SPEC.md → "Lead forms add-on → Public intake URL and Meta
// lead ads"; docs/META_SETUP.md. The webhook's checks, the hourly job's door
// and Settings → Integrations, with a made-up Meta app (playwright.config.ts).
// Meta is never called: nothing here has a connected Page with a token, so
// there is nothing to fetch. Lead mapping, duplicate deliveries and the
// catch-up are unit-tested with sample payloads in src/lib/meta/meta.test.ts.

const FORMS_HOST = process.env.FORMS_HOST ?? "forms.localhost:3000";
const HOST = { host: FORMS_HOST };
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN ?? "e2e-meta-verify-token";
const APP_SECRET = process.env.META_APP_SECRET ?? "e2e-meta-app-secret";
const APP_ID = process.env.META_APP_ID ?? "1234567890";
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-cron-secret";
const SHOTS = "/tmp/claude-0/-home-user-seon-crm/8e2658c1-db42-5c63-9a77-a99d1f3e7aa2/scratchpad/shots/meta";

// A Page that needs reconnecting (so nothing tries to use it), with two lead forms and one test lead in the log.
const PAGE = "104857600000777";
const FORMS = ["777000000000771", "777000000000772"];

// One worker: both tests share the made-up Page.
test.describe.configure({ mode: "serial" });

const sign = (body: string, secret = APP_SECRET) => `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

async function clean() {
  await withDb(async (db) => {
    await db.query("delete from intake_log where external_id like '99000000000077%'");
    await db.query("delete from meta_form_links where page_id = $1", [PAGE]);
    await db.query("delete from meta_connections where page_id = $1", [PAGE]);
  });
}
test.beforeAll(async ({}, testInfo) => {
  test.skip(testInfo.project.name.startsWith("phone"), "run once: the made-up Page is shared");
  await clean();
  await withDb(async (db) => {
    await db.query(
      "insert into meta_connections (page_id, page_name, status, status_detail) values ($1, 'SEON TOPIK (e2e)', 'needs_reconnect', 'Error validating access token: The session has been invalidated.')",
      [PAGE],
    );
    await db.query("insert into meta_form_links (meta_form_id, meta_form_name, page_id) values ($1, 'TOPIK autumn ads', $3), ($2, 'Free trial ads', $3)", [...FORMS, PAGE]);
    await db.query("insert into intake_log (channel, outcome, detail, external_id) values ('meta', 'test', 'Meta test lead', '990000000000771')");
  });
});
test.afterAll(async ({}, testInfo) => {
  if (!testInfo.project.name.startsWith("phone")) await clean();
});

test("the webhook: verification handshake, signature check, 200 at once", async ({ request }) => {
  // ── GET: Meta checks the address with our verify token ──
  const handshake = (params: Record<string, string>, headers: Record<string, string> = HOST) => request.get("/api/meta/webhook", { headers, params });
  const ok = await handshake({ "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1158201444" });
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toBe("1158201444");
  expect(ok.headers()["content-type"]).toContain("text/plain");
  for (const params of [
    { "hub.mode": "subscribe", "hub.verify_token": "not-our-token", "hub.challenge": "1" },
    { "hub.mode": "unsubscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1" },
    { "hub.mode": "subscribe", "hub.challenge": "1" },
    {},
  ]) {
    const refused = await handshake(params as Record<string, string>);
    expect(refused.status(), JSON.stringify(params)).toBe(403);
    expect(await refused.text()).not.toContain("1158201444");
  }
  // The webhook lives on the forms host only.
  expect((await request.get("/api/meta/webhook", { params: { "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1" } })).status()).toBe(404);

  // ── POST: refused unless the signature matches the app secret ──
  // The body goes out as the exact bytes that were signed.
  const deliver = (body: string, signature: string | null, headers: Record<string, string> = HOST) =>
    request.post("/api/meta/webhook", { headers: { ...headers, "content-type": "application/json", ...(signature ? { "x-hub-signature-256": signature } : {}) }, data: Buffer.from(body, "utf8") });
  for (const signature of [null, "sha256=0000", sign(WEBHOOK_BODY, "another-secret"), sign(`${WEBHOOK_BODY} `)]) {
    expect((await deliver(WEBHOOK_BODY, signature)).status(), String(signature)).toBe(401);
  }
  expect((await deliver(WEBHOOK_BODY, sign(WEBHOOK_BODY), {})).status()).toBe(404);

  // ── Signed: 200 at once. This Page is not connected here, so nothing is fetched and no lead is made. ──
  const leadsBefore = await withDb(async (db) => (await db.query("select count(*)::int as n from leads")).rows[0].n as number);
  const started = Date.now();
  const accepted = await deliver(WEBHOOK_BODY, sign(WEBHOOK_BODY));
  expect(accepted.status()).toBe(200);
  expect(await accepted.json()).toEqual({ received: 1 });
  expect(Date.now() - started).toBeLessThan(5_000);
  // The made-up Page that needs reconnecting: taken note of, not fetched.
  const forOurPage = WEBHOOK_BODY.replaceAll("104857600000001", PAGE).replace("990000000000001", "990000000000772");
  expect(await (await deliver(forOurPage, sign(forOurPage))).json()).toEqual({ received: 1 });
  // Signed, but not about a lead: nothing to do.
  const other = '{"object":"page","entry":[{"id":"1","changes":[{"field":"feed","value":{}}]}]}';
  expect(await (await deliver(other, sign(other))).json()).toEqual({ received: 0 });
  expect(await (await deliver("not json", sign("not json"))).json()).toEqual({ received: 0 });
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  expect(await withDb(async (db) => (await db.query("select count(*)::int as n from leads")).rows[0].n as number)).toBe(leadsBefore);
  expect(await withDb(async (db) => (await db.query("select status from meta_connections where page_id = $1", [PAGE])).rows[0].status)).toBe("needs_reconnect");

  // ── The hourly catch-up's door ──
  expect((await request.post("/api/jobs/meta-backfill")).status()).toBe(401);
  expect((await request.post("/api/jobs/meta-backfill", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  const job = await request.post("/api/jobs/meta-backfill", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(job.status()).toBe(200);
  // No connected Page: nothing was read and nothing was taken.
  expect(await job.json()).toEqual({ created: 0, merged: 0, known: 0, test: 0, invalid: 0, rate_limited: 0, error: 0, skipped: 0 });
});

test("Settings → Integrations: Connect with Facebook, status and Reconnect, the Page's forms with a funnel each", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/en/settings?tab=integrations");
  await expect(page.getByRole("heading", { name: "Facebook and Instagram lead ads" })).toBeVisible();
  // Where Meta's dashboard must point, and where Facebook returns the owner.
  await expect(page.locator("[data-meta-webhook]")).toHaveText(`http://${FORMS_HOST}/api/meta/webhook`);
  await expect(page.getByText("/auth/meta/callback")).toBeVisible();
  await expect(page.getByText("Set on the server (META_VERIFY_TOKEN).")).toBeVisible();
  await expect(page.locator("[data-meta-connect]")).toHaveAttribute("href", "/auth/meta/start?locale=en");

  // ── The Page: Needs reconnect, with what Meta said, and Reconnect ──
  const card = page.locator(`[data-meta-page="${PAGE}"]`);
  await expect(card.getByRole("heading", { name: "SEON TOPIK (e2e)" })).toBeVisible();
  await expect(card).toHaveAttribute("data-meta-status", "needs_reconnect");
  await expect(card.getByText("Needs reconnect", { exact: true })).toBeVisible();
  await expect(card).toContainText("Error validating access token");
  await expect(card.locator("[data-meta-reconnect]")).toHaveAttribute("href", "/auth/meta/start?locale=en");
  await expect(card.getByRole("button", { name: "Refresh forms" })).toBeDisabled();

  // ── Its lead forms, each with a funnel picker ──
  await expect(card.locator("[data-meta-form]")).toHaveCount(2);
  const picker = card.getByRole("combobox", { name: "Funnel for TOPIK autumn ads" });
  await expect(picker).toHaveText("No funnel");
  await picker.click();
  await page.getByRole("option", { name: "Free trial lesson" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(picker).toHaveText("Free trial lesson");
  expect(
    await withDb(async (db) => (await db.query("select f.slug from meta_form_links m left join lead_forms f on f.id = m.form_id where m.meta_form_id = any($1) order by m.meta_form_id", [FORMS])).rows),
  ).toEqual([{ slug: "free-trial" }, { slug: null }]);

  // ── What Meta sent lately ──
  await expect(page.locator('[data-meta-log] [data-outcome="test"]').first()).toContainText("Test lead");
  await page.screenshot({ path: `${SHOTS}/integrations.png`, fullPage: true });

  // ── Connect with Facebook: off to Facebook's dialog with our app, the return address and a state kept in a cookie ──
  const start = await page.request.get("/auth/meta/start?locale=en", { maxRedirects: 0 });
  expect(start.status()).toBe(307);
  const dialog = new URL(start.headers().location);
  expect(`${dialog.origin}${dialog.pathname}`).toMatch(/^https:\/\/www\.facebook\.com\/v\d+\.\d+\/dialog\/oauth$/);
  expect(dialog.searchParams.get("client_id")).toBe(APP_ID);
  expect(dialog.searchParams.get("redirect_uri")).toMatch(/\/auth\/meta\/callback$/);
  expect(dialog.searchParams.get("scope")).toBe("pages_show_list,pages_read_engagement,pages_manage_metadata,pages_manage_ads,leads_retrieval");
  const state = dialog.searchParams.get("state") ?? "";
  expect(state).toMatch(/^[0-9a-f]{48}\.en$/);
  expect(start.headers()["set-cookie"]).toMatch(/meta_oauth_state=[^;]+; .*HttpOnly/i);

  // ── Coming back: a state that is not ours is refused; Cancel in Facebook changes nothing ──
  const forged = await page.request.get("/auth/meta/callback?code=abc&state=forged.en", { maxRedirects: 0 });
  expect(forged.headers().location).toMatch(/\/en\/settings\?tab=integrations&meta=state$/);
  // (A refused return throws the state away, so this one starts again.)
  const again = await page.request.get("/auth/meta/start?locale=en", { maxRedirects: 0 });
  const freshState = new URL(again.headers().location).searchParams.get("state") ?? "";
  expect(freshState).not.toBe(state);
  const cancelled = await page.request.get(`/auth/meta/callback?error=access_denied&state=${freshState}`, { maxRedirects: 0 });
  expect(cancelled.headers().location).toMatch(/\/en\/settings\?tab=integrations&meta=cancelled$/);
  await page.goto("/en/settings?tab=integrations&meta=cancelled");
  await expect(page.locator('[data-meta-problem="cancelled"]')).toHaveText("Connecting was cancelled in Facebook. Nothing was changed.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // ── Integrations are the owner's ──
  await page.goto("/auth/sign-out?locale=en");
  await signIn(page, "manager");
  await page.goto("/en/settings?tab=integrations");
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
  await expect(page.locator("[data-meta-page], [data-meta-connect]")).toHaveCount(0);
  const refused = await page.request.get("/auth/meta/start?locale=en", { maxRedirects: 0 });
  expect(refused.headers().location).not.toContain("facebook.com");
});
