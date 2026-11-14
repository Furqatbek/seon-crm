import { expect, test, type Locator, type Page } from "@playwright/test";

import { signIn } from "./support/auth";
import { withDb } from "./support/db";

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');
const dialog = (page: Page) => page.locator('[data-slot="dialog-content"]');
// The local Supabase stack catches every email it sends.
const MAILBOX = process.env.MAILBOX_URL ?? "http://127.0.0.1:54324";

async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name: option }).first().click();
}

/** The link in the invitation email Supabase sent to this address. */
async function invitationLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const list = await (await fetch(`${MAILBOX}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const message = await (await fetch(`${MAILBOX}/api/v1/message/${id}`)).json();
      const link = /https?:\/\/[^\s)"]+\/auth\/v1\/verify[^\s)"]+/.exec(message.Text as string);
      if (link) return link[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No invitation email arrived for ${email}`);
}

test("the owner invites a manager, who signs in and sees only manager screens; deactivating blocks their next request", async ({ page, browser }, testInfo) => {
  const tag = `${testInfo.project.name}-${Date.now()}`;
  const email = `e2e-${tag}@example.uz`;
  const name = `E2E Manager ${testInfo.project.name}`;
  const password = "Invited-manager-2026";

  // ── The owner invites by email ──
  await signIn(page, "owner");
  await page.goto("/en/settings?tab=users");
  await expect(page.locator('[data-user-row="owner@demo.educrm.uz"]')).toContainText("(you)");
  await page.getByRole("button", { name: "Invite user" }).click();
  await sheet(page).getByRole("button", { name: "Send invitation" }).click();
  await expect(sheet(page).getByText("Enter a valid email address.")).toBeVisible();
  await sheet(page).getByLabel("Email").fill(email);
  await sheet(page).getByLabel("Full name").fill(name);
  await expect(sheet(page).getByRole("combobox", { name: "Role" })).toContainText("Manager");
  await page.screenshot({ path: testInfo.outputPath("invite.png") });
  await sheet(page).getByRole("button", { name: "Send invitation" }).click();
  await expect(sheet(page)).toBeHidden();
  const row = page.locator(`[data-user-row="${email}"]`);
  await expect(row).toHaveAttribute("data-user-status", "invited");
  await expect(row).toContainText(name);

  // ── The manager opens the emailed link, in their own browser, and chooses a password ──
  const theirs = await browser.newContext({ viewport: testInfo.project.use.viewport ?? undefined });
  const manager = await theirs.newPage();
  await manager.goto(await invitationLink(email));
  await expect(manager).toHaveURL(/\/en\/reset-password$/);
  await manager.locator("#password").fill(password);
  await manager.locator("#confirm").fill(password);
  await manager.locator("button[type=submit]").click();
  // A manager lands on Groups.
  await expect(manager).toHaveURL(/\/en\/groups$/);

  // The link works once.
  const again = await browser.newContext();
  const stranger = await again.newPage();
  await stranger.goto(await invitationLink(email));
  await expect(stranger.locator('p[role="alert"]')).toContainText("invalid or has expired");
  await again.close();

  // ── They sign out and sign in with the password ──
  await manager.context().clearCookies();
  await manager.goto("/en/sign-in");
  await manager.locator("#email").fill(email);
  await manager.locator("#password").fill(password);
  await manager.locator("button[type=submit]").click();
  await expect(manager).toHaveURL(/\/en\/groups$/);

  // ── Only manager screens ──
  const phone = testInfo.project.name.startsWith("phone");
  if (phone) await manager.getByRole("button", { name: "Open menu" }).click();
  const nav = manager.getByRole("navigation").last();
  await expect(nav.getByRole("link", { name: "Groups" })).toBeVisible();
  await expect(manager.getByRole("link", { name: "Settings" })).toHaveCount(0);
  if (phone) await manager.keyboard.press("Escape");

  await manager.goto("/en/finance?tab=salaries");
  await expect(manager.getByRole("tab")).toHaveCount(2);
  await expect(manager.locator('[data-slot="month-strip"]')).toHaveCount(0);
  await manager.goto("/en/reports");
  await expect(manager.locator('[data-slot="kpi-row"] [data-slot="kpi-card"]')).toHaveCount(4);
  await expect(manager.locator("main")).not.toContainText("UZS");

  // Settings is their profile and nothing else.
  for (const tab of ["users", "centre", "notifications", "templates"]) {
    await manager.goto(`/en/settings?tab=${tab}`);
    await expect(manager.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
    await expect(manager.getByRole("tab")).toHaveCount(0);
    await expect(manager.locator("[data-user-row]")).toHaveCount(0);
  }
  await expect(manager.locator("#profile-email")).toHaveValue(email);
  await manager.screenshot({ path: testInfo.outputPath("manager-profile.png") });

  // ── Profile: the language is saved on the profile and used at the next sign-in ──
  await manager.getByLabel("Full name").fill(`${name} Jr`);
  await choose(manager, manager.getByRole("combobox", { name: "Interface language" }), "Русский");
  await manager.getByRole("button", { name: "Save", exact: true }).click();
  await expect(manager).toHaveURL(/\/ru\/settings/);
  await expect(manager.getByRole("heading", { name: "Профиль", level: 1 })).toBeVisible();
  const saved = await withDb(async (db) => {
    const { rows } = await db.query(
      "select p.full_name, p.language, p.role, p.is_active from profiles p join auth.users u on u.id = p.id where u.email = $1",
      [email],
    );
    return rows[0];
  });
  expect(saved).toEqual({ full_name: `${name} Jr`, language: "ru", role: "manager", is_active: true });

  // Password: a mismatch is refused, then it is changed.
  const newPassword = "Changed-manager-2026";
  await manager.locator("#profile-password:visible").fill(newPassword);
  await manager.locator("#profile-confirm:visible").fill("something else");
  await manager.getByRole("button", { name: "Сменить пароль" }).click();
  await expect(manager.getByText("Пароли не совпадают.")).toBeVisible();
  await manager.locator("#profile-confirm:visible").fill(newPassword);
  await manager.getByRole("button", { name: "Сменить пароль" }).click();
  await expect(manager.getByText("Пароль изменён")).toBeVisible();

  await manager.context().clearCookies();
  await manager.goto("/en/sign-in");
  await manager.locator("#email").fill(email);
  await manager.locator("#password").fill(newPassword);
  await manager.locator("button[type=submit]").click();
  // Russian, from the profile, although they signed in on the English page.
  await expect(manager).toHaveURL(/\/ru\/groups$/);

  // ── The owner sees them active, and deactivates them ──
  await page.reload();
  await expect(row).toHaveAttribute("data-user-status", "active");
  await expect(row).toContainText(`${name} Jr`);
  // Once they have an account, the same address cannot be invited again.
  await page.getByRole("button", { name: "Invite user" }).click();
  await sheet(page).getByLabel("Email").fill(email);
  await sheet(page).getByLabel("Full name").fill(name);
  await sheet(page).getByRole("button", { name: "Send invitation" }).click();
  await expect(sheet(page).getByText("This email already has an account.")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Cancel" }).click();

  await row.getByRole("button", { name: "Deactivate" }).click();
  await expect(dialog(page)).toContainText("signed out");
  await dialog(page).getByRole("button", { name: "Deactivate" }).click();
  await expect(row).toHaveAttribute("data-user-status", "deactivated");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("users.png") });

  // ── Their next request is blocked: signed out, and the database returns nothing ──
  await manager.goto("/ru/students");
  await expect(manager).toHaveURL(/\/ru\/sign-in$/);
  await manager.locator("#email").fill(email);
  await manager.locator("#password").fill(newPassword);
  await manager.locator("button[type=submit]").click();
  await expect(manager.locator('[role="alert"]:not(next-route-announcer *)').filter({ hasText: /./ }).first()).toBeVisible();
  await expect(manager).toHaveURL(/\/ru\/sign-in$/);
  await theirs.close();

  // ── Reactivated, they can sign in again ──
  await row.getByRole("button", { name: "Reactivate" }).click();
  await expect(row).toHaveAttribute("data-user-status", "active");
  const back = await browser.newContext();
  const returned = await back.newPage();
  await returned.goto("/en/sign-in");
  await returned.locator("#email").fill(email);
  await returned.locator("#password").fill(newPassword);
  await returned.locator("button[type=submit]").click();
  await expect(returned).toHaveURL(/\/ru\/groups$/);
  await back.close();

  // The owner cannot touch their own row.
  const own = page.locator('[data-user-row="owner@demo.educrm.uz"]');
  await expect(own.getByRole("button")).toHaveCount(0);
  await expect(own.getByRole("combobox")).toHaveCount(0);
});

