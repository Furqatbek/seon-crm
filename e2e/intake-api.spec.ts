import { expect, test } from "@playwright/test";

import { signIn } from "./support/auth";
import { withDb } from "./support/db";

// Website intake — docs/SPEC.md → "Lead forms add-on → Public intake URL and
// Meta lead ads" (website part); docs/INTAKE.md. The owner makes a key in
// Settings → Lead sources; a website posts a JSON lead and a form-encoded lead
// to the forms host with it. Field mapping, key checks and every response are
// unit-tested in src/lib/intake/api.test.ts.

const FORMS_HOST = process.env.FORMS_HOST ?? "forms.localhost:3000";
// Direct HTTP calls reach the same server under the forms host's name.
const HOST = { host: FORMS_HOST };
const SHOTS = "/tmp/claude-0/-home-user-seon-crm/8e2658c1-db42-5c63-9a77-a99d1f3e7aa2/scratchpad/shots/intake";
const PHONE_PREFIX = "+99890557";

const phoneFor = (project: string, n: number) => `${PHONE_PREFIX}${project.startsWith("phone") ? 1 : 2}${String(n).padStart(3, "0")}`;

// One worker for this file: the clean-up below must not run while the other test is in the middle of its work.
test.describe.configure({ mode: "serial" });

async function clean(project: string) {
  const mine = `${PHONE_PREFIX}${project.startsWith("phone") ? 1 : 2}%`;
  const name = `E2E site ${project}%`;
  await withDb(async (db) => {
    await db.query("delete from messages where lead_id in (select id from leads where phone like $1)", [mine]);
    await db.query("delete from intake_log where source_id in (select id from intake_sources where name like $1)", [name]);
    await db.query("delete from intake_log where lead_id in (select id from leads where phone like $1)", [mine]);
    await db.query("delete from leads where phone like $1", [mine]);
    await db.query("delete from intake_sources where name like $1", [name]);
  });
}
test.beforeAll(async ({}, testInfo) => clean(testInfo.project.name));
test.afterAll(async ({}, testInfo) => clean(testInfo.project.name));

