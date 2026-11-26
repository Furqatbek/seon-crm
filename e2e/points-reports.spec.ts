import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/auth";
import { withDb } from "./support/db";

// Reports → Points — docs/SPEC.md → "Points and rewards add-on → Screens →
// Reports → Points tab". That the figures equal the ledger is proven in
// supabase/tests/points-reports.test.ts; here the screen is checked against
// itself and against the database for the signed-in person.

const kpi = async (page: Page, name: string) =>
  Number(await page.locator(`[data-points-kpi="${name}"]`).getAttribute("data-value"));
const chart = (page: Page, id: string) => page.locator(`[data-chart="${id}"]`);
const CHARTS = ["points-by-source", "points-by-teacher", "points-top-students", "points-rewards", "points-by-group"];

async function exportCsv(page: Page, id: string) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    chart(page, id).getByRole("button", { name: /^Export CSV/ }).click(),
  ]);
  const text = (await readFile(await download.path(), "utf8")).replace(/^﻿/, "");
  return { filename: download.suggestedFilename(), rows: text.trim().split("\r\n").map((line) => line.split(",")) };
}

const month = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 7);
const IN_MONTH = `l.created_at >= (date_trunc('month', public.tashkent_today())::timestamp at time zone 'Asia/Tashkent')`;
const EARNED = `l.source not in ('reward_hold', 'reward_return', 'teacher_deduction') and not (l.source = 'owner_adjustment' and l.delta < 0)`;

test("the owner's points report: six KPIs, five charts, CSV, and the period changes it", async ({ page }, testInfo) => {
  await signIn(page, "owner");
  await page.goto("/en/reports");
  await page.getByRole("tab", { name: "Points" }).click();
  await expect(page).toHaveURL(/tab=points/);
  await expect(page.locator("[data-points-kpi]")).toHaveCount(6);
  for (const id of CHARTS) await expect(chart(page, id)).toBeVisible();
  await expect(chart(page, "points-by-source").getByRole("heading")).toHaveText("Points earned by source");
  await expect(chart(page, "points-by-group").getByRole("heading")).toHaveText("Average points per student by group");

  // Other tests give points while this one runs: the screen and the database are read until they agree.
  await expect(async () => {
    await page.reload();
    const ledger = await withDb((db) => db.query(`select coalesce(sum(l.delta), 0)::int as n from points_ledger l where ${IN_MONTH} and ${EARNED}`));
    expect(await kpi(page, "earned")).toBe(ledger.rows[0].n);
  }).toPass({ timeout: 30_000 });

  // The source chart's CSV adds up to Points earned, and names this month.
  await expect(async () => {
    await page.reload();
    const earned = await kpi(page, "earned");
    const csv = await exportCsv(page, "points-by-source");
    expect(csv.filename).toBe(`points-by-source_${month}_${month}.csv`);
    expect(csv.rows[0]).toEqual(["Month", "Attendance", "Teacher award", "Perfect month", "Fee paid on time", "Friend enrolled", "Owner adjustment"]);
    expect(csv.rows[1][0]).toBe(month);
    expect(csv.rows.slice(1).flatMap((row) => row.slice(1).map(Number)).reduce((sum, value) => sum + value, 0)).toBe(earned);
  }).toPass({ timeout: 30_000 });

  const top = await exportCsv(page, "points-top-students");
  expect(top.rows[0]).toEqual(["Student", "Points"]);
  expect(top.rows.length).toBeGreaterThan(1);
  expect(top.rows.length).toBeLessThanOrEqual(11);
  const groups = await exportCsv(page, "points-by-group");
  expect(groups.rows[0]).toEqual(["Group", "Students", "Points", "Average"]);

  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("points-report.png"), fullPage: true });

  // A longer period shows at least as much, and is kept in the address.
  const thisMonth = await kpi(page, "earned");
  await page.getByRole("combobox", { name: "Period" }).click();
  await page.getByRole("option", { name: "Last 3 months" }).click();
  await expect(page).toHaveURL(/period=3/);
  await expect.poll(() => kpi(page, "earned")).toBeGreaterThanOrEqual(thisMonth);

  // The overview is still the first tab, and both tabs exist in Uzbek and Russian.
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.locator('[data-slot="kpi-row"]')).toBeVisible();
  await page.goto("/uz/reports?tab=points");
  await expect(page.getByRole("tab", { name: "Ballar" })).toHaveAttribute("data-state", "active");
  await expect(chart(page, "points-top-students").getByRole("heading")).toHaveText("Eng yaxshi 10 oʻquvchi");
  await page.goto("/ru/reports?tab=points");
  await expect(chart(page, "points-by-teacher").getByRole("heading")).toHaveText("Поощрения и снятия по учителям");
});

test("a teacher gets the same report for their own groups only", async ({ page }, testInfo) => {
  const phone = testInfo.project.name.startsWith("phone");
  await signIn(page, "teacher");
  if (phone) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Main navigation" }).locator("visible=true").getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(/\/en\/my-groups\/reports$/);
  await expect(page.getByRole("heading", { level: 1, name: "Points in my groups" })).toBeVisible();
  // Spending and balances belong to no group: a teacher has neither those three figures nor the rewards chart.
  await expect(page.locator("[data-points-kpi]")).toHaveCount(3);
  for (const key of ["spent", "unspent", "rewardsGiven"]) await expect(page.locator(`[data-points-kpi="${key}"]`)).toHaveCount(0);
  await expect(chart(page, "points-rewards")).toHaveCount(0);
  for (const id of CHARTS.filter((name) => name !== "points-rewards")) await expect(chart(page, id)).toBeVisible();

  // Only the points that count for the groups this teacher teaches.
  await expect(async () => {
    await page.reload();
    const own = await withDb((db) =>
      db.query(
        `select coalesce(sum(l.delta), 0)::int as n from points_ledger l join groups g on g.id = l.group_id
         where ${IN_MONTH} and ${EARNED} and g.teacher_id = '00000002-0000-4000-8000-000000000002' and g.status in ('active', 'forming') and g.archived_at is null`,
      ),
    );
    expect(await kpi(page, "earned")).toBe(own.rows[0].n);
  }).toPass({ timeout: 30_000 });

  // Their two groups and nobody else's; names only, no money and no phones.
  const groups = await exportCsv(page, "points-by-group");
  expect(groups.rows.slice(1).map((row) => row[0]).sort()).toEqual(["English Kids", "IELTS 6.5"]);
  await expect(page.locator("main")).not.toContainText("+998");
  await expect(page.locator("main")).not.toContainText("UZS");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("teacher-report.png"), fullPage: true });

  // The staff report is not theirs to open.
  await page.goto("/en/reports?tab=points");
  await expect(page).toHaveURL(/\/en\/my-groups$/);
});
