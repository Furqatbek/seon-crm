import { expect, test, type Browser, type Page } from "@playwright/test";

import { packId } from "../src/lib/notify/bot";
import { LOGINS, signIn } from "./support/auth";
import { withDb } from "./support/db";

// The shared inbox — docs/SPEC.md → "Lead forms add-on → Shared inbox and staff
// alerts". Two people have /leads open; a form is sent; both see it arrive
// without refreshing, and Take in one removes it from the other. The Take
// rules themselves (one winner) are in supabase/tests/shared-inbox.test.ts,
// alert timing in src/lib/notify/staff-alerts.test.ts.

const FORMS = `http://${process.env.FORMS_HOST ?? "forms.localhost:3000"}`;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "e2e-webhook-secret";
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-cron-secret";
const SHOTS = "/tmp/claude-0/-home-user-seon-crm/8e2658c1-db42-5c63-9a77-a99d1f3e7aa2/scratchpad/shots/inbox";
// Every lead these tests make has a phone starting with this.
const PHONE_PREFIX = "+99890556";

// The tests share the inbox, the sidebar count and two people's Telegram
// links: they run one after another, on one screen size at a time.
test.describe.configure({ mode: "serial" });

const phoneFor = (project: string, n: number) => `${PHONE_PREFIX}${project.startsWith("phone") ? 1 : 2}${String(n).padStart(3, "0")}`;
const inboxCard = (page: Page, name: string) => page.locator("[data-inbox-lead]").filter({ hasText: name });
const profileId = (who: keyof typeof LOGINS) =>
  withDb(async (db) => (await db.query("select id from auth.users where email = $1", [LOGINS[who]])).rows[0].id as string);

// Each screen size cleans up only what it made: the two runs share the database.
async function clean(project: string) {
  const mine = `${PHONE_PREFIX}${project.startsWith("phone") ? 1 : 2}%`;
  await withDb(async (db) => {
    await db.query("delete from messages where lead_id in (select id from leads where phone like $1)", [mine]);
    await db.query("delete from intake_log where lead_id in (select id from leads where phone like $1)", [mine]);
    await db.query("delete from leads where phone like $1", [mine]);
    if (!project.startsWith("phone")) await db.query("update profiles set telegram_chat_id = null where telegram_chat_id between 880000 and 889999");
  });
}
test.beforeAll(async ({}, testInfo) => clean(testInfo.project.name));
test.afterAll(async ({}, testInfo) => clean(testInfo.project.name));

/** A visitor fills in the consultation form in Russian and sends it. */
async function submitForm(browser: Browser, name: string, phone: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  const page = await context.newPage();
  await page.goto(`${FORMS}/consultation?lang=ru`);
  await page.getByLabel("Имя и фамилия").fill(name);
  await page.getByLabel("Номер телефона").fill(phone);
  await page.getByLabel("Курсы и цены").check();
  await page.getByLabel("Когда вам позвонить?").selectOption({ label: "Вечером" });
  await page.getByLabel(/Я согласен/).check();
  // People take longer than three seconds to fill a form in; so does this.
  await page.waitForTimeout(3_200);
  await page.getByRole("button", { name: "Заказать звонок" }).click();
  await expect(page.getByRole("heading", { name: "Спасибо!" })).toBeVisible();
  const sentAt = Date.now();
  await context.close();
  return sentAt;
}

/** A lead straight into the inbox, without the form page. */
const arrive = (name: string, phone: string) =>
  withDb(async (db) => {
    const form = (await db.query("select id from lead_forms where slug = 'consultation'")).rows[0].id as string;
    const { rows } = await db.query(
      `select lead_id from public.intake_submit('form', $1, $2, $3, $4, null, null, null, '[{"id":"topics","type":"multiple_choice","label":"Что вас интересует?","value":"Курсы и цены"}]'::jsonb, 'ru')`,
      [form, `e2e-${phone}`, name, phone],
    );
    return rows[0].lead_id as string;
  });