test("the owner makes a key; a website posts a JSON lead and a form-encoded lead with it; the requests are listed", async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const project = testInfo.project.name;
  const sourceName = `E2E site ${project} ${Date.now()}`;
  const [jsonPhone, formPhone] = [phoneFor(project, 1), phoneFor(project, 2)];

  // ── Settings → Lead sources: a new source with a funnel and one field of its own ──
  await signIn(page, "owner");
  await page.goto("/en/settings?tab=sources");
  await expect(page.locator("[data-endpoint]")).toHaveText(`POST http://${FORMS_HOST}/api/v1/leads`);
  await page.getByRole("button", { name: "Add source" }).click();
  const sheet = page.locator('[data-slot="sheet-content"][data-side="right"]');
  // A name is required.
  await sheet.getByRole("button", { name: "Create key" }).click();
  await expect(sheet.getByRole("alert")).toBeVisible();
  await sheet.getByLabel("Name", { exact: true }).fill(sourceName);
  await sheet.getByRole("combobox", { name: "Funnel" }).click();
  await page.getByRole("option", { name: "Consultation call" }).click();
  await sheet.getByRole("button", { name: "Add field" }).click();
  await sheet.getByLabel("Field name on the website, row 1").fill("field-17");
  // "Name" is the first target, already chosen.
  await expect(sheet.getByRole("combobox", { name: "Goes to, row 1" })).toHaveText("Name");
  await sheet.getByRole("button", { name: "Create key" }).click();

  // ── The key is shown once ──
  const dialog = page.getByRole("dialog", { name: "Save this key now" });
  const key = await dialog.locator("[data-new-key]").inputValue();
  expect(key).toMatch(/^lk_[A-Za-z0-9]{8}_[A-Za-z0-9]{32}$/);
  await expect(dialog.getByRole("textbox", { name: "Example request" })).toHaveValue(new RegExp(`curl -X POST http://${FORMS_HOST.replace(".", "\\.")}/api/v1/leads`));
  await dialog.screenshot({ path: `${SHOTS}/key-${project}.png` });
  await dialog.getByRole("button", { name: "I have saved it" }).click();
  const card = page.locator(`[data-source="${sourceName}"]`);
  await expect(card).toContainText(`${key.slice(0, 11)}_…`);
  await expect(card).toContainText("Consultation call");
  await expect(card.locator("[data-last-used]")).toHaveText("Never");
  // Only a hash and the prefix are stored; the key itself is nowhere on the page or in the database.
  expect(await page.content()).not.toContain(key);
  const stored = await withDb(async (db) => (await db.query("select key_prefix, key_hash, field_map from intake_sources where name = $1", [sourceName])).rows[0]);
  expect(stored.key_prefix).toBe(key.slice(0, 11));
  expect(stored.key_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(stored)).not.toContain(key.slice(12));
  expect(stored.field_map).toEqual({ "field-17": "name" });

  const lead = (phone: string) =>
    withDb(async (db) =>
      (
        await db.query(
          `select l.id, l.full_name, l.source, l.status, l.subject_interest, l.notes, l.submitted_language, l.answers, l.assigned_to, l.inbox_since is not null as inbox, f.slug
           from leads l left join lead_forms f on f.id = l.form_id where l.phone = $1`,
          [phone],
        )
      ).rows,
    );

  // ── A JSON lead, with the key in the Authorization header ──
  const json = await request.post("/api/v1/leads", {
    headers: { ...HOST, authorization: `Bearer ${key}` },
    data: { ism: "Aziza Karimova", telefon: jsonPhone.replace("+998", "+998 "), kurs: "TOPIK II", message: "Evening group, please", lang: "ru", utm_source: "instagram" },
  });
  expect(json.status()).toBe(201);
  const created = (await json.json()) as { id: string; outcome: string };
  expect(created.outcome).toBe("created");
  expect(await lead(jsonPhone)).toEqual([
    {
      id: created.id,
      full_name: "Aziza Karimova",
      source: "website",
      status: "new",
      subject_interest: "TOPIK II",
      notes: "Evening group, please",
      submitted_language: "ru",
      answers: [{ id: "utmsource", type: "short_text", label: "utm_source", value: "instagram" }],
      assigned_to: null,
      inbox: true,
      // The source's funnel.
      slug: "consultation",
    },
  ]);
  // Not for browsers: no CORS headers on the answer or on a preflight.
  expect(json.headers()["access-control-allow-origin"]).toBeUndefined();
  const preflight = await request.fetch("/api/v1/leads", { method: "OPTIONS", headers: { ...HOST, origin: "https://example.com", "access-control-request-method": "POST" } });
  expect(preflight.headers()["access-control-allow-origin"]).toBeUndefined();

  // ── A form-encoded lead, with the key in ?key=, a field of the source's own map and a Russian field name ──
  const form = await request.post(`/api/v1/leads?key=${key}`, {
    headers: HOST,
    form: { "field-17": "Bobur Aliyev", телефон: formPhone.slice(4), Branch: "Chilanzar" },
  });
  expect(form.status()).toBe(201);
  expect(((await form.json()) as { outcome: string }).outcome).toBe("created");
  expect(await lead(formPhone)).toMatchObject([
    { full_name: "Bobur Aliyev", source: "website", answers: [{ id: "branch", type: "short_text", label: "Branch", value: "Chilanzar" }], inbox: true, slug: "consultation" },
  ]);

  // ── The other answers ──
  const post = (data: object, headers: Record<string, string> = { authorization: `Bearer ${key}` }) => request.post("/api/v1/leads", { headers: { ...HOST, ...headers }, data });
  // The same phone again: no second lead.
  const again = await post({ name: "Aziza K.", phone: jsonPhone });
  expect(again.status()).toBe(201);
  expect(await again.json()).toEqual({ id: created.id, outcome: "merged" });
  expect(await lead(jsonPhone)).toHaveLength(1);
  // Field errors.
  const bad = await post({ name: "No Phone Number", phone: "12345" });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toEqual({ error: "invalid", fields: { phone: "phone" } });
  const broken = await request.post("/api/v1/leads", { headers: { ...HOST, authorization: `Bearer ${key}`, "content-type": "application/json" }, data: "{broken" });
  expect(broken.status()).toBe(400);
  expect(await broken.json()).toEqual({ error: "invalid_body" });
  // A builder's connection test.
  const check = await request.post(`/api/v1/leads?key=${key}`, { headers: HOST, form: { test: "1" } });
  expect(check.status()).toBe(200);
  expect(await check.json()).toEqual({ ok: true, test: true });
  // No key, a wrong key.
  const wrongKeys: Record<string, string>[] = [{}, { authorization: `Bearer ${key.slice(0, -4)}AAAA` }, { authorization: "Bearer nonsense" }];
  for (const headers of wrongKeys) {
    const refused = await post({ name: "A", phone: phoneFor(project, 9) }, headers);
    expect(refused.status()).toBe(401);
    expect(await refused.json()).toEqual({ error: "unauthorized" });
  }
  expect(await lead(phoneFor(project, 9))).toEqual([]);
  // The intake address exists on the forms host only.
  expect((await request.post("/api/v1/leads", { headers: { authorization: `Bearer ${key}` }, data: { name: "A", phone: phoneFor(project, 9) } })).status()).toBe(404);

  // ── Settings: last used, and the requests with what became of each ──
  await page.reload();
  await expect(card.locator("[data-last-used]")).not.toHaveText("Never");
  await card.getByRole("button", { name: "Requests" }).click();
  const log = page.getByRole("dialog", { name: `Requests: ${sourceName}` });
  await expect(log.locator("[data-source-log] li")).toHaveCount(6);
  // Newest first: the test, the broken body, the bad phone, the repeat, the form post, the JSON lead.
  await expect(log.locator("[data-source-log] li")).toHaveText([/Connection test/, /Refused.*body/, /Refused.*phone:phone/, /Sent again.*Aziza Karimova/, /Lead created.*Bobur Aliyev/, /Lead created.*Aziza Karimova/]);
  await log.screenshot({ path: `${SHOTS}/requests-${project}.png` });
  await page.keyboard.press("Escape");

  // ── The leads are in the shared inbox ──
  await page.goto("/en/leads");
  // (The other screen size's run puts its own Bobur in the same inbox: this one is found by its phone.)
  const inboxCard = page.locator("[data-inbox-lead]").filter({ hasText: formPhone.replace(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/, "+998 $1 $2 $3 $4") });
  await expect(inboxCard).toContainText("Bobur Aliyev");
  await expect(inboxCard).toContainText("Consultation call");
  await expect(inboxCard).toContainText("Branch: Chilanzar");

  // ── Switched off: the key is refused at once; on again: it works ──
  await page.goto("/en/settings?tab=sources");
  await card.getByRole("switch").click();
  await expect(card.getByText("Off", { exact: true })).toBeVisible();
  await expect.poll(async () => (await post({ name: "A", phone: phoneFor(project, 9) })).status()).toBe(401);
  await card.getByRole("switch").click();
  await expect(card.getByText("On", { exact: true })).toBeVisible();
  await expect.poll(async () => (await request.post(`/api/v1/leads?key=${key}`, { headers: HOST, form: { test: "1" } })).status()).toBe(200);

  // ── Edit: rename, and change the field map ──
  await card.getByRole("button", { name: "Edit" }).click();
  await expect(sheet.getByLabel("Field name on the website, row 1")).toHaveValue("field-17");
  await sheet.getByRole("button", { name: "Add field" }).click();
  await sheet.getByLabel("Field name on the website, row 2").fill("field-18");
  await sheet.getByRole("combobox", { name: "Goes to, row 2" }).click();
  await page.getByRole("option", { name: "Phone" }).click();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(card).toContainText("2 fields of its own");
  const mapped = await post({ "field-17": "Mapped Lead", "field-18": phoneFor(project, 3).slice(4) });
  expect(mapped.status()).toBe(201);
  expect(await lead(phoneFor(project, 3))).toMatchObject([{ full_name: "Mapped Lead" }]);
  await page.screenshot({ path: `${SHOTS}/sources-${project}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("lead sources are the owner's: a manager has no such tab", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/en/settings?tab=sources");
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add source" })).toHaveCount(0);
  await expect(page.locator("[data-source]")).toHaveCount(0);
});
