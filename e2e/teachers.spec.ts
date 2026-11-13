import { existsSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { LOGINS, PASSWORD, signIn } from "./support/auth";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');
const dialog = (page: Page) => page.locator('[data-slot="dialog-content"]');

async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name: option }).first().click();
}

/** "YYYY-MM-DD" for the 1st of the month `offset` months from now (Tashkent). */
function firstOfMonth(offset: number): string {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
}

test("the owner creates a teacher and sets two rates with different effective dates", async ({ page }, testInfo) => {
  const name = `E2E Teacher ${testInfo.project.name} ${Date.now()}`;
  const started = firstOfMonth(0);
  const upcoming = firstOfMonth(2);

  await signIn(page, "owner");
  await page.goto("/en/teachers");
  await expect(page.locator("[data-teacher-row]").first()).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Pay type" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("teachers.png") });

  // ── Create ──
  await page.getByRole("button", { name: "New teacher" }).click();
  await sheet(page).getByRole("button", { name: "Save" }).click();
  await expect(sheet(page).getByText("Enter the name.")).toBeVisible();
  await sheet(page).getByLabel("Name").fill(name);
  await sheet(page).getByLabel("Phone").fill(`93 ${String(Date.now()).slice(-7)}`);
  await sheet(page).getByLabel("Subjects").fill("Ingliz tili, IELTS");
  await sheet(page).getByRole("button", { name: "Save" }).click();

  // Saving opens the new teacher's page.
  await expect(page).toHaveURL(/\/en\/teachers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  // (The list page stays mounted but hidden, so look inside the visible panel.)
  await expect(page.getByRole("tabpanel").getByText("Ingliz tili, IELTS")).toBeVisible();

  // ── Pay tab ──
  await page.getByRole("tab", { name: "Pay" }).click();
  await expect(page).toHaveURL(/tab=pay/);
  await expect(page.locator('[data-slot="kpi-card"]')).toContainText("No rate yet");
  await expect(page.getByText("No payouts yet.")).toBeVisible();

  // Rate 1: fixed monthly, from the 1st of this month. An amount of 0 is refused.
  await page.getByRole("button", { name: "Set new rate" }).click();
  await sheet(page).getByLabel("Amount, soʻm").fill("0");
  await sheet(page).getByLabel("Effective from").fill(started);
  await sheet(page).getByRole("button", { name: "Save" }).click();
  await expect(sheet(page).getByText("Enter a whole amount above 0.")).toBeVisible();
  await sheet(page).getByLabel("Amount, soʻm").fill("5 000 000");
  await sheet(page).getByRole("button", { name: "Save" }).click();
  const first = page.locator(`[data-rate="${started}"]`);
  await expect(first).toContainText("Fixed monthly salary");
  await expect(first).toContainText("UZS 5,000,000 a month");
  await expect(first).toHaveAttribute("data-rate-status", "current");

  // Rate 2: percent, from a later date. 150 % is refused, and so is the same date again.
  await page.getByRole("button", { name: "Set new rate" }).click();
  await choose(page, sheet(page).locator("#rate-type"), "% of group revenue");
  await sheet(page).getByLabel("Percent").fill("150");
  await sheet(page).getByLabel("Effective from").fill(started);
  await sheet(page).getByRole("button", { name: "Save" }).click();
  await expect(sheet(page).getByText("Enter a percent from 1 to 100.")).toBeVisible();
  await sheet(page).getByLabel("Percent").fill("40");
  await sheet(page).getByRole("button", { name: "Save" }).click();
  await expect(sheet(page).getByText("A rate already starts on this date.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("set-rate.png") });
  await sheet(page).getByLabel("Effective from").fill(upcoming);
  await sheet(page).getByRole("button", { name: "Save" }).click();

  const second = page.locator(`[data-rate="${upcoming}"]`);
  await expect(second).toContainText("40% of collected fees");
  await expect(second).toHaveAttribute("data-rate-status", "upcoming");
  await expect(page.locator("[data-rate]")).toHaveCount(2);
  // Newest first; the current rate is still the first one.
  await expect(page.locator("[data-rate]").first()).toHaveAttribute("data-rate", upcoming);
  await expect(page.locator('[data-slot="kpi-card"]')).toContainText("UZS 5,000,000 a month");
  await page.screenshot({ path: testInfo.outputPath("pay-tab.png"), fullPage: true });

  // The list now shows the current pay type for this teacher.
  await page.goto(`/en/teachers?q=${encodeURIComponent(name)}`);
  await expect(page.locator("[data-teacher-row]").filter({ hasText: name })).toContainText("Fixed monthly salary");

  // ── Clean up: archive the teacher ──
  await page.locator("[data-teacher-row]").filter({ hasText: name }).click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await dialog(page).getByRole("button", { name: "Archive" }).click();
  await expect(page).toHaveURL(/\/en\/teachers$/);
  await page.goto(`/en/teachers?q=${encodeURIComponent(name)}`);
  await expect(page.getByText("No teachers match this search.")).toBeVisible();
});

test("a manager sees no pay column, no Pay tab and gets no pay rates from the API", async ({ page }, testInfo) => {
  await signIn(page, "manager");
  await page.goto("/en/teachers");
  // The six seeded teachers (another test may have added one).
  await expect(page.locator("[data-teacher-row]").filter({ hasText: "Rustam Qodirov" })).toBeVisible();
  expect(await page.locator("[data-teacher-row]").count()).toBeGreaterThanOrEqual(6);
  await expect(page.getByRole("columnheader", { name: "Lessons this month" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Pay type" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New teacher" })).toHaveCount(0);
  await expect(page.getByText(/salary|% of group revenue|Per lesson/)).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("teachers-manager.png") });

  // Teacher page: contacts, groups and lessons, nothing about pay.
  await page.locator("[data-teacher-row]").filter({ hasText: "Rustam Qodirov" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rustam Qodirov" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lessons this month" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("teacher-manager.png"), fullPage: true });

  // Asking for the tab by URL changes nothing.
  await page.goto(`${page.url()}?tab=pay`);
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
  await expect(page.getByText("Rate history")).toHaveCount(0);
  await expect(page.getByText(/so.m per lesson|UZS [\d,]+ per lesson/)).toHaveCount(0);

  // A direct query with the manager's own session returns nothing.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const login = await supabase.auth.signInWithPassword({ email: LOGINS.manager, password: PASSWORD });
  expect(login.error).toBeNull();
  const rates = await supabase.from("teacher_pay_rates").select("*");
  expect(rates.error).toBeNull();
  expect(rates.data).toEqual([]);
  const insert = await supabase.from("teacher_pay_rates").insert({
    teacher_id: "00000002-0000-4000-8000-000000000003",
    pay_type: "per_lesson",
    amount: 1,
    effective_from: "2030-01-01",
  });
  expect(insert.error?.code).toBe("42501");
  // The teachers themselves are readable.
  const teachers = await supabase.from("teachers").select("id");
  expect(teachers.data?.length).toBeGreaterThanOrEqual(6);
});
