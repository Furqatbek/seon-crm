import { expect, test, type Locator, type Page } from "@playwright/test";

import { formatMoney } from "../src/lib/format";
import { signIn } from "./support/auth";
import { withDb } from "./support/db";

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');
const dialog = (page: Page) => page.locator('[data-slot="dialog-content"]');
const kpi = async (page: Page, name: string) =>
  Number(await page.locator(`[data-kpi="${name}"]`).getAttribute("data-value"));
const money = async (cell: Locator) => (await cell.innerText()).trim();

async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name: option }).first().click();
}

// Tashkent is UTC+5 all year.
const today = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const monthsAgo = (n: number) =>
  new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - n, 1)).toISOString().slice(0, 7);

// Seeded teacher 3 is paid 120,000 soʻm per lesson.
const TEACHER = { id: "00000002-0000-4000-8000-000000000003", name: "Rustam Qodirov" };

/** Payouts are not seeded: each run starts and ends with none for its month. */
const clearPayouts = (month: string) =>
  withDb((db) => db.query("delete from teacher_payouts where month = $1", [`${month}-01`]));

test("the owner adds an expense, calculates salaries, adds a bonus and marks a payout paid", async ({ page }, testInfo) => {
  // Each screen size works on its own month, so the two runs do not share payouts.
  const phone = testInfo.project.name.startsWith("phone");
  const month = monthsAgo(phone ? 2 : 1);
  const note = `E2E marker ${testInfo.project.name} ${Date.now()}`;
  await clearPayouts(month);

  try {
    await signIn(page, "owner");

    // ── Expenses: add one, the list and the month strip follow ──
    await page.goto("/en/finance?tab=expenses");
    await expect(page.getByRole("tab", { name: "Expenses" })).toHaveAttribute("data-state", "active");
    // Six tabs do not fit a phone: the open one is scrolled into view.
    await expect(page.getByRole("tab", { name: "Expenses" })).toBeInViewport({ ratio: 0.9 });
    const expensesBefore = await kpi(page, "expenses");
    await page.getByRole("button", { name: "Add expense" }).click();
    await sheet(page).getByRole("button", { name: "Add expense" }).click();
    await expect(sheet(page).getByText("Choose a category.")).toBeVisible();
    await choose(page, sheet(page).getByRole("combobox", { name: "Category" }), "Supplies");
    await sheet(page).getByLabel("Amount, soʻm").fill("185 000");
    await sheet(page).getByLabel("Note").fill(note);
    await page.screenshot({ path: testInfo.outputPath("add-expense.png") });
    await sheet(page).getByRole("button", { name: "Add expense" }).click();
    await expect(sheet(page)).toBeHidden();

    const expense = page.locator("[data-expense-row]").filter({ hasText: note });
    await expect(expense).toContainText("Supplies");
    await expect(expense).toContainText(formatMoney(185_000, "en"));
    await expect.poll(() => kpi(page, "expenses")).toBeGreaterThanOrEqual(expensesBefore + 185_000);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("expenses.png") });

    // The category filter.
    await choose(page, page.getByRole("combobox", { name: "Category" }), "Rent");
    await expect(page).toHaveURL(/category=rent/);
    await expect(expense).toHaveCount(0);
    await expect(page.locator('[data-expense-row="rent"]')).not.toHaveCount(0);
    await expect(page.locator('[data-expense-row]:not([data-expense-row="rent"])')).toHaveCount(0);
    await choose(page, page.getByRole("combobox", { name: "Category" }), "Supplies");
    await expect(expense).toBeVisible();

    // ── Salaries: Calculate creates a draft per teacher ──
    await page.goto(`/en/finance?tab=salaries&month=${month}`);
    await expect(page.getByText("Press Calculate to create them")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Salaries" })).toBeInViewport({ ratio: 0.9 });
    await page.getByRole("button", { name: "Calculate" }).click();
    const payout = page.locator(`[data-payout-row="${TEACHER.id}"]`);
    await expect(payout).toHaveAttribute("data-payout-status", "draft");
    await expect(page.locator("[data-payout-row]")).toHaveCount(6);
    await expect(payout).toContainText("Per lesson");

    // The breakdown: lessons per group at 120,000 each, adding up to the calculated amount.
    await payout.getByRole("button", { name: `Show breakdown for ${TEACHER.name}` }).click();
    const breakdown = page.locator('[data-slot="payout-breakdown"]');
    await expect(breakdown).toContainText("per lesson");
    await expect(breakdown.locator("[data-breakdown-line]")).not.toHaveCount(0);
    await expect(breakdown.locator("[data-breakdown-line]").first()).toContainText(/\d+ lessons?/);
    const calculated = await money(payout.locator('[data-cell="calculated"]'));
    await expect(payout.locator('[data-cell="to-pay"]')).toHaveText(calculated);
    await page.screenshot({ path: testInfo.outputPath("salaries.png") });
    await payout.getByRole("button", { name: `Hide breakdown for ${TEACHER.name}` }).click();
    await expect(breakdown).toHaveCount(0);

    // ── Bonus and deduction need a note; the amount to pay follows ──
    const actions = payout.getByRole("button", { name: `Actions for ${TEACHER.name}` });
    await actions.click();
    await page.getByRole("menuitem", { name: "Bonus and deduction" }).click();
    await sheet(page).getByLabel("Bonus, soʻm").fill("200 000");
    await sheet(page).getByLabel("Deduction, soʻm").fill("50000");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page).getByText("Say what the bonus or deduction is for.")).toBeVisible();
    await sheet(page).getByLabel("What it is for").fill("Olympiad preparation");
    await page.screenshot({ path: testInfo.outputPath("bonus.png") });
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page)).toBeHidden();
    await expect(payout.locator('[data-cell="bonus"]')).toHaveText(formatMoney(200_000, "en"));
    await expect(payout.locator('[data-cell="deduction"]')).toHaveText(formatMoney(50_000, "en"));
    const calculatedAmount = Number(calculated.replace(/\D/g, ""));
    const toPay = formatMoney(calculatedAmount + 150_000, "en");
    await expect(payout.locator('[data-cell="to-pay"]')).toHaveText(toPay);

    // Calculate again: the draft keeps its bonus and deduction.
    await page.getByRole("button", { name: "Calculate" }).click();
    await expect(page.getByText("6 payouts calculated").last()).toBeVisible();
    await expect(payout.locator('[data-cell="to-pay"]')).toHaveText(toPay);

    // ── Mark paid locks the row ──
    await actions.click();
    await page.getByRole("menuitem", { name: "Mark paid" }).click();
    await expect(dialog(page)).toContainText(toPay);
    await expect(dialog(page)).toContainText("locked");
    // A finished month: no warning that lessons and payments are still coming in.
    await expect(dialog(page).locator('[data-slot="month-open-warning"]')).toHaveCount(0);
    await dialog(page).getByRole("button", { name: "Mark paid" }).click();
    await expect(payout).toHaveAttribute("data-payout-status", "paid");
    await expect(payout).toContainText("Paid");
    await expect(actions).toHaveCount(0);

    // Calculate skips the paid one and it stays as it was.
    await page.getByRole("button", { name: "Calculate" }).click();
    await expect(page.getByText("5 payouts calculated")).toBeVisible();
    await expect(payout.locator('[data-cell="to-pay"]')).toHaveText(toPay);
    await expect(payout).toHaveAttribute("data-payout-status", "paid");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("salaries-paid.png") });

    // ── The month in progress can be calculated, with a warning before it is locked ──
    if (!phone) {
      const current = monthsAgo(0);
      await clearPayouts(current);
      try {
        await page.goto("/en/finance?tab=salaries");
        await page.getByRole("button", { name: "Calculate" }).click();
        const open = page.locator(`[data-payout-row="${TEACHER.id}"]`);
        await open.getByRole("button", { name: `Actions for ${TEACHER.name}` }).click();
        await page.getByRole("menuitem", { name: "Mark paid" }).click();
        await expect(dialog(page).locator('[data-slot="month-open-warning"]')).toContainText("is not over yet");
        await dialog(page).getByRole("button", { name: "Cancel" }).click();
        await expect(open).toHaveAttribute("data-payout-status", "draft");
      } finally {
        await clearPayouts(current);
      }
    }

    // ── The teacher's Pay tab lists the payout ──
    await page.goto(`/en/teachers/${TEACHER.id}`);
    await page.getByRole("tab", { name: "Pay" }).click();
    const listed = page.locator(`[data-payout="${month}-01"]`);
    await expect(listed).toHaveAttribute("data-payout-status", "paid");
    await expect(listed).toContainText(toPay);
    await expect(listed).toContainText(formatMoney(200_000, "en"));
    await page.screenshot({ path: testInfo.outputPath("teacher-pay.png") });

    // ── Adjustments: every credit and voided payment, with who and why ──
    // Seeded: two payments typed in twice last month and voided by the owner.
    await page.goto(`/en/finance?tab=adjustments&month=${monthsAgo(1)}`);
    const voided = page.locator('[data-adjustment-row="void"]').filter({ hasText: "Ikki marta kiritilgan" });
    await expect(voided).toHaveCount(2);
    await expect(voided.first()).toContainText("Voided payment");
    await expect(voided.first()).toContainText(/Receipt \d+/);
    await expect(voided.first()).toContainText("Jasur Karimov");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("adjustments.png") });

    // ── As manager nothing from this phase is visible ──
    await page.context().clearCookies();
    await signIn(page, "manager");
    for (const tab of ["expenses", "salaries", "adjustments"]) {
      await page.goto(`/en/finance?tab=${tab}&month=${month}`);
      await expect(page.getByRole("tab", { name: "Payments" })).toHaveAttribute("data-state", "active");
      await expect(page.getByRole("tab")).toHaveCount(2);
      await expect(page.locator('[data-slot="month-strip"]')).toHaveCount(0);
      await expect(page.locator("[data-payout-row], [data-expense-row], [data-adjustment-row]")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Calculate|Add expense/ })).toHaveCount(0);
    }
    await page.goto(`/en/teachers/${TEACHER.id}`);
    await expect(page.getByRole("heading", { name: TEACHER.name })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Pay" })).toHaveCount(0);
    await expect(page.locator("[data-payout]")).toHaveCount(0);
  } finally {
    await clearPayouts(month);
    await withDb((db) => db.query("delete from expenses where note = $1", [note]));
  }
});
