import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/auth";
import { seedStudentId, withDb } from "./support/db";

// No Telegram or Eskiz credentials exist in tests (playwright.config.ts), so
// nothing real is ever sent: every send is logged as failed, with the reason.

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');
const dialog = (page: Page) => page.locator('[data-slot="dialog-content"]');
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-cron-secret";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "e2e-webhook-secret";

const student = (n: number) =>
  withDb(async (db) => {
    const { rows } = await db.query(
      "select id, full_name, student_link_code, parent_link_code from students where id = $1",
      [seedStudentId(n)],
    );
    return rows[0] as { id: string; full_name: string; student_link_code: string; parent_link_code: string };
  });
/** Removes every Telegram link of a student. */
const unlink = (id: string) => withDb((db) => db.query("delete from telegram_links where student_id = $1", [id]));

test("the reminders job needs the cron secret", async ({ request }) => {
  expect((await request.post("/api/jobs/reminders")).status()).toBe(401);
  expect((await request.post("/api/jobs/reminders", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  expect((await request.post("/api/jobs/reminders", { headers: { authorization: CRON_SECRET } })).status()).toBe(401);
  expect((await request.get("/api/jobs/reminders")).status()).toBe(405);

  const response = await request.post("/api/jobs/reminders", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(response.status()).toBe(200);
  // Reminders are switched off for the test run (e2e/support/global-setup.ts),
  // so the job answers and sends nothing.
  expect(await response.json()).toEqual({
    sent: 0,
    failed: 0,
    skipped: 0,
    duplicate: 0,
    idle: "reminders_off",
    // The points messages ride on the same run and stop with the same switch.
    points: { sent: 0, failed: 0, duplicate: 0, idle: "reminders_off" },
    // Alerts to staff about leads in the shared inbox do not depend on that switch.
    staff: { alerts: expect.any(Number), reminders: expect.any(Number), failed: expect.any(Number) },
  });
});

test("the Telegram webhook checks its secret, links the student's and the parent's chat, and /stop unlinks", async ({ request }, testInfo) => {
  // Each screen size has its own student and chats.
  const phone = testInfo.project.name.startsWith("phone");
  const chats = phone ? { student: 990000002, parent: 990000012 } : { student: 990000001, parent: 990000011 };
  const { id, student_link_code: own, parent_link_code: parent } = await student(phone ? 62 : 61);
  await unlink(id);
  const post = (text: string, chatId: number, secret?: string) =>
    request.post("/api/telegram/webhook", {
      data: { update_id: 1, message: { text, chat: { id: chatId, type: "private" }, from: { language_code: "uz" } } },
      headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {},
    });
  const linked = () =>
    withDb(async (db) => {
      const { rows } = await db.query("select role, chat_id::text as chat from telegram_links where student_id = $1 order by role", [id]);
      return rows as Array<{ role: string; chat: string }>;
    });

  // Without the secret token nothing happens.
  expect((await post(`/start s_${own}`, chats.student)).status()).toBe(403);
  expect((await post(`/start s_${own}`, chats.student, "wrong")).status()).toBe(403);
  expect(await linked()).toEqual([]);

  // A wrong code, and a student's code used as a parent's, link nothing.
  expect((await post("/start s_Wrong000000000000000000", chats.student, WEBHOOK_SECRET)).status()).toBe(200);
  expect((await post(`/start p_${own}`, chats.student, WEBHOOK_SECRET)).status()).toBe(200);
  expect(await linked()).toEqual([]);

  // s_<code> is the student's own chat; a bare code, as on links from before, is the parent's.
  expect((await post(`/start s_${own}`, chats.student, WEBHOOK_SECRET)).status()).toBe(200);
  expect((await post(`/start ${parent}`, chats.parent, WEBHOOK_SECRET)).status()).toBe(200);
  expect(await linked()).toEqual([
    { role: "student", chat: String(chats.student) },
    { role: "parent", chat: String(chats.parent) },
  ]);
  // Commands and buttons are answered (no bot is configured here, so nothing is sent).
  expect((await post("/points", chats.student, WEBHOOK_SECRET)).status()).toBe(200);
  const button = await request.post("/api/telegram/webhook", {
    data: { update_id: 2, callback_query: { id: "1", data: "lang:ru", message: { chat: { id: chats.parent, type: "private" } } } },
    headers: { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
  });
  expect(button.status()).toBe(200);
  const language = await withDb((db) => db.query("select role, language from telegram_links where student_id = $1 order by role", [id]));
  expect(language.rows.find((row) => row.role === "parent")).toMatchObject({ language: "ru" });

  // /stop removes only that chat's link.
  expect((await post("/stop", chats.parent, WEBHOOK_SECRET)).status()).toBe(200);
  expect(await linked()).toEqual([{ role: "student", chat: String(chats.student) }]);
  expect((await post("/stop", chats.student, WEBHOOK_SECRET)).status()).toBe(200);
  expect(await linked()).toEqual([]);
});

test("Send message from the student page is logged on the Messages tab", async ({ page }, testInfo) => {
  const target = await student(testInfo.project.name.startsWith("phone") ? 64 : 63);
  const text = `E2E message ${testInfo.project.name} ${Date.now()}`;
  await unlink(target.id);

  await signIn(page, "manager");
  await page.goto(`/en/students/${target.id}`);
  await page.getByRole("button", { name: "Send message" }).click();

  // Telegram is not linked: SMS is the only channel, and it says where it goes.
  await expect(sheet(page).getByRole("radio", { name: "Telegram" })).toBeDisabled();
  await expect(sheet(page).getByRole("radio", { name: "SMS" })).toBeChecked();
  await expect(sheet(page).getByText("Telegram is not linked for this student.")).toBeVisible();
  await expect(sheet(page).getByText(/Sent to \+998 \d\d \d{3} \d\d \d\d/)).toBeVisible();
  // The one-off template in the student's language is the starting text.
  await expect(sheet(page).getByLabel("Text")).toHaveValue(new RegExp(target.full_name.split(" ")[0]));
  await page.screenshot({ path: testInfo.outputPath("send-message.png") });

  await sheet(page).getByLabel("Text").fill("");
  await expect(sheet(page).getByRole("button", { name: "Send" })).toBeDisabled();
  await sheet(page).getByLabel("Text").fill(text);
  await sheet(page).getByRole("button", { name: "Send" }).click();
  // No SMS provider in tests: the sheet says it failed and where to look.
  await expect(sheet(page).getByRole("alert")).toContainText("could not be delivered");
  await sheet(page).getByRole("button", { name: "Close" }).first().click();

  await page.getByRole("tab", { name: "Messages" }).click();
  const row = page.getByRole("row").filter({ hasText: text });
  await expect(row).toContainText("One-off message");
  await expect(row).toContainText("SMS");
  await expect(row).toContainText("Failed");
  await expect(row).toContainText("SMS is not configured");
  await page.screenshot({ path: testInfo.outputPath("messages-tab.png") });
});

test("Remind on Debtors goes at most once per student per day", async ({ page }, testInfo) => {
  // The desktop run reminds one debtor, the phone run another.
  const index = testInfo.project.name.startsWith("phone") ? 1 : 0;
  await signIn(page, "manager");
  await page.goto("/en/finance?tab=debtors");
  const id = await page.locator("[data-debtor-row]").nth(index).getAttribute("data-debtor-row");
  // By id from here on: other tests add and remove debtors while this one runs.
  const row = page.locator(`[data-debtor-row="${id}"]`);
  await withDb((db) => db.query("delete from messages where student_id = $1 and dedupe_key like 'remind:%'", [id]));

  await expect(page.getByRole("button", { name: "Remind all" })).toBeEnabled();
  await row.getByRole("button", { name: "Remind", exact: true }).click();
  await expect(page.getByText("The reminder could not be delivered.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("debtors-remind.png") });

  await row.getByRole("button", { name: "Remind", exact: true }).click();
  await expect(page.getByText("Already reminded today")).toBeVisible();

  // One row was written, as a payment-overdue message, by SMS since Telegram is not linked.
  const logged = await withDb(async (db) => {
    const { rows } = await db.query(
      "select type, channel, status, body from messages where student_id = $1 and dedupe_key like 'remind:%'",
      [id],
    );
    return rows as Array<{ type: string; channel: string; status: string; body: string }>;
  });
  expect(logged).toHaveLength(1);
  expect(logged[0]).toMatchObject({ type: "payment_overdue", status: "failed" });
  // An SMS stays in plain Latin: no ʻ.
  if (logged[0].channel === "sms") expect(logged[0].body).not.toMatch(/[ʻ’]/);

  // Remind all is confirmed first, and says how many it reaches.
  await page.getByRole("button", { name: "Remind all" }).click();
  await expect(dialog(page)).toContainText("Remind every debtor?");
  await expect(dialog(page)).toContainText(/\d+ students in debt each get a reminder/);
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(page)).toBeHidden();
});
