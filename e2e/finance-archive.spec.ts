import { expect, test, type Page } from "@playwright/test";

import { formatMoney } from "../src/lib/format";
import { signIn } from "./support/auth";
import { seedStudentId, withDb } from "./support/db";

const dialog = (page: Page) => page.locator('[data-slot="dialog-content"]');

// Tashkent is UTC+5 all year.
const today = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const monthsAgo = (n: number) =>
  new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - n, 1)).toISOString().slice(0, 7);

const TEACHER = { id: "00000002-0000-4000-8000-000000000003", name: "Rustam Qodirov" };

test("the owner archives a payment, a charge, an expense and a payout", async ({ page }, testInfo) => {
  const phone = testInfo.project.name.startsWith("phone");
  const student = seedStudentId(phone ? 12 : 11);
  const marker = `E2E archive ${testInfo.project.name} ${Date.now()}`;
  const salaryMonth = monthsAgo(phone ? 4 : 3);

  // A payment, a credit and an expense of this run's own, so nothing seeded is lost.
  const made = await withDb(async (db) => {
    const owner = "00000001-0000-4000-8000-000000000001";
    const { rows: p } = await db.query(
      `insert into payments (student_id, group_id, amount, method, note, received_by)
       select $1, (select group_id from enrollments where student_id = $1 order by joined_on limit 1), 137000, 'cash', $2, $3
       returning receipt_no`,
      [student, marker, owner],
    );
    await db.query(
      `insert into charges (student_id, billing_month, type, amount, note, created_by)
       values ($1, date_trunc('month', public.tashkent_today())::date, 'adjustment', -41000, $2, $3)`,
      [student, marker, owner],
    );
    await db.query(
      `insert into expenses (category, amount, spent_on, note, created_by)
       values ('supplies', 73000, public.tashkent_today(), $1, $2)`,
      [marker, owner],
    );
    await db.query("delete from teacher_payouts where month = $1", [`${salaryMonth}-01`]);
    return { receipt: p[0].receipt_no as number };
  });

  try {
    await signIn(page, "owner");

    // ── Payment ──
    await page.goto("/en/finance?tab=payments");
    const payment = page.locator(`[data-payment-row="${made.receipt}"]`);
    await expect(payment).toBeVisible();
    await payment.locator('[data-archive="payment"]').click();
    await expect(dialog(page)).toContainText("Archive this record?");
    await page.screenshot({ path: testInfo.outputPath("archive-payment.png") });
    await dialog(page).getByRole("button", { name: "Archive" }).click();
    await expect(payment).toHaveCount(0);
    // Other tests take payments at the same time, so the totals are checked in
    // supabase/tests/archive.test.ts; here, that the record itself is archived.
    const archived = await withDb((db) =>
      db.query("select voided_at is not null as voided, archived_at is not null as archived from payments where receipt_no = $1", [made.receipt]),
    );
    expect(archived.rows).toEqual([{ voided: true, archived: true }]);

    // ── Charge ──
    await page.goto("/en/finance?tab=charges");
    const charge = page.locator("[data-charge-row]").filter({ hasText: marker });
    await expect(charge).toBeVisible();
    await charge.locator('[data-archive="charge"]').click();
    await dialog(page).getByRole("button", { name: "Archive" }).click();
    await expect(charge).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Archive all charges" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("charges.png") });

    // ── Expense ──
    await page.goto("/en/finance?tab=expenses");
    const expense = page.locator("[data-expense-row]").filter({ hasText: marker });
    await expect(expense).toContainText(formatMoney(73_000, "en"));
    await expense.locator('[data-archive="expense"]').click();
    await dialog(page).getByRole("button", { name: "Archive" }).click();
    await expect(expense).toHaveCount(0);
    const left = await withDb((db) =>
      db.query(
        `select (select count(*) from charges where note = $1 and archived_at is null)::int as charges,
                (select count(*) from expenses where note = $1 and archived_at is null)::int as expenses`,
        [marker],
      ),
    );
    expect(left.rows).toEqual([{ charges: 0, expenses: 0 }]);

    // ── Payout: archived, then Calculate brings a fresh draft ──
    await page.goto(`/en/finance?tab=salaries&month=${salaryMonth}`);
    await page.getByRole("button", { name: "Calculate" }).click();
    const payout = page.locator(`[data-payout-row="${TEACHER.id}"]`);
    await expect(payout).toHaveAttribute("data-payout-status", "draft");
    await payout.locator('[data-archive="payout"]').click();
    await dialog(page).getByRole("button", { name: "Archive" }).click();
    await expect(payout).toHaveCount(0);
    await expect(page.locator("[data-payout-row]")).toHaveCount(5);
    await page.getByRole("button", { name: "Calculate" }).click();
    await expect(payout).toHaveAttribute("data-payout-status", "draft");
    await expect(page.locator("[data-payout-row]")).toHaveCount(6);
  } finally {
    await withDb(async (db) => {
      await db.query("delete from teacher_payouts where month = $1", [`${salaryMonth}-01`]);
      await db.query("delete from payments where note = $1", [marker]);
      await db.query("delete from charges where note = $1", [marker]);
      await db.query("delete from expenses where note = $1", [marker]);
    });
  }
});

test("a manager has no Archive in Finance", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/en/finance?tab=payments");
  await expect(page.locator("[data-payment-row]").first()).toBeVisible();
  await expect(page.locator("[data-archive]")).toHaveCount(0);
  // Charges, Expenses and Salaries are the owner's tabs: a manager has none of them.
  await expect(page.getByRole("tab", { name: "Charges" })).toHaveCount(0);
});
