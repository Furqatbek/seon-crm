import { createHmac } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { PASSWORD } from "./support/auth";
import { seedStudentId, withDb } from "./support/db";

// The reception scanner — docs/STUDENT_APP_SPEC.md → "Rules → QR check-in" and
// "CRM changes" (/checkin). A Kiosk account opens /checkin and nothing else,
// and logs an arrival from a code made the way the student's phone makes it.

const KIOSK_EMAIL = "kiosk-e2e@demo.educrm.uz";
const KIOSK_ID = "0000000e-0000-4000-8000-000000000001";

/** One student per screen size, so the two runs do not share a day's visits. */
const STUDENTS = {
  "desktop-1440": { id: seedStudentId(21), user: "0000000e-0000-4000-8000-000000000011" },
  "phone-390": { id: seedStudentId(22), user: "0000000e-0000-4000-8000-000000000012" },
} as const;

type Fixture = { studentId: string; name: string; secret: string };

/** A kiosk login, and an app account linked to the student by phone: linking makes the QR secret. */
async function fixture(project: keyof typeof STUDENTS): Promise<Fixture> {
  const { id, user } = STUDENTS[project];
  return withDb(async (db) => {
    await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                               created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, extensions.crypt($3, extensions.gen_salt('bf')), now(),
               '{"provider":"email","providers":["email"],"role":"kiosk"}', '{"full_name":"Reception tablet","language":"en"}', now(), now(), '', '', '', '')
       on conflict (id) do nothing`,
      [KIOSK_ID, KIOSK_EMAIL, PASSWORD],
    );
    await db.query(
      `insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
       select gen_random_uuid(), $1, $1::text, 'email', jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true), now(), now(), now()
       where not exists (select 1 from auth.identities where user_id = $1)`,
      [KIOSK_ID, KIOSK_EMAIL],
    );
    await db.query("update profiles set language = 'en' where id = $1", [KIOSK_ID]);

    const { rows: students } = await db.query("select full_name, phone from students where id = $1", [id]);
    const student = students[0] as { full_name: string; phone: string };
    await db.query("delete from visits where student_id = $1", [id]);
    await db.query("delete from auth.users where id = $1", [user]);
    await db.query(
      `insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(), '', '{"provider":"phone","providers":["phone"]}',
               jsonb_build_object('full_name', $3::text), now(), now())`,
      [user, student.phone.replace("+", ""), student.full_name],
    );
    const { rows: secrets } = await db.query(
      "select v.decrypted_secret as secret from students s join vault.decrypted_secrets v on v.id = s.qr_secret_id where s.id = $1",
      [id],
    );
    return { studentId: id, name: student.full_name, secret: (secrets[0] as { secret: string }).secret };
  });
}

async function cleanup(project: keyof typeof STUDENTS) {
  const { id, user } = STUDENTS[project];
  await withDb(async (db) => {
    await db.query("delete from messages where student_id = $1 and type in ('visit_arrived', 'visit_left')", [id]);
    await db.query("delete from visits where student_id = $1", [id]);
    await db.query("delete from auth.users where id = $1", [user]);
  });
}

/** The code the student's phone shows right now: v1.<student>.<30-second step>.<HMAC-SHA256, hex>. */
function codeNow(fixture: Fixture, at = Date.now()): string {
  const payload = `v1.${fixture.studentId}.${Math.floor(at / 30_000)}`;
  return `${payload}.${createHmac("sha256", fixture.secret).update(payload).digest("hex")}`;
}

async function signInAsKiosk(page: Page) {
  await page.goto("/en/sign-in");
  await page.locator("#email").fill(KIOSK_EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("button[type=submit]").click();
  await expect(page).toHaveURL(/\/en\/checkin$/);
}

/** A handheld scanner: it types the code like a keyboard and presses Enter. */
async function scanWithHandheld(page: Page, code: string) {
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.type(code, { delay: 0 });
  await page.keyboard.press("Enter");
}

const result = (page: Page) => page.locator('[data-slot="checkin-result"]');

test.describe("Reception check-in", () => {
  test.describe.configure({ mode: "serial" });
  let data: Fixture;

  test.beforeAll(async ({}, info) => {
    data = await fixture(info.project.name as keyof typeof STUDENTS);
  });
  test.afterAll(async ({}, info) => {
    await cleanup(info.project.name as keyof typeof STUDENTS);
  });

  test("a Kiosk account opens only /checkin", async ({ page }) => {
    await signInAsKiosk(page);
    await expect(page.getByRole("heading", { name: "Check-in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Log out" })).toBeVisible();
    // No sidebar, and every page of the CRM leads back here.
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    for (const path of ["/en", "/en/students", `/en/students/${data.studentId}`, "/en/finance", "/en/reports", "/en/settings", "/en/leads", "/en/my-groups"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/en\/checkin$/);
    }
  });

  test("a code from the student's phone logs an arrival, shown for three seconds", async ({ page }) => {
    await signInAsKiosk(page);
    await scanWithHandheld(page, codeNow(data));

    await expect(result(page)).toHaveAttribute("data-result", "arrived");
    await expect(result(page).locator('[data-cell="name"]')).toHaveText(data.name);
    await expect(result(page).locator('[data-cell="kind"]')).toHaveText("Arrived");
    await expect(result(page).getByText("Today's lessons")).toBeVisible();
    // The card goes away by itself.
    await expect(result(page)).toHaveCount(0, { timeout: 6000 });

    const visits = await withDb(async (db) => (await db.query("select kind, method, scanned_by from visits where student_id = $1", [data.studentId])).rows);
    expect(visits).toEqual([{ kind: "arrived", method: "qr", scanned_by: KIOSK_ID }]);

    // The same code again a moment later is the same visit, not a leaving.
    await scanWithHandheld(page, codeNow(data));
    await expect(result(page)).toHaveAttribute("data-result", "arrived");
    await expect(result(page).getByText("Just scanned")).toBeVisible();
    expect(await withDb(async (db) => (await db.query("select count(*)::int as n from visits where student_id = $1", [data.studentId])).rows[0].n)).toBe(1);
  });

  test("an old code, a tampered code and a stranger's QR are refused in plain words", async ({ page }) => {
    await signInAsKiosk(page);
    await scanWithHandheld(page, codeNow(data, Date.now() - 5 * 60_000));
    await expect(result(page)).toHaveText(/out of date/);
    const real = codeNow(data);
    await scanWithHandheld(page, real.slice(0, -1) + (real.endsWith("0") ? "1" : "0"));
    await expect(result(page)).toHaveText(/not the centre's QR code/);
    await scanWithHandheld(page, "https://example.com/menu");
    await expect(result(page)).toHaveText(/not the centre's QR code/);
  });

  test("a student without their phone is found by name and checked in by hand", async ({ page }) => {
    await withDb((db) => db.query("update visits set at = at - interval '10 minutes' where student_id = $1", [data.studentId]));
    await signInAsKiosk(page);
    await page.locator("#checkin-search").fill(data.name.slice(0, 5));
    const match = page.locator('[data-slot="checkin-matches"] li', { hasText: data.name });
    await match.getByRole("button", { name: /Check in/ }).click();
    // They arrived earlier: this is the leaving.
    await expect(result(page)).toHaveAttribute("data-result", "left");
    const last = await withDb(async (db) => (await db.query("select kind, method from visits where student_id = $1 order by at desc limit 1", [data.studentId])).rows[0]);
    expect(last).toEqual({ kind: "left", method: "manual" });
  });
});