test("a form submit appears in the second manager's inbox without refreshing, and Take in one removes it from the other", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const viewport = testInfo.project.use.viewport!;
  const name = `Входящий ${testInfo.project.name} ${Date.now()}`;
  const phone = phoneFor(testInfo.project.name, 1);

  // Two people, two browsers, both on Leads.
  const [ownerContext, managerContext] = await Promise.all([browser.newContext({ viewport }), browser.newContext({ viewport })]);
  const [owner, manager] = await Promise.all([ownerContext.newPage(), managerContext.newPage()]);
  await Promise.all([signIn(owner, "owner"), signIn(manager, "manager")]);
  await Promise.all([owner.goto("/en/leads"), manager.goto("/en/leads")]);
  await Promise.all([expect(owner.getByRole("heading", { level: 1, name: "Leads" })).toBeVisible(), expect(manager.getByRole("heading", { level: 1, name: "Leads" })).toBeVisible()]);
  await expect(inboxCard(manager, name)).toHaveCount(0);
  // Give both pages a moment to be listening.
  await manager.waitForTimeout(1_500);

  // ── A visitor sends the form ──
  const sentAt = await submitForm(browser, name, phone);

  // ── Both see it within 3 seconds, without refreshing ──
  const card = inboxCard(manager, name);
  await expect(card).toBeVisible({ timeout: 3_000 });
  expect(Date.now() - sentAt, "time from the visitor's thank-you screen to the manager's inbox").toBeLessThan(3_000);
  await expect(inboxCard(owner, name)).toBeVisible({ timeout: 3_000 });
  // The card: name, phone, form, a line of answers, how long it has waited, Take.
  await expect(card).toContainText(phone.replace(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/, "+998 $1 $2 $3 $4"));
  await expect(card).toContainText("Consultation call");
  await expect(card).toContainText("Что вас интересует?: Курсы и цены");
  await expect(card.locator("[data-waited]")).toHaveText(/just now|1 min/);
  await expect(card.getByRole("button", { name: "Take" })).toBeVisible();
  // A manager cannot assign; the owner can.
  await expect(card.getByRole("button", { name: "Assign" })).toHaveCount(0);
  await expect(inboxCard(owner, name).getByRole("button", { name: "Assign" })).toBeVisible();
  // A toast names the form and the lead; the strip, the sidebar and the tab title count it.
  await expect(manager.getByText(`New lead from “Consultation call”: ${name}`)).toBeVisible();
  // (The other screen size's run shares this inbox, so the exact number is not this test's to fix.)
  await expect(manager.locator("[data-inbox] h2")).toHaveText(/^New from forms — [1-9]\d* waiting$/);
  await expect(manager).toHaveTitle(/^\([1-9]\d*\) Leads$/);
  if (viewport.width >= 900) await expect(manager.locator('[data-slot="sidebar"] [data-nav-count]').first()).toHaveText(/^Leads waiting: [1-9]\d*$/);
  await manager.screenshot({ path: `${SHOTS}/inbox-${testInfo.project.name}.png`, fullPage: true });

  // ── The owner takes it: it leaves the manager's inbox without a refresh ──
  await inboxCard(owner, name).getByRole("button", { name: "Take" }).click();
  await expect(owner.getByText(`You took ${name}`)).toBeVisible();
  await expect(inboxCard(owner, name)).toHaveCount(0);
  await expect(card).toHaveCount(0, { timeout: 5_000 });
  // The count in the strip and in the tab title follow what is left.
  const left = await manager.locator("[data-inbox-lead]").count();
  if (left === 0) await expect(manager).toHaveTitle("Leads");
  else await expect(manager).toHaveTitle(/^\([1-9]\d*\) Leads$/);
  const ownerId = await profileId("owner");
  expect(await withDb(async (db) => (await db.query("select assigned_to, taken_at is not null as dated, status from leads where phone = $1", [phone])).rows)).toEqual([
    { assigned_to: ownerId, dated: true, status: "new" },
  ]);

  // ── The lead sheet opens: the form, the visitor's language, when, and every answer as it read then ──
  const sheet = owner.locator('[data-slot="sheet-content"][data-side="right"]');
  await expect(sheet.getByRole("heading", { name })).toBeVisible();
  const form = sheet.locator("[data-lead-form]");
  await expect(form.getByRole("heading", { name: "Consultation call" })).toBeVisible();
  await expect(form).toContainText("Language: Русский");
  await expect(form).toContainText(/Sent .+\d{2}:\d{2}/);
  await expect(form.locator('[data-answer="topics"]')).toHaveText("Что вас интересует?Курсы и цены");
  await expect(form.locator('[data-answer="consent"]')).toHaveText("Я согласен(на) на использование моих данных для связи со мной.Yes");
  await owner.screenshot({ path: `${SHOTS}/lead-sheet-${testInfo.project.name}.png` });

  await Promise.all([ownerContext.close(), managerContext.close()]);
});

