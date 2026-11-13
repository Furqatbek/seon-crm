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
      "select id, full_name, telegram_link_code, telegram_chat_id from students where id = $1",
      [seedStudentId(n)],
    );
    return rows[0] as { id: string; full_name: string; telegram_link_code: string; telegram_chat_id: string | null };
  });

test("the reminders job needs the cron secret", async ({ request }) => {
  expect((await request.post("/api/jobs/reminders")).status()).toBe(401);
  expect((await request.post("/api/jobs/reminders", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  expect((await request.post("/api/jobs/reminders", { headers: { authorization: CRON_SECRET } })).status()).toBe(401);
  expect((await request.get("/api/jobs/reminders")).status()).toBe(405);

  const response = await request.post("/api/jobs/reminders", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(response.status()).toBe(200);
  // Reminders are switched off for the test run (e2e/support/notify-setup.ts),
  // so the job answers and sends nothing.
  expect(await response.json()).toEqual({ sent: 0, failed: 0, skipped: 0, duplicate: 0, idle: "reminders_off" });
});

test("the Telegram webhook checks its secret, links on /start <code> and unlinks on /stop", async ({ request }, testInfo) => {
  // Each screen size has its own student and chat.
  const phone = testInfo.project.name.startsWith("phone");
  const chatId = phone ? 990000002 : 990000001;
  const { id, telegram_link_code: code } = await student(phone ? 62 : 61);
  await withDb((db) => db.query("update students set telegram_chat_id = null where id = $1", [id]));
  const update = (text: string) => ({ update_id: 1, message: { text, chat: { id: chatId, type: "private" }, from: { language_code: "uz" } } });
  const post = (text: string, secret?: string) =>
    request.post("/api/telegram/webhook", {
      data: update(text),
      headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {},
    });
  const linked = async () => (await student(phone ? 62 : 61)).telegram_chat_id;

  // Without the secret token nothing happens.
  expect((await post(`/start ${code}`)).status()).toBe(403);
  expect((await post(`/start ${code}`, "wrong")).status()).toBe(403);
  expect(await linked()).toBeNull();

  expect((await post("/start Wrong000000000000000000", WEBHOOK_SECRET)).status()).toBe(200);
  expect(await linked()).toBeNull();

  expect((await post(`/start ${code}`, WEBHOOK_SECRET)).status()).toBe(200);
  expect(String(await linked())).toBe(String(chatId));

  expect((await post("/stop", WEBHOOK_SECRET)).status()).toBe(200);
  expect(await linked()).toBeNull();
});

test("Send message from the student page is logged on the Messages tab", async ({ page }, testInfo) => {
  const target = await student(testInfo.project.name.startsWith("phone") ? 64 : 63);
  const text = `E2E message ${testInfo.project.name} ${Date.now()}`;
  await withDb((db) => db.query("update students set telegram_chat_id = null where id = $1", [target.id]));

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
