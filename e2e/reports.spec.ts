import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { formatMoney } from "../src/lib/format";
import { signIn } from "./support/auth";

const kpi = async (page: Page, name: string) =>
  Number(await page.locator(`[data-kpi="${name}"]`).getAttribute("data-value"));
const chart = (page: Page, id: string) => page.locator(`[data-chart="${id}"]`);

async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name: option }).first().click();
}

/** Presses a chart's Export CSV and returns the file as rows of cells. */
async function exportCsv(page: Page, id: string) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    chart(page, id).getByRole("button", { name: /^Export CSV/ }).click(),
  ]);
  const text = (await readFile(await download.path(), "utf8")).replace(/^﻿/, "");
  return {
    filename: download.suggestedFilename(),
    rows: text
      .trim()
      .split("\r\n")
      .map((line) => line.split(",")),
  };
}

// Tashkent is UTC+5 all year.
const today = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const monthsAgo = (n: number) =>
  new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - n, 1)).toISOString().slice(0, 7);
const lastMonth = monthsAgo(1);

test("the owner's report matches Finance, changes with the period and exports CSV", async ({ page }, testInfo) => {
  await signIn(page, "owner");
  await expect(page).toHaveURL(/\/en\/reports$/);

  // ── Eight KPIs and six charts ──
  await expect(page.locator('[data-slot="kpi-row"] [data-slot="kpi-card"]')).toHaveCount(8);
  await expect(page.locator("[data-chart]")).toHaveCount(6);
  for (const title of [
    "Collected vs expenses by month",
    "Revenue",
    "Debt by age",
    "Lead funnel",
    "Active students",
    "Attendance rate by group",
  ]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  for (const id of ["money", "revenue", "debt-age", "attendance"]) {
    await expect(chart(page, id).locator(".recharts-bar-rectangle").first()).toBeVisible();
  }
  // One month is a single point, so the dot is what is drawn.
  await expect(chart(page, "students").locator(".recharts-line-dot").first()).toBeVisible();

  // ── Last month: the same numbers as Finance ──
  await choose(page, page.getByRole("combobox", { name: "Period" }), "Last month");
  await expect(page).toHaveURL(/period=last/);
  await expect(page.locator('[data-slot="period-range"]')).toHaveAttribute("data-from", lastMonth);
  const collected = await kpi(page, "collected");
  expect(collected).toBeGreaterThan(0);
  await expect(page.locator('[data-kpi="collected"]')).toHaveText(formatMoney(collected, "en"));
  const debt = await kpi(page, "total-debt");

  const money = await exportCsv(page, "money");
  expect(money.filename).toBe(`collected-vs-expenses_${lastMonth}_${lastMonth}.csv`);
  expect(money.rows[0]).toEqual(["Month", "Collected", "Expenses", "Salaries", "Expenses + salaries"]);
  expect(money.rows).toHaveLength(2);
  expect(money.rows[1][0]).toBe(lastMonth);
  expect(Number(money.rows[1][1])).toBe(collected);
  const expenses = Number(money.rows[1][2]);
  expect(Number(money.rows[1][4])).toBe(await kpi(page, "costs"));
  expect(await kpi(page, "profit")).toBe(collected - Number(money.rows[1][4]));

  // Revenue by group and by subject both add up to Collected.
  const total = (rows: string[][]) => rows.slice(1).reduce((sum, row) => sum + Number(row.at(-1)), 0);
  const byGroup = await exportCsv(page, "revenue");
  expect(byGroup.rows[0]).toEqual(["Group", "Collected"]);
  expect(byGroup.rows.length).toBeGreaterThan(5);
  expect(total(byGroup.rows)).toBe(collected);
  await chart(page, "revenue").getByRole("radio", { name: "By subject" }).click();
  const bySubject = await exportCsv(page, "revenue");
  expect(bySubject.filename).toBe(`revenue-by-subject_${lastMonth}_${lastMonth}.csv`);
  expect(bySubject.rows[0]).toEqual(["Subject", "Collected"]);
  expect(total(bySubject.rows)).toBe(collected);

  // Debt by age adds up to the debt KPI.
  const debtAge = await exportCsv(page, "debt-age");
  expect(debtAge.rows.map((row) => row[0])).toEqual(["Age", "0–30 days", "31–60 days", "Over 60 days"]);

  await page.goto(`/en/finance?month=${lastMonth}`);
  await expect(page.locator('[data-slot="month-strip"]')).toBeVisible();
  expect(await kpi(page, "collected")).toBe(collected);
  expect(await kpi(page, "expenses")).toBe(expenses);
  // Other tests take payments while this one runs, so the debt is compared
  // only when nothing moved between the two readings.
  const financeDebt = await kpi(page, "debt");
  await page.goto("/en/reports?period=last");
  await expect(page.locator('[data-slot="kpi-row"]')).toBeVisible();
  const debtAfter = await kpi(page, "total-debt");
  if (debtAfter === debt) {
    expect(financeDebt).toBe(debt);
    expect(debtAge.rows.slice(1).reduce((sum, row) => sum + Number(row[1]), 0)).toBe(debt);
  }

  // ── Six months: one row per month ──
  await choose(page, page.getByRole("combobox", { name: "Period" }), "Last 6 months");
  await expect(page.locator('[data-slot="period-range"]')).toHaveAttribute("data-from", monthsAgo(5));
  const students = await exportCsv(page, "students");
  expect(students.rows[0]).toEqual(["Month", "Active students", "Joined", "Left"]);
  expect(students.rows.slice(1).map((row) => row[0])).toEqual([5, 4, 3, 2, 1, 0].map(monthsAgo));
  await expect(page.locator('[data-kpi="active-students"]')).toHaveText(students.rows.at(-1)![1]);
  // Two bars for every month that has money in it (the seed starts three months back).
  await expect.poll(() => chart(page, "money").locator(".recharts-bar-rectangle").count()).toBeGreaterThanOrEqual(6);

  const funnel = await exportCsv(page, "funnel");
  expect(funnel.rows[0]).toEqual(["Split", "Stage", "Leads", "Won"]);
  expect(funnel.rows.filter((row) => row[0] === "Stage").map((row) => row[1])).toEqual([
    "New",
    "Contacted",
    "Trial lesson",
    "Won",
    "Lost",
  ]);
  const stageLeads = funnel.rows.filter((row) => row[0] === "Stage").reduce((sum, row) => sum + Number(row[2]), 0);
  await expect(page.locator('[data-kpi="new-leads"]')).toHaveText(String(stageLeads));

  const attendance = await exportCsv(page, "attendance");
  expect(attendance.rows[0]).toEqual(["Group", "Attendance rate", "Present", "Late", "Absent", "Excused"]);
  expect(attendance.rows.length).toBeGreaterThan(5);

  // Nothing is wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("reports.png"), fullPage: true });

  // A chart answers to the pointer: the month and both series with their amounts.
  if (!testInfo.project.name.startsWith("phone")) {
    await chart(page, "money").locator(".recharts-bar-rectangle").first().hover();
    const tooltip = chart(page, "money").locator(".recharts-tooltip-wrapper");
    await expect(tooltip).toContainText("Collected");
    await expect(tooltip).toContainText("Expenses + salaries");
    await expect(tooltip).toContainText(/UZS [\d,]+/);
    await page.screenshot({ path: testInfo.outputPath("reports-tooltip.png") });
  }

  // ── Custom range ──
  await choose(page, page.getByRole("combobox", { name: "Period" }), "Custom range");
  await expect(page).toHaveURL(/period=custom/);
  await choose(page, page.getByRole("combobox", { name: "From" }), new RegExp(`^${monthName(monthsAgo(2))}`));
  await choose(page, page.getByRole("combobox", { name: "To" }), new RegExp(`^${monthName(lastMonth)}`));
  await expect(page).toHaveURL(new RegExp(`from=${monthsAgo(2)}`));
  await expect(page).toHaveURL(new RegExp(`to=${lastMonth}`));
  await expect.poll(async () => (await exportCsv(page, "money")).rows.slice(1).map((row) => row[0])).toEqual([monthsAgo(2), lastMonth]);
  await page.screenshot({ path: testInfo.outputPath("reports-custom.png") });
});

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

test("a manager sees only the lead, attendance and student-count parts", async ({ page }, testInfo) => {
  await signIn(page, "manager");
  await page.goto("/en/reports?period=6");

  await expect(page.locator('[data-slot="kpi-row"] [data-slot="kpi-card"]')).toHaveCount(4);
  for (const name of ["active-students", "new-leads", "lead-conversion", "attendance-rate"]) {
    await expect(page.locator(`[data-kpi="${name}"]`)).toBeVisible();
  }
  for (const name of ["collected", "costs", "profit", "total-debt"]) {
    await expect(page.locator(`[data-kpi="${name}"]`)).toHaveCount(0);
  }
  await expect(page.locator("[data-chart]")).toHaveCount(3);
  for (const id of ["funnel", "students", "attendance"]) await expect(chart(page, id)).toBeVisible();
  for (const id of ["money", "revenue", "debt-age"]) await expect(chart(page, id)).toHaveCount(0);

  // No money anywhere on the page.
  const main = page.locator("main");
  await expect(main).not.toContainText("UZS");
  await expect(main).not.toContainText(/Collected|Profit|Debt|Revenue|Expenses/);
  await expect(page.locator('[data-kpi="attendance-rate"]')).toHaveText(/^\d+(\.\d)?%$/);

  const students = await exportCsv(page, "students");
  expect(students.rows).toHaveLength(7);

  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("reports-manager.png"), fullPage: true });
});