test("the owner assigns a waiting lead to a manager; a teacher has no inbox", async ({ page, browser }, testInfo) => {
  const name = `Назначить ${testInfo.project.name} ${Date.now()}`;
  const phone = phoneFor(testInfo.project.name, 2);
  await arrive(name, phone);
  await signIn(page, "owner");
  await page.goto("/en/leads");
  await inboxCard(page, name).getByRole("button", { name: "Assign" }).click();
  const managerName = await withDb(async (db) => (await db.query("select full_name from profiles p join auth.users u on u.id = p.id where u.email = $1", [LOGINS.manager])).rows[0].full_name as string);
  await page.getByRole("menuitem", { name: managerName }).click();
  await expect(page.getByText(`${name} is assigned to ${managerName}`)).toBeVisible();
  await expect(inboxCard(page, name)).toHaveCount(0);
  expect(await withDb(async (db) => (await db.query("select assigned_to = $2 as theirs, taken_at is not null as dated from leads where phone = $1", [phone, await profileId("manager")])).rows)).toEqual([
    { theirs: true, dated: true },
  ]);

  // A teacher: no leads, no inbox, no count, and Realtime gives them nothing.
  await arrive(`Не для учителя ${Date.now()}`, phoneFor(testInfo.project.name, 3));
  const context = await browser.newContext({ viewport: testInfo.project.use.viewport! });
  const teacher = await context.newPage();
  await signIn(teacher, "teacher");
  await teacher.waitForTimeout(1_000);
  await expect(teacher.locator("[data-inbox], [data-inbox-lead]")).toHaveCount(0);
  await expect(teacher).not.toHaveTitle(/^\(\d+\)/);
  await context.close();
});

