import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/auth";
import { withDb } from "./support/db";

// Vouchers and free open lessons, end to end — docs/STUDENT_APP_SPEC.md →
// "Rules → Vouchers", "Rules → Free open lessons" and App 11's check: an App
// user finishes an exam, gets a voucher and books an open lesson; staff enrol
// them with the code and the account links automatically.
//
// The app's half happens in the database, as the app's own calls: the account
// signs up by phone, an exam attempt is finished (which issues the voucher)
// and book_open_lesson() is called as that person. The staff half is the CRM.

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');

/** One person per screen size, so the two runs do not share a lead. */
const PEOPLE = {
  "desktop-1440": { user: "0000000e-0000-4000-8000-000000000b01", phone: "998770006001", name: "Bekzod Vaucherov" },
  "phone-390": { user: "0000000e-0000-4000-8000-000000000b02", phone: "998770006002", name: "Sardor Vaucherov" },
} as const;

type Fixture = { name: string; code: string; leadId: string; slotTitle: string };

/** Runs SQL as the App user, the way the app's requests arrive. */
async function asUser<T>(db: import("pg").Client, userId: string, sql: string, params: unknown[]): Promise<T> {
  await db.query("begin");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
    await db.query("set local role authenticated");
    const result = await db.query(sql, params);
    await db.query("commit");
    return result.rows[0] as T;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function fixture(project: keyof typeof PEOPLE): Promise<Fixture> {
  const person = PEOPLE[project];
  const slotTitle = `Open lesson e2e ${project}`;
  return withDb(async (db) => {
    // A clean start: the account and whatever an earlier run left of it.
    await db.query("delete from vouchers where lead_id in (select id from leads where phone = $1)", [`+${person.phone}`]);
    await db.query("delete from auth.users where id = $1", [person.user]);
    await db.query("update voucher_settings set percent_enabled = true, percent_weight = 1, percent_value = 20, fixed_enabled = false, trial_enabled = false, valid_days = 14");
    await db.query(
      `insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), '', '{"provider":"phone","providers":["phone"]}',
               jsonb_build_object('full_name', $3::text, 'korean_level', 'topik1'), now(), now())`,
      [person.user, person.phone, person.name],
    );
    // Their first finished exam: the voucher is issued.
    const { rows: exams } = await db.query(`insert into exams (title, level, status, published_at) values ('E2E exam', 'topik1', 'published', now()) returning id`);
    const { rows: attempts } = await db.query(
      `insert into exam_attempts (exam_id, profile_id, current_section, section_deadlines, first_attempt) values ($1, $2, 'listening', '{}', true) returning id`,
      [exams[0].id, person.user],
    );
    await db.query(`update exam_attempts set status = 'submitted', current_section = null, submitted_at = now() where id = $1`, [attempts[0].id]);
    // A slot three days from now, and their booking of it.
    await db.query("update open_lesson_slots set archived_at = now(), is_active = false where title = $1 and archived_at is null", [slotTitle]);
    const { rows: slots } = await db.query(
      `insert into open_lesson_slots (title, korean_level, weekday, start_time, duration_min, room, seats)
       values ($1, 'topik1', extract(isodow from public.tashkent_today() + 3)::int, '11:00', 90, '101', 10)
       returning id, to_char(public.tashkent_today() + 3, 'YYYY-MM-DD') as day`,
      [slotTitle],
    );
    await asUser(db, person.user, "select public.book_open_lesson($1, $2)", [slots[0].id, slots[0].day]);
    const { rows } = await db.query("select v.code, v.lead_id from vouchers v where v.profile_id = $1", [person.user]);
    return { name: person.name, code: rows[0].code as string, leadId: rows[0].lead_id as string, slotTitle };
  });
}

test("an App user's voucher and booking reach the CRM; staff enrol with the code and the account links itself", async ({ page }, testInfo) => {
  const project = testInfo.project.name as keyof typeof PEOPLE;
  const made = await fixture(project);
  await signIn(page, "manager");

  // ── Leads → Open lessons: the session's list, and Came ──
  await page.goto("/en/leads/open-lessons");
  const session = page.locator("[data-session]").filter({ hasText: made.slotTitle }).first();
  await expect(session.locator("[data-seats]")).toHaveText("1 of 10 seats booked");
  const row = session.locator("[data-booking]").filter({ hasText: made.name });
  await expect(row).toHaveAttribute("data-booking", "booked");
  await row.getByRole("radio", { name: "Came" }).click();
  await expect(row).toHaveAttribute("data-booking", "came");
  await page.screenshot({ path: testInfo.outputPath("open-lessons.png"), fullPage: true });

  // ── The lead sheet: on Trial through the open lesson, with the voucher and its code ──
  await page.goto(`/en/leads?lead=${made.leadId}`);
  const offer = sheet(page).locator('[data-slot="lead-offer"]');
  await expect(offer.locator("[data-voucher-code]")).toHaveText(made.code);
  await expect(offer).toContainText("20% off the first month");
  await expect(offer.locator("[data-voucher]")).toHaveAttribute("data-voucher", "issued");
  await expect(offer.locator("[data-booking]")).toHaveAttribute("data-booking", "came");
  await expect(sheet(page).locator('[data-activity="voucher_issued"]')).toBeVisible();
  await expect(sheet(page).locator('[data-activity="open_lesson_booked"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("lead.png") });

  // ── Convert to student, then enrol with the code ──
  await sheet(page).getByRole("button", { name: "Convert to student" }).click();
  await expect(sheet(page).getByRole("heading", { name: "Convert to student" })).toBeVisible();
  await sheet(page).getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/en\/students\/[0-9a-f-]{36}\?enrol=1$/);
  const studentId = page.url().split("/").pop()!.split("?")[0];
  await expect(sheet(page).getByRole("heading", { name: `Enrol ${made.name}` })).toBeVisible();

  await sheet(page).locator("#enrol-group").click();
  await page.getByRole("option").first().click();
  await expect(sheet(page).locator('[data-slot="first-charge"] [data-charge-mode]').first()).toBeVisible();
  // A code nobody has: the sheet says so before anything is saved.
  await sheet(page).locator("#enrol-voucher").fill("KOR-22222");
  await expect(sheet(page).locator("[data-voucher-problem]")).toHaveAttribute("data-voucher-problem", "unknown");
  // The real one, typed in lower case: 20% off the first charge.
  await sheet(page).locator("#enrol-voucher").fill(made.code.toLowerCase());
  await expect(sheet(page).locator('[data-voucher-type="percent"]')).toContainText("Voucher: 20% off");
  await expect(sheet(page).locator("[data-voucher-amount]")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("enrol-voucher.png") });
  await sheet(page).getByRole("button", { name: "Enrol", exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);

  // ── What the database now holds ──
  const after = await withDb(async (db) => {
    const { rows: accounts } = await db.query("select role, student_id from profiles where id = $1", [PEOPLE[project].user]);
    const { rows: vouchers } = await db.query("select v.status, e.student_id from vouchers v left join enrollments e on e.id = v.enrollment_id where v.code = $1", [made.code]);
    const { rows: charges } = await db.query("select amount::int as amount, note from charges where student_id = $1", [studentId]);
    return { account: accounts[0], voucher: vouchers[0], charges };
  });
  // The account linked itself by the phone when the student was saved.
  expect(after.account).toEqual({ role: "student", student_id: studentId });
  expect(after.voucher).toEqual({ status: "redeemed", student_id: studentId });
  expect(after.charges).toHaveLength(1);
  expect(after.charges[0].note).toBe(`Voucher ${made.code}`);

  // The same code a second time is refused in the sheet.
  await page.getByRole("button", { name: "Enrol in a group" }).click();
  await sheet(page).locator("#enrol-group").click();
  await page.getByRole("option").last().click();
  await sheet(page).locator("#enrol-voucher").fill(made.code);
  await expect(sheet(page).locator("[data-voucher-problem]")).toHaveAttribute("data-voucher-problem", "redeemed");
  await expect(sheet(page).getByText("This voucher has already been used.")).toBeVisible();

  // ── Reports → Vouchers counts it ──
  await page.goto("/en/reports?tab=vouchers");
  const percent = page.locator('[data-voucher-type="percent"]');
  await expect(percent).toBeVisible();
  expect(Number(await percent.locator("td").nth(2).innerText())).toBeGreaterThanOrEqual(1);
});

test("the owner sets the vouchers; a manager has no Vouchers tab", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/en/settings?tab=vouchers");
  const form = page.locator('[data-slot="voucher-settings"]');
  await expect(form.locator("#voucher-valid-days")).toHaveValue("14");
  // With every type off there is nothing to draw: the form refuses it.
  for (const key of ["percent", "fixed", "trial"]) {
    const toggle = form.locator(`#voucher-${key}-enabled`);
    if ((await toggle.getAttribute("data-state")) === "checked") await toggle.click();
  }
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("alert")).toContainText("At least one type must be on");
  await form.locator("#voucher-percent-enabled").click();
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  // Back to the defaults for the other specs.
  await withDb((db) => db.query("update voucher_settings set percent_enabled = true, fixed_enabled = true, trial_enabled = true"));

  await page.context().clearCookies();
  await signIn(page, "manager");
  await page.goto("/en/settings?tab=vouchers");
  await expect(page.locator('[data-slot="voucher-settings"]')).toHaveCount(0);
});
