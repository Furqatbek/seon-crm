import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/auth";
import { seedStudentId, withDb } from "./support/db";

// Card payments and receipts in the CRM — docs/STUDENT_APP_SPEC.md → "Rules →
// Receipts" and App 12's check: a student uploads a receipt in the app, a
// manager approves it, and the balance updates in the app.
//
// The app's half is done as the app does it, but in the database: an account
// linked to a student by phone, and submit_receipt() called the way the CRM's
// own server calls it once it has checked the uploaded file (that check is in
// src/lib/receipts/submit.test.ts). The staff half is the CRM; the last step
// reads what the app would read as that student.

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');

/** One student per screen size, so the two runs do not share receipts. */
const PEOPLE = {
  "desktop-1440": { student: seedStudentId(23), user: "0000000e-0000-4000-8000-000000000c01" },
  "phone-390": { student: seedStudentId(24), user: "0000000e-0000-4000-8000-000000000c02" },
} as const;

type Fixture = { studentId: string; userId: string; name: string; first: string; second: string };

async function fixture(project: keyof typeof PEOPLE): Promise<Fixture> {
  const { student, user } = PEOPLE[project];
  return withDb(async (db) => {
    const { rows } = await db.query("select full_name, phone from students where id = $1", [student]);
    const { full_name: name, phone } = rows[0] as { full_name: string; phone: string };
    // A clean start, then the app account: linked by the student's phone.
    await db.query("delete from payment_receipts where student_id = $1 and status = 'pending'", [student]);
    await db.query("delete from auth.users where id = $1", [user]);
    await db.query(
      `insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), '', '{"provider":"phone","providers":["phone"]}',
               jsonb_build_object('full_name', $3::text), now(), now())`,
      [user, phone.replace("+", ""), name],
    );
    // Two receipts, as the server writes them after checking each file.
    const send = async (file: string, hash: string, amount: number) =>
      (
        await db.query("select public.submit_receipt($1, null, $2, public.tashkent_today(), $3, 'jpg', $4, 'E2E') as id", [
          user,
          amount,
          `${student}/${file}-${Date.now()}.jpg`,
          hash.repeat(64),
        ])
      ).rows[0].id as string;
    return { studentId: student, userId: user, name, first: await send("first", "a", 600_000), second: await send("second", "b", 150_000) };
  });
}

/** What the app shows the student: the amount due, and their receipts. */
async function asStudent(userId: string) {
  return withDb(async (db) => {
    await db.query("begin");
    try {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
      await db.query("set local role authenticated");
      const due = await db.query("select (public.pay_by_card_info() ->> 'amount_due')::bigint as due");
      const receipts = await db.query("select id, status, reject_reason from payment_receipts order by created_at");
      return { due: Number(due.rows[0].due), receipts: receipts.rows as Array<{ id: string; status: string; reject_reason: string | null }> };
    } finally {
      await db.query("rollback");
    }
  });
}

test("a student's receipt is approved through Take payment: one payment, and the app's balance follows; another is rejected with a reason", async ({ page }, testInfo) => {
  const made = await fixture(testInfo.project.name as keyof typeof PEOPLE);
  const before = await asStudent(made.userId);
  await signIn(page, "manager");

  // ── Finance → Receipts: the count, the list, the duplicate warning ──
  await page.goto("/en/finance?tab=receipts");
  await expect(page.locator('[data-slot="receipts-count"]')).toBeVisible();
  const first = page.locator(`[data-receipt-id="${made.first}"]`);
  const second = page.locator(`[data-receipt-id="${made.second}"]`);
  await expect(first).toContainText(made.name);
  await expect(first).toContainText("UZS 600,000");
  await expect(second).toContainText("UZS 150,000");
  await page.screenshot({ path: testInfo.outputPath("receipts.png"), fullPage: true });

  // ── Approve opens Take payment, filled in from the receipt ──
  await first.getByRole("button", { name: "Approve" }).click();
  await expect(sheet(page).getByRole("heading", { name: "Take payment" })).toBeVisible();
  await expect(sheet(page).locator('[data-slot="payment-from-receipt"]')).toBeVisible();
  await expect(sheet(page).locator("#payment-amount")).toHaveValue("600 000");
  await page.screenshot({ path: testInfo.outputPath("approve.png") });
  await sheet(page).getByRole("button", { name: "Save" }).click();
  await expect(sheet(page).locator('[data-slot="payment-saved"]')).toBeVisible();
  await sheet(page).getByRole("button", { name: "Done" }).click();
  await expect(first).toHaveCount(0);

  // Exactly one payment, by transfer, linked to the receipt.
  const saved = await withDb(async (db) => {
    const { rows } = await db.query(
      `select r.status, p.method, p.amount::int as amount, (select count(*)::int from payments x where x.id = r.payment_id) as payments
       from payment_receipts r join payments p on p.id = r.payment_id where r.id = $1`,
      [made.first],
    );
    return rows[0];
  });
  expect(saved).toEqual({ status: "approved", method: "transfer", amount: 600_000, payments: 1 });

  // ── Reject needs a reason ──
  await second.getByRole("button", { name: "Reject" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(dialog.getByText("Give a reason.")).toBeVisible();
  await dialog.getByLabel("Reason").fill("The amount is not complete");
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(second).toHaveCount(0);

  // ── The decided lists ──
  await page.getByRole("radio", { name: "Approved" }).click();
  await expect(page.locator(`[data-receipt-id="${made.first}"]`)).toContainText("Payment no.");
  await page.getByRole("radio", { name: "Rejected" }).click();
  await expect(page.locator(`[data-receipt-id="${made.second}"]`)).toContainText("The amount is not complete");

  // ── What the app now shows the student ──
  const after = await asStudent(made.userId);
  // The approved 600 000 came off what was due (never below nothing).
  expect(after.due).toBe(Math.max(0, before.due - 600_000));
  expect(after.receipts.find((receipt) => receipt.id === made.first)?.status).toBe("approved");
  expect(after.receipts.find((receipt) => receipt.id === made.second)).toMatchObject({ status: "rejected", reject_reason: "The amount is not complete" });
});

test("the owner sets the card and the instructions; a manager has no Payments tab", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/en/settings?tab=payments");
  const form = page.locator('[data-slot="payment-settings"]');
  await form.locator("#payment-card-number").fill("8600 1234");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("A card number has 16 digits.")).toBeVisible();
  await form.locator("#payment-card-number").fill("8600 1234 5678 9012");
  await form.locator("#payment-card-holder").fill("SEON TOPIK MCHJ");
  await form.locator("#payment-card-bank").fill("Kapitalbank");
  await form.locator("#payment-instructions-en").fill("1. Transfer to this card.\n2. Upload the receipt.");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  const stored = await withDb(async (db) => (await db.query("select payment_card, payment_instructions ->> 'en' as en from centre_settings")).rows[0]);
  expect(stored.payment_card).toEqual({ number: "8600123456789012", holder: "SEON TOPIK MCHJ", bank: "Kapitalbank" });
  expect(stored.en).toContain("Upload the receipt");

  await page.context().clearCookies();
  await signIn(page, "manager");
  await page.goto("/en/settings?tab=payments");
  await expect(page.locator('[data-slot="payment-settings"]')).toHaveCount(0);
});