test("Profile: link Telegram, alerts and sound switches", async ({ page }) => {
  const before = await withDb(async (db) => {
    const { rows } = await db.query("select telegram_bot_username from centre_settings");
    await db.query("update centre_settings set telegram_bot_username = 'seon_e2e_bot'");
    return rows[0].telegram_bot_username as string | null;
  });
  try {
    await signIn(page, "manager");
    await page.goto("/en/settings");
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Lead alerts" }) });
    await expect(section).toContainText("Your Telegram is not linked yet.");
    const code = await withDb(async (db) => (await db.query("select staff_link_code from profiles p join auth.users u on u.id = p.id where u.email = $1", [LOGINS.manager])).rows[0].staff_link_code as string);
    await expect(section.locator("[data-telegram-link]")).toHaveAttribute("href", `https://t.me/seon_e2e_bot?start=u_${code}`);

    // The two switches are on by default and saved as soon as they are changed.
    const settings = () =>
      withDb(async (db) => (await db.query("select alerts_on, alert_sound from profiles p join auth.users u on u.id = p.id where u.email = $1", [LOGINS.manager])).rows[0]);
    await expect(section.getByRole("switch", { name: "Alerts on Telegram" })).toBeChecked();
    await section.getByRole("switch", { name: "Sound for new leads" }).click();
    await expect.poll(settings).toEqual({ alerts_on: true, alert_sound: false });
    await section.getByRole("switch", { name: "Alerts on Telegram" }).click();
    await expect.poll(settings).toEqual({ alerts_on: false, alert_sound: false });
    await page.reload();
    await expect(section.getByRole("switch", { name: "Alerts on Telegram" })).not.toBeChecked();
    await expect(section.getByRole("switch", { name: "Sound for new leads" })).not.toBeChecked();
    await section.getByRole("switch", { name: "Alerts on Telegram" }).click();
    await section.getByRole("switch", { name: "Sound for new leads" }).click();
    await expect.poll(settings).toEqual({ alerts_on: true, alert_sound: true });

    // Linked (as the bot does it): the page says so and offers Unlink.
    await withDb((db) => db.query("update profiles set telegram_chat_id = 880009 where id = (select id from auth.users where email = $1)", [LOGINS.manager]));
    await page.reload();
    await expect(section).toContainText("Your Telegram is linked.");
    await section.getByRole("button", { name: "Unlink" }).click();
    await expect(page.getByText("Telegram is unlinked")).toBeVisible();
    await expect(section).toContainText("Your Telegram is not linked yet.");
  } finally {
    await withDb((db) => db.query("update centre_settings set telegram_bot_username = $1", [before]));
  }
});

