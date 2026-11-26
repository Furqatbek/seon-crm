import { expect, test, type Locator, type Page } from "@playwright/test";

import { signIn } from "./support/auth";
import { seedStudentId, withDb } from "./support/db";

// Points for staff — docs/SPEC.md → "Points and rewards add-on": Settings →
// Points, the student's Points tab and "Referred by" on a lead. The teacher's
// side is in teacher.spec.ts; the rules themselves in supabase/tests/points.test.ts.

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');
const total = async (page: Page, key: string) =>
  Number(await page.locator(`[data-points-total="${key}"]`).getAttribute("data-value"));

async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name: option }).first().click();
}

test("the owner sets point values and reasons, adjusts a student's points, and a lead names who referred it", async ({ page }, testInfo) => {
  const phone = testInfo.project.name.startsWith("phone");
  const marker = `E2E points ${testInfo.project.name} ${Date.now()}`;
  // One seeded student per screen size, so the two runs do not meet.
  const student = { id: seedStudentId(phone ? 61 : 62), name: phone ? "Akmal Ismoilov" : "Nodira Sodiqova" };
  // A value nothing else relies on. The form saves every value at once, so only
  // one screen size changes it: two saves at the same time would undo each other.
  const value = { label: "Perfect month", column: "perfect_month", before: 10, after: "12" };

  try {
    await signIn(page, "owner");

    // ── Settings → Points: values and limits ──
    await page.goto("/en/settings?tab=points");
    await expect(page.getByRole("tab", { name: "Coins" })).toHaveAttribute("data-state", "active");
    await expect(page.getByRole("switch", { name: /Coins programme/ })).toBeChecked();
    await expect(page.getByLabel("Present at a lesson")).toHaveValue("2");
    await expect(page.getByLabel("Most coins per student per day")).toHaveValue("10");
    await page.getByLabel(value.label, { exact: true }).fill("5000");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Enter a whole number from 0 to 1000.")).toBeVisible();
    if (!phone) {
      await page.getByLabel(value.label, { exact: true }).fill(value.after);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();
      const stored = await withDb((db) => db.query(`select ${value.column}::text as v from points_settings`));
      expect(stored.rows).toEqual([{ v: value.after }]);
    }

    // ── Reasons for teachers: seven seeded; add one that is switched off, then remove it ──
    await expect(page.locator('[data-preset-list="award"] [data-preset-row]').filter({ hasText: "Homework done" })).toContainText("+2");
    await expect(page.locator('[data-preset-list="deduction"] [data-preset-row]').filter({ hasText: "Phone in class" })).toContainText("−2");
    await page.getByRole("button", { name: "Add deduction" }).click();
    await expect(sheet(page).getByRole("heading", { name: "New reason" })).toBeVisible();
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page).getByText("Write the name in all three languages.").first()).toBeVisible();
    await sheet(page).getByLabel("Coins").fill("4");
    await sheet(page).getByLabel("Name in Uzbek").fill(`${marker} uz`);
    await sheet(page).getByLabel("Name in Russian").fill(`${marker} ru`);
    await sheet(page).getByLabel("Name in English").fill(marker);
    // Off, so no teacher is offered it while this test runs.
    await sheet(page).getByRole("switch", { name: "Offered to teachers" }).click();
    await page.screenshot({ path: testInfo.outputPath("new-reason.png") });
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Reason saved")).toBeVisible();
    const added = page.locator('[data-preset-list="deduction"] [data-preset-row]').filter({ hasText: marker });
    await expect(added).toContainText("−4");
    await expect(added).toContainText("Off");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("settings-points.png"), fullPage: true });
    await added.getByRole("button", { name: `Edit ${marker}` }).click();
    await sheet(page).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Reason removed")).toBeVisible();
    await expect(added).toHaveCount(0);

    // The same tab in Uzbek and Russian.
    await page.goto("/uz/settings?tab=points");
    await expect(page.getByRole("heading", { name: "Oʻqituvchilar uchun sabablar" })).toBeVisible();
    await page.goto("/ru/settings?tab=points");
    await expect(page.getByRole("heading", { name: "Причины для учителей" })).toBeVisible();

    // ── The student's Points tab: the owner adjusts with a reason, never below zero ──
    await page.goto(`/en/students/${student.id}?tab=points`);
    await expect(page.getByRole("tab", { name: "Coins" })).toHaveAttribute("data-state", "active");
    const before = { balance: await total(page, "balance"), month: await total(page, "earnedThisMonth") };
    await page.getByRole("button", { name: "Adjust coins" }).click();
    await expect(sheet(page).getByRole("heading", { name: `Adjust coins of ${student.name}` })).toBeVisible();
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page).getByText("Write the reason.")).toBeVisible();
    await sheet(page).getByRole("radio", { name: "Take away" }).click();
    await sheet(page).getByLabel("How many").fill(String(before.balance + 1));
    await sheet(page).getByLabel("Reason").fill(marker);
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page).getByText("The student does not have that many coins.")).toBeVisible();
    await sheet(page).getByRole("radio", { name: "Add", exact: true }).click();
    await sheet(page).getByLabel("How many").fill("7");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Coins adjusted")).toBeVisible();
    await expect.poll(() => total(page, "balance")).toBe(before.balance + 7);
    expect(await total(page, "earnedThisMonth")).toBe(before.month + 7);
    const row = page.locator('[data-points-row="owner_adjustment"]').filter({ hasText: marker });
    await expect(row).toHaveAttribute("data-delta", "7");
    await expect(row).toContainText("Owner adjustment");
    await expect(row).toContainText("+7 coins");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("student-points.png"), fullPage: true });

    // ── A lead names the student who referred it ──
    await page.goto("/en/leads");
    await page.getByRole("button", { name: "New lead" }).first().click();
    await sheet(page).getByLabel("Name").fill(marker);
    await sheet(page).getByLabel("Phone").fill(`93 ${String(Date.now()).slice(-7)}`);
    await choose(page, sheet(page).locator("#lead-source"), "Referral");
    await sheet(page).getByLabel("Referred by").fill(student.name.split(" ")[1]);
    await sheet(page).locator('[data-slot="student-results"]').getByRole("button", { name: new RegExp(student.name) }).click();
    await page.screenshot({ path: testInfo.outputPath("lead-referred-by.png") });
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page)).toHaveCount(0);
    const lead = await withDb((db) => db.query("select referred_by_student_id from leads where full_name = $1", [marker]));
    expect(lead.rows).toEqual([{ referred_by_student_id: student.id }]);

    // ── A manager sees the points but cannot adjust them, and has no Points settings ──
    await page.context().clearCookies();
    await signIn(page, "manager");
    await page.goto(`/en/students/${student.id}?tab=points`);
    await expect(page.locator('[data-points-row="owner_adjustment"]').filter({ hasText: marker })).toBeVisible();
    await expect(page.getByRole("button", { name: "Adjust coins" })).toHaveCount(0);
    await page.goto("/en/settings?tab=points");
    await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Present at a lesson")).toHaveCount(0);
  } finally {
    await withDb(async (db) => {
      if (!phone) await db.query(`update points_settings set ${value.column} = $1`, [value.before]);
      await db.query("delete from points_ledger where reason = $1", [marker]);
      await db.query("delete from point_presets where label_en = $1", [marker]);
      await db.query("delete from lead_activities where lead_id in (select id from leads where full_name = $1)", [marker]);
      await db.query("delete from leads where full_name = $1", [marker]);
    });
  }
});
