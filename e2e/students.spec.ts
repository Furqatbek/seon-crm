import { expect, test, type Locator, type Page } from "@playwright/test";

import { signIn } from "./support/auth";

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');
const dialog = (page: Page) => page.locator('[data-slot="dialog-content"]');
const status = (page: Page) => page.locator("[data-student-status]");

async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name: option }).first().click();
}

async function menu(page: Page, item: string) {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("a lead is converted into a student, linked both ways", async ({ page }, testInfo) => {
  const name = `E2E Convert ${testInfo.project.name} ${Date.now()}`;
  const digits = String(Date.now()).slice(-7);

  await signIn(page, "manager");
  await page.goto("/en/leads");
  await expect(page.locator("[data-lead-card]").first()).toBeVisible();

  // ── A new lead ──
  await page.getByRole("button", { name: "New lead" }).first().click();
  await sheet(page).getByLabel("Name").fill(name);
  await sheet(page).getByLabel("Phone").fill(`94 ${digits}`);
  await choose(page, sheet(page).locator("#lead-source"), "Referral");
  await sheet(page).getByRole("button", { name: "Save" }).click();
  await expect(sheet(page)).toHaveCount(0);

  // ── Convert to student ──
  await page.locator("[data-lead-card]").filter({ hasText: name }).click();
  await sheet(page).getByRole("button", { name: "Convert to student" }).click();
  await expect(sheet(page).getByRole("heading", { name: "Convert to student" })).toBeVisible();
  // The form starts from the lead, and the lead's own number is not a duplicate.
  await expect(sheet(page).getByLabel("Name", { exact: true })).toHaveValue(name);
  await expect(sheet(page).getByLabel("Phone", { exact: true })).toHaveValue(
    `+998 94 ${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`,
  );
  await sheet(page).getByLabel("Parent's name").fill("Test Parent");
  await sheet(page).getByLabel("Parent's phone").fill("12345");
  await sheet(page).getByRole("button", { name: "Save" }).click();
  await expect(sheet(page).getByText("Enter the parent's number")).toBeVisible();
  await sheet(page).getByLabel("Parent's phone").fill(`95 ${digits}`);
  await choose(page, sheet(page).locator("#student-language"), "Русский");
  await expect(sheet(page).locator("#student-phone-matches")).toHaveCount(0);

  await page.screenshot({ path: testInfo.outputPath("convert.png") });

  await sheet(page).getByRole("button", { name: "Save" }).click();

  // ── The student page ──
  // Convert continues to the enrol sheet for the new student.
  await expect(page).toHaveURL(/\/en\/students\/[0-9a-f-]{36}\?enrol=1$/);
  await expect(sheet(page).getByRole("heading", { name: `Enrol ${name}` })).toBeVisible();
  await sheet(page).getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/en\/students\/[0-9a-f-]{36}$/);
  const studentUrl = page.url();
  const studentId = studentUrl.split("/").pop()!;
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  await expect(status(page)).toHaveAttribute("data-student-status", "active");
  await expect(page.locator('[data-slot="student-balance"]')).toContainText("UZS 0");
  await expect(page.getByRole("button", { name: "Take payment" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
  await expect(page.getByText("Test Parent")).toBeVisible();
  await expect(page.getByText("Русский")).toBeVisible();

  // The Telegram link carries a 22-character code and can be shown as a QR code.
  const link = page.locator("[data-telegram-link]");
  await expect(link).toHaveText(/^https:\/\/t\.me\/ziyo_markaz_demo_bot\?start=[A-Za-z0-9]{22}$/);
  await page.getByRole("button", { name: "Show QR code" }).click();
  await expect(page.getByRole("img", { name: "QR code with the Telegram link" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("student.png"), fullPage: true });

  // ── Linked both ways: student → lead → student ──
  await page.getByRole("link", { name: "Open the lead" }).click();
  await expect(sheet(page).locator("[data-lead-status]")).toHaveAttribute("data-lead-status", "won");
  await expect(sheet(page).getByText("New → Won")).toBeVisible();
  await expect(sheet(page).getByText("This lead became a student and can no longer be changed.")).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "Convert to student" })).toHaveCount(0);
  await expect(sheet(page).getByRole("link", { name: "Open the student" })).toHaveAttribute(
    "href",
    `/en/students/${studentId}`,
  );
  await sheet(page).getByRole("button", { name: "Close" }).click();
  await expect(
    page.locator('[data-lead-column="won"] [data-lead-card]').filter({ hasText: name }),
  ).toBeVisible();

  // ── Pause, back to active, and Mark as left ──
  await page.goto(studentUrl);
  await menu(page, "Pause");
  await expect(status(page)).toHaveAttribute("data-student-status", "paused");
  await menu(page, "Mark as active");
  await expect(status(page)).toHaveAttribute("data-student-status", "active");
  await menu(page, "Mark as left");
  await expect(dialog(page)).toContainText("leaves every group today");
  await dialog(page).getByRole("button", { name: "Mark as left" }).click();
  await expect(status(page)).toHaveAttribute("data-student-status", "left");

  // A manager is not offered Archive.
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Archive" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // ── Clean up as the owner ──
  await page.context().clearCookies();
  await signIn(page, "owner");
  await page.goto(studentUrl);
  await menu(page, "Archive");
  await dialog(page).getByRole("button", { name: "Archive" }).click();
  await expect(page).toHaveURL(/\/en\/students$/);
});

test("the student list filters, and the ledger ends on the student's balance", async ({ page }, testInfo) => {
  await signIn(page, "manager");
  await page.goto("/en/students");
  const rows = page.locator("[data-student-row]");
  await expect(rows).toHaveCount(50);
  await expect(page.locator('[data-slot="pagination"]')).toContainText(/1–50 of \d+/);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("students.png") });

  // Debt only: every row is below zero and says so in words.
  await page.getByLabel("Debt only").click();
  await expect(page).toHaveURL(/debt=1/);
  await expect(rows.first()).toBeVisible();
  const states = await page.locator("[data-student-row] [data-balance-state]").evaluateAll((cells) =>
    cells.map((cell) => cell.getAttribute("data-balance-state")),
  );
  expect(states.length).toBeGreaterThan(5);
  expect(states.every((state) => state === "debt" || state === "due")).toBe(true);
  await expect(rows.first()).toContainText(/Debt|Due/);
  await page.screenshot({ path: testInfo.outputPath("debtors.png") });
  await page.getByLabel("Debt only").click();

  // Status and group filters live in the URL.
  await choose(page, page.getByRole("combobox", { name: "Status" }), "Paused");
  await expect(page).toHaveURL(/status=paused/);
  await expect(rows.first()).toContainText("Paused");
  expect(await rows.count()).toBeLessThan(10);
  await choose(page, page.getByRole("combobox", { name: "Status" }), "All statuses");
  await choose(page, page.getByRole("combobox", { name: "Group" }), "English B1");
  await expect(page).toHaveURL(/group=/);
  await expect(rows.first()).toContainText("English B1");
  const inGroup = await rows.count();
  expect(inGroup).toBeGreaterThan(3);
  expect(inGroup).toBeLessThan(20);

  // ── A seeded student: ledger, attendance, messages ──
  await page.goto("/en/students?q=Aziz%20Sultonov");
  await rows.filter({ hasText: "Aziz Sultonov" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Aziz Sultonov");
  const headerBalance = await page.locator('[data-slot="student-balance"] [data-slot="money-text"]').innerText();

  await page.getByRole("tab", { name: "Ledger" }).click();
  await expect(page).toHaveURL(/tab=ledger/);
  const ledger = page.locator("[data-ledger]");
  await expect(ledger.first()).toBeVisible();
  expect(await ledger.count()).toBeGreaterThanOrEqual(3);
  // Newest first: the top row's running balance is the student's balance.
  await expect(ledger.first().locator('[data-slot="money-text"]').last()).toHaveText(headerBalance);
  await expect(page.getByRole("tabpanel")).toContainText("Fee for");
  await page.screenshot({ path: testInfo.outputPath("ledger.png"), fullPage: true });

  await page.getByRole("tab", { name: "Attendance" }).click();
  await expect(page.locator("[data-attendance-rate]").first()).toContainText(/Attendance \d+%/);
  await expect(page.locator("[data-mark]").first()).toBeVisible();
  const month = await page.locator("[data-attendance-month]").getAttribute("data-attendance-month");
  await page.screenshot({ path: testInfo.outputPath("attendance.png"), fullPage: true });
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.locator("[data-attendance-month]")).not.toHaveAttribute("data-attendance-month", month!);
  await expect(page.locator('[data-mark="present"]').first()).toBeVisible();

  await page.getByRole("tab", { name: "Messages" }).click();
  await expect(page.getByText("Nothing has been sent yet.")).toBeVisible();
});