test("Telegram: staff link with u_<code>; an alert is logged for every new lead; Take in the bot is the same Take", async ({ request }, testInfo) => {
  // No screen is involved, and both runs would link the same two people: once is enough.
  test.skip(testInfo.project.name.startsWith("phone"), "an API test, run once");
  const [ownerId, managerId] = await Promise.all([profileId("owner"), profileId("manager")]);
  const codes = await withDb(async (db) => (await db.query("select id, staff_link_code from profiles where id = any($1)", [[ownerId, managerId]])).rows as Array<{ id: string; staff_link_code: string }>);
  const codeOf = (id: string) => codes.find((row) => row.id === id)!.staff_link_code;
  const chat = { owner: testInfo.project.name.startsWith("phone") ? 880101 : 880201, manager: testInfo.project.name.startsWith("phone") ? 880102 : 880202 };
  const post = (update: object) => request.post("/api/telegram/webhook", { headers: { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET }, data: update });
  const message = (text: string, chatId: number) => ({ message: { text, chat: { id: chatId, type: "private" }, from: { language_code: "en" } } });
  const press = (data: string, chatId: number) => ({ callback_query: { id: "e2e", data, from: { language_code: "en" }, message: { message_id: 1, chat: { id: chatId, type: "private" } } } });
  const chats = () => withDb(async (db) => (await db.query("select id, telegram_chat_id::int as chat from profiles where id = any($1) order by role", [[ownerId, managerId]])).rows);

  // ── Linking ──
  expect((await post(message("/start u_Wrong000000000000000000", chat.manager))).status()).toBe(200);
  expect((await chats()).every((row) => row.chat === null)).toBe(true);
  await post(message(`/start u_${codeOf(managerId)}`, chat.manager));
  await post(message(`/start u_${codeOf(ownerId)}`, chat.owner));
  expect(await chats()).toEqual(expect.arrayContaining([{ id: ownerId, chat: chat.owner }, { id: managerId, chat: chat.manager }]));
  // A student's or a parent's code never links staff, and the other way round.
  await post(message(`/start p_${codeOf(managerId)}`, 880999));
  expect(await withDb(async (db) => (await db.query("select 1 from telegram_links where chat_id = 880999")).rowCount)).toBe(0);

  // ── The job announces a waiting lead to both, once, and logs it ──
  const name = `Бот ${testInfo.project.name} ${Date.now()}`;
  const leadId = await arrive(name, phoneFor(testInfo.project.name, 4));
  const run = async () => (await (await request.post("/api/jobs/reminders", { headers: { authorization: `Bearer ${CRON_SECRET}` } })).json()) as { staff: { alerts: number; reminders: number; failed: number } };
  const first = await run();
  // No bot token in the test run: each send is tried, fails, and is logged as failed. Nothing real is sent.
  expect(first.staff.alerts + first.staff.failed).toBeGreaterThanOrEqual(2);
  const logged = () =>
    withDb(async (db) => (await db.query("select type, channel, staff_id, student_id, recipient, status, body from messages where lead_id = $1 order by recipient", [leadId])).rows);
  const rows = await logged();
  expect(rows.map((row) => [row.type, row.channel, row.staff_id, row.student_id, row.recipient])).toEqual(
    [
      ["staff_new_lead", "telegram", ownerId, null, String(chat.owner)],
      ["staff_new_lead", "telegram", managerId, null, String(chat.manager)],
    ].sort((a, b) => String(a[4]).localeCompare(String(b[4]))),
  );
  expect(rows[0].body).toContain(name);
  expect(rows[0].body).toContain("Consultation call");
  expect(rows[0].body).toContain("Что вас интересует?: Курсы и цены");
  // A second run sends nothing more for this lead: the dedupe keys hold.
  await run();
  expect(await logged()).toHaveLength(2);

  // Someone with alerts off is left out of the next lead.
  await withDb((db) => db.query("update profiles set alerts_on = false where id = $1", [ownerId]));
  const quietLead = await arrive(`Тихий ${Date.now()}`, phoneFor(testInfo.project.name, 5));
  await run();
  expect(await withDb(async (db) => (await db.query("select staff_id from messages where lead_id = $1", [quietLead])).rows)).toEqual([{ staff_id: managerId }]);
  await withDb((db) => db.query("update profiles set alerts_on = true where id = $1", [ownerId]));

  // ── Take in the bot: the manager first, then the owner, who is told it is gone ──
  const holder = () => withDb(async (db) => (await db.query("select assigned_to, taken_at is not null as dated from leads where id = $1", [leadId])).rows[0]);
  // A chat that is nobody's cannot take.
  await post(press(`tk:${packId(leadId)}`, 880998));
  expect(await holder()).toEqual({ assigned_to: null, dated: false });
  await post(press(`tk:${packId(leadId)}`, chat.manager));
  expect(await holder()).toEqual({ assigned_to: managerId, dated: true });
  await post(press(`tk:${packId(leadId)}`, chat.owner));
  expect(await holder()).toEqual({ assigned_to: managerId, dated: true });

  // ── /stop unlinks ──
  await post(message("/stop", chat.manager));
  expect((await chats()).find((row) => row.id === managerId)?.chat).toBe(null);
});

test("Reports: the lead funnel split by form", async ({ page }, testInfo) => {
  // Three leads through the form this month, two of them taken.
  const made = await Promise.all([6, 7, 8].map((n) => arrive(`Отчёт ${n} ${Date.now()}`, phoneFor(testInfo.project.name, n))));
  const ownerId = await profileId("owner");
  await withDb(async (db) => {
    for (const id of made.slice(0, 2)) await db.query("select public.take_lead($1, $2)", [id, ownerId]);
  });
  await signIn(page, "owner");
  await page.goto("/en/reports");
  const card = page.locator('[data-chart="forms"]');
  await expect(card.getByRole("heading", { name: "Leads by form" })).toBeVisible();
  const row = card.locator('[data-form-report-row="Consultation call"]');
  await expect(row).toBeVisible();
  const cells = await row.locator("td").allTextContents();
  // Views, leads, taken, won, conversion, median time to Take.
  expect(cells).toHaveLength(6);
  expect(Number(cells[1])).toBeGreaterThanOrEqual(3);
  expect(Number(cells[2])).toBeGreaterThanOrEqual(2);
  expect(cells[5]).toMatch(/^\d+ min$/);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/report-${testInfo.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