test("the owner's settings: centre, notifications and templates", async ({ page }, testInfo) => {
  await signIn(page, "owner");
  await page.goto("/en/settings");
  await expect(page.getByRole("tab")).toHaveText(["Centre", "Users", "Notifications", "Templates", "Profile"]);

  // ── Centre: the due day cannot be before the billing day ──
  await expect(page.getByLabel("Centre name")).not.toHaveValue("");
  await page.getByLabel("Billing day").fill("10");
  await page.getByLabel("Due day").fill("5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("The due day cannot be before the billing day.")).toBeVisible();
  await page.getByLabel("Billing day").fill("29");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Choose a day from 1 to 28.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("centre.png") });
  // Left unsaved: other tests rely on the seeded days.

  // ── Notifications: the two services say they are not set up; nothing here can send ──
  await page.getByRole("tab", { name: "Notifications" }).click();
  await expect(page.locator('[data-slot="telegram-status"]')).toHaveText("Not configured");
  await expect(page.locator('[data-slot="eskiz-status"]')).toHaveText("Not configured");
  await expect(page.getByRole("button", { name: "Connect webhook" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send test SMS" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Send automatic reminders" })).toBeVisible();
  await page.getByLabel("Lesson reminder, hours before").fill("49");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Enter 1 to 48 hours.")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("notifications.png"), fullPage: true });

  // ── Templates: chips, live preview, character and SMS counts ──
  await page.getByRole("tab", { name: "Templates" }).click();
  const body = page.getByLabel("Text");
  const preview = page.locator('[data-slot="template-preview"]');
  const count = page.locator('[data-slot="template-count"]');
  await expect(body).toHaveValue(/\{student\}/);
  // Telegram, Uzbek: the preview is the text with the examples filled in.
  await expect(preview).toContainText("Aziza Karimova");
  await expect(preview).toContainText("600 000");
  await expect(preview).not.toContainText("{");
  await expect(count).toHaveText(/^\d+ characters$/);

  // SMS in English: plain Latin, one SMS.
  await choose(page, page.getByRole("combobox", { name: "Channel" }), "SMS");
  await choose(page, page.getByRole("combobox", { name: "Language" }), "English");
  await expect(body).toHaveValue(/^Hello! The \{month\} fee/);
  await expect(count).toHaveText(/^\d+ characters · 1 SMS$/);
  await expect(page.locator("[data-sms-encoding]")).toHaveAttribute("data-sms-encoding", "gsm");

  // Typing changes the preview as you go; a chip inserts its placeholder at the cursor.
  await body.fill("Dear parent, ");
  await page.getByRole("button", { name: "Insert Student's name" }).click();
  await expect(body).toHaveValue("Dear parent, {student}");
  await expect(preview).toHaveText("Dear parent, Aziza Karimova");
  await expect(count).toHaveText("27 characters · 1 SMS");
  await body.pressSequentially(" owes ");
  await page.getByRole("button", { name: "Insert Amount" }).click();
  await expect(preview).toHaveText("Dear parent, Aziza Karimova owes 600 000");
  await expect(page.getByText("Unsaved changes")).toBeVisible();

  // Cyrillic makes it Unicode: 70 characters per SMS, and the count says so.
  await body.fill(`${"Я".repeat(71)}`);
  await expect(count).toHaveText("71 characters · 2 SMS");
  await expect(page.locator("[data-sms-encoding]")).toHaveAttribute("data-sms-encoding", "unicode");
  // ʻ is replaced before an SMS goes out, so it does not cost Unicode.
  await body.fill("Toʻlov {amount} soʻm");
  await expect(preview).toHaveText("To'lov 600 000 so'm");
  await expect(page.locator("[data-sms-encoding]")).toHaveAttribute("data-sms-encoding", "gsm");
  await body.fill("Fee {amout}");
  await expect(page.getByText("Not a placeholder, sent as written: {amout}")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("templates.png"), fullPage: true });

  // Save one template and put it back.
  const original = await withDb(async (db) => {
    const { rows } = await db.query("select body from message_templates where type = 'custom' and channel = 'sms' and language = 'en'");
    return rows[0].body as string;
  });
  await choose(page, page.getByRole("combobox", { name: "Message" }), "One-off message");
  await expect(body).toHaveValue(original);
  const edited = `${original} [${testInfo.project.name}]`;
  try {
    await body.fill(edited);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);
    await page.reload();
    await choose(page, page.getByRole("combobox", { name: "Message" }), "One-off message");
    await choose(page, page.getByRole("combobox", { name: "Channel" }), "SMS");
    await choose(page, page.getByRole("combobox", { name: "Language" }), "English");
    await expect(body).toHaveValue(/\[(desktop-1440|phone-390)\]/);
  } finally {
    await withDb((db) =>
      db.query("update message_templates set body = $1 where type = 'custom' and channel = 'sms' and language = 'en'", [original]),
    );
  }
});
