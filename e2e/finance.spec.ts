import { expect, test, type Locator, type Page } from "@playwright/test";

import { formatMoney, formatMonth } from "../src/lib/format";
import { signIn } from "./support/auth";
import { seedStudentId, withDb } from "./support/db";

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');
const dialog = (page: Page) => page.locator('[data-slot="dialog-content"]');
const balance = (page: Page) => page.locator('[data-slot="student-balance"] [data-slot="money-text"]');
const kpi = async (page: Page, name: string) =>
  Number(await page.locator(`[data-kpi="${name}"]`).getAttribute("data-value"));

async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name: option }).first().click();
}

async function menu(page: Page, item: string) {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

// Tashkent is UTC+5 all year.
const today = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const month = today.slice(0, 7);
// Fees are due by the 5th: after it an unpaid fee is a debt and the student is a debtor.
const afterDueDay = Number(today.slice(8)) > 5;

/**
 * A seeded student who is paused and has no ledger at all, so this month has
 * not been billed for them yet. Returns what one monthly fee costs them.
 */
async function unbilledStudent(n: number) {
  const id = seedStudentId(n);
  return withDb(async (db) => {
    await db.query("delete from payments where student_id = $1", [id]);
    await db.query("delete from charges where student_id = $1", [id]);
    await db.query("update students set status = 'paused' where id = $1", [id]);
    const { rows } = await db.query(
      `select s.full_name, g.name as group_name,
              (public.group_fee_for(g.id, date_trunc('month', public.tashkent_today())::date)
               - public.discount_amount(
                   public.group_fee_for(g.id, date_trunc('month', public.tashkent_today())::date),
                   e.discount_kind, e.discount_value))::int as fee
       from students s
       join enrollments e on e.student_id = s.id and e.status = 'active'
       join groups g on g.id = e.group_id
       where s.id = $1`,
      [id],
    );
    return { id, name: rows[0].full_name as string, group: rows[0].group_name as string, fee: rows[0].fee as number };
  });
}

test("generate a month, take a payment, and the balance and debtors follow", async ({ page, context }, testInfo) => {
  // Each screen size has its own student, so the two runs do not share a ledger.
  const student = await unbilledStudent(testInfo.project.name.startsWith("phone") ? 76 : 75);
  const fee = formatMoney(student.fee, "en");
  const debt = formatMoney(-student.fee, "en");

  await signIn(page, "owner");

  // ── The student comes back from a pause: not billed for this month yet ──
  await page.goto(`/en/students/${student.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(student.name);
  await expect(balance(page)).toHaveText("UZS 0");
  await menu(page, "Mark as active");
  await expect(page.locator("[data-student-status]")).toHaveAttribute("data-student-status", "active");

  // ── Only the current month can be billed by hand ──
  const lastMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  await page.goto(`/en/finance?tab=charges&month=${lastMonth}`);
  await expect(page.locator('[data-slot="month-strip"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate charges" })).toHaveCount(0);

  // ── Finance → Charges: preview, then generate ──
  await page.goto("/en/finance?tab=charges");
  await expect(page.locator('[data-slot="month-strip"]')).toBeVisible();
  await expect(page.locator('[data-kpi="expenses"]')).toHaveText("UZS 0");
  const collectedBefore = await kpi(page, "collected");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("charges.png") });

  await page.getByRole("button", { name: "Generate charges" }).click();
  const preview = sheet(page).locator('[data-slot="charge-preview"]');
  await expect(preview.locator("[data-preview-row]").or(preview.getByText("Every fee for this month already exists"))).not.toHaveCount(0);
  const row = preview.locator("[data-preview-row]").filter({ hasText: student.name });
  // (The other screen size's run may have generated the month a moment ago.)
  if ((await row.count()) > 0) {
    await expect(row).toContainText(student.group);
    await expect(row).toContainText(fee);
    await page.screenshot({ path: testInfo.outputPath("preview.png") });
    await sheet(page).getByRole("button", { name: /^Create \d+ charges?$/ }).click();
  } else {
    await sheet(page).getByRole("button", { name: /Close|Cancel/ }).first().click();
  }
  await expect(sheet(page)).toHaveCount(0);
  const charge = page.locator('[data-charge-row="monthly_fee"]').filter({ hasText: student.name });
  await expect(charge).toContainText(student.group);
  await expect(charge).toContainText(fee);

  // Generating again offers nothing for this student: no duplicates.
  await page.getByRole("button", { name: "Generate charges" }).click();
  await expect(preview.locator("[data-preview-row]").or(preview.getByText("Every fee for this month already exists"))).not.toHaveCount(0);
  await expect(preview.locator("[data-preview-row]").filter({ hasText: student.name })).toHaveCount(0);
  await sheet(page).getByRole("button", { name: /Close|Cancel/ }).first().click();

  // ── The student now owes the fee ──
  await page.goto(`/en/students/${student.id}`);
  await expect(balance(page)).toHaveText(debt);
  await expect(page.locator('[data-slot="student-balance"]')).toContainText(afterDueDay ? "Debt" : "Due");

  // ── Debtors, and Take payment from the debtor row ──
  await page.goto("/en/finance?tab=debtors");
  const debtor = page.locator(`[data-debtor-row="${student.id}"]`);
  if (afterDueDay) {
    await expect(debtor).toContainText(student.name);
    await expect(debtor).toContainText(debt);
    await expect(debtor).toContainText(formatMonth(month, "en"));
    await expect(debtor).toContainText("Never");
    await expect(debtor.getByRole("button", { name: "Remind" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Remind all" })).toBeDisabled();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("debtors.png") });
    await debtor.getByRole("button", { name: "Take payment" }).click();
  } else {
    // Before the due day the fee is only due: the student is not a debtor yet.
    await expect(debtor).toHaveCount(0);
    await page.getByRole("button", { name: "Take payment" }).first().click();
    await sheet(page).locator("#payment-student").fill(student.name);
    await sheet(page).locator('[data-slot="student-results"] button').filter({ hasText: student.name }).click();
  }

  // The balance is shown, the only group is pre-selected and the debt is suggested.
  await expect(sheet(page).locator('[data-slot="payment-balance"]')).toContainText(debt);
  await expect(sheet(page).locator("#payment-group")).toContainText(student.group);
  await expect(sheet(page).getByLabel("Amount, soʻm")).toHaveValue(
    String(student.fee).replace(/\B(?=(\d{3})+(?!\d))/g, " "),
  );
  await sheet(page).getByLabel("Amount, soʻm").fill("0");
  await sheet(page).getByRole("button", { name: "Save payment" }).click();
  await expect(sheet(page).getByText("Enter a whole amount above 0.")).toBeVisible();
  await sheet(page).getByLabel("Amount, soʻm").fill(String(student.fee));
  await sheet(page).getByRole("radio", { name: "Card" }).click();
  await sheet(page).getByLabel("Note").fill("E2E payment");
  await page.screenshot({ path: testInfo.outputPath("take-payment.png") });
  await sheet(page).getByRole("button", { name: "Save payment" }).click();

  // ── Saved: receipt number and print view ──
  const saved = sheet(page).locator('[data-slot="payment-saved"]');
  await expect(saved).toContainText("Payment saved");
  await expect(saved).toContainText(fee);
  const receiptNo = await saved.locator("[data-receipt-no]").getAttribute("data-receipt-no");
  expect(Number(receiptNo)).toBeGreaterThan(0);
  const printLink = sheet(page).getByRole("link", { name: "Print receipt" });
  await expect(printLink).toHaveAttribute("target", "_blank");

  const receipt = await context.newPage();
  await receipt.goto((await printLink.getAttribute("href"))!);
  const paper = receipt.locator('[data-slot="receipt"]');
  await expect(paper).toContainText(`Receipt no. ${receiptNo}`);
  await expect(paper).toContainText(student.name);
  await expect(paper).toContainText(student.group);
  await expect(paper).toContainText("Card");
  await expect(paper).toContainText(fee);
  await expect(paper).toContainText("E2E payment");
  // Sized for an 80 mm receipt printer, or for A4.
  await expect(paper).toHaveAttribute("data-paper", "roll");
  await expect(paper).toBeVisible();
  expect((await paper.boundingBox())!.width).toBeLessThanOrEqual(273); // 72 mm
  await receipt.screenshot({ path: testInfo.outputPath("receipt-80mm.png") });
  await receipt.getByRole("radio", { name: "A4" }).click();
  await expect(paper).toHaveAttribute("data-paper", "a4");
  await receipt.screenshot({ path: testInfo.outputPath("receipt-a4.png") });
  await receipt.close();
  await sheet(page).getByRole("button", { name: "Done" }).click();

  // ── Balance and debtors update ──
  await expect(debtor).toHaveCount(0);
  await page.goto(`/en/students/${student.id}?tab=ledger`);
  await expect(balance(page)).toHaveText("UZS 0");
  const top = page.locator("[data-ledger]").first();
  await expect(top).toHaveAttribute("data-ledger", "payment");
  await expect(top).toContainText(`receipt ${receiptNo}`);
  await expect(top).toContainText("E2E payment");

  // ── Payments tab, and the month's Collected ──
  await page.goto("/en/finance");
  const payment = page.locator(`[data-payment-row="${receiptNo}"]`);
  await expect(payment).toContainText(student.name);
  await expect(payment).toContainText("Card");
  await expect(payment).toContainText(fee);
  await expect(payment).toContainText("Jasur Karimov");
  expect(await kpi(page, "collected")).toBeGreaterThanOrEqual(collectedBefore + student.fee);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("payments.png") });
  await choose(page, page.getByRole("combobox", { name: "Method" }), "Cash");
  await expect(page).toHaveURL(/method=cash/);
  await expect(payment).toHaveCount(0);
  await choose(page, page.getByRole("combobox", { name: "Method" }), "Card");
  await expect(payment).toBeVisible();

  // ── The owner voids it, with a reason; the debt is back ──
  const collectedPaid = await kpi(page, "collected");
  await payment.getByRole("button", { name: `Actions for receipt ${receiptNo}` }).click();
  await page.getByRole("menuitem", { name: "Void payment" }).click();
  await dialog(page).getByRole("button", { name: "Void payment" }).click();
  await expect(dialog(page).getByText("Write the reason.")).toBeVisible();
  await dialog(page).getByLabel("Reason").fill("E2E: entered by mistake");
  await dialog(page).getByRole("button", { name: "Void payment" }).click();
  await expect(payment).toHaveAttribute("data-voided", "true");
  await expect(payment).toContainText("Voided");
  await expect.poll(() => kpi(page, "collected")).toBeLessThanOrEqual(collectedPaid - student.fee);
  await page.goto(`/en/students/${student.id}`);
  await expect(balance(page)).toHaveText(debt);

  // ── A manager: no totals, no Charges tab, no Void; but can add a credit with a note ──
  await page.context().clearCookies();
  await signIn(page, "manager");
  await page.goto("/en/finance?tab=charges");
  await expect(page.getByRole("tab", { name: "Payments" })).toHaveAttribute("data-state", "active");
  await expect(page.getByRole("tab", { name: "Debtors" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Charges" })).toHaveCount(0);
  await expect(page.locator('[data-slot="month-strip"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate charges" })).toHaveCount(0);
  const other = page.locator('[data-payment-row][data-voided="false"]').first();
  await other.getByRole("button", { name: /^Actions for receipt/ }).click();
  await expect(page.getByRole("menuitem", { name: "Print receipt" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Void payment" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto(`/en/students/${student.id}`);
  await menu(page, "Add credit");
  await sheet(page).getByLabel("Credit, soʻm").fill(String(student.fee));
  await sheet(page).getByRole("button", { name: "Add credit" }).click();
  await expect(sheet(page).getByText("Say why the credit is given.")).toBeVisible();
  await sheet(page).getByLabel("Why the credit").fill("E2E credit");
  await sheet(page).getByRole("button", { name: "Add credit" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(balance(page)).toHaveText("UZS 0");
  await page.getByRole("tab", { name: "Ledger" }).click();
  await expect(page.locator("[data-ledger]").first()).toContainText("Credit");
  await expect(page.locator("[data-ledger]").first()).toContainText("E2E credit");
});
