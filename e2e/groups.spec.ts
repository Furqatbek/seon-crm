import { expect, test, type Locator, type Page } from "@playwright/test";

import { proposeFirstCharge } from "../src/lib/domain/proration";
import { formatMoney, formatMonth } from "../src/lib/format";
import { signIn } from "./support/auth";

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');
const dialog = (page: Page) => page.locator('[data-slot="dialog-content"]');

async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name: option }).first().click();
}

// Tashkent is UTC+5 all year.
const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
const today = now.toISOString().slice(0, 10);
const month = today.slice(0, 7);
const weekday = (day: string) => ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Every day of this month that falls on one of the weekdays. */
function lessonDays(days: number[]): string[] {
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return Array.from({ length: last }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`).filter(
    (day) => days.includes(weekday(day)),
  );
}

test("a Mon/Wed/Fri 18:00 group: enrol mid-month with the first charge, mark today's attendance", async ({ page }, testInfo) => {
  const name = `E2E MWF ${testInfo.project.name} ${Date.now()}`;
  // Monday, Wednesday, Friday; plus today when today is another day, so there is a lesson to mark.
  const days = [...new Set([1, 3, 5, weekday(today)])].sort();
  const dates = lessonDays(days);
  const expected = proposeFirstCharge({ monthlyFee: 600_000, discount: null, joinedOn: today, lessonDates: dates });

  // A manager lands on Groups → Today.
  await signIn(page, "manager");
  await expect(page).toHaveURL(/\/en\/groups$/);
  await expect(page.getByRole("tab", { name: "Today" })).toHaveAttribute("data-state", "active");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("today.png") });

  // ── New group ──
  await page.getByRole("button", { name: "New group" }).click();
  await sheet(page).getByRole("button", { name: "Save" }).click();
  await expect(sheet(page).getByText("Choose at least one day.")).toBeVisible();
  await sheet(page).getByLabel("Name").fill(name);
  await sheet(page).getByLabel("Subject").fill("Ingliz tili");
  await sheet(page).getByLabel("Level").fill("B1");
  await choose(page, sheet(page).locator("#group-teacher"), "Dilshod Rahimov");
  await sheet(page).getByLabel("Monthly fee").fill("600 000");
  for (const day of days) await sheet(page).locator(`[data-weekday="${day}"]`).click();
  await sheet(page).getByLabel("Start time").fill("18:00");
  await sheet(page).getByLabel("Room").fill("9-xona");
  await sheet(page).getByLabel("Capacity").fill("12");
  await sheet(page).getByLabel("Start date").fill(`${month}-01`);
  await page.screenshot({ path: testInfo.outputPath("new-group.png") });
  await sheet(page).getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/en\/groups\/[0-9a-f-]{36}$/);
  const groupUrl = page.url();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  await expect(page.locator("[data-group-status]")).toHaveAttribute("data-group-status", "active");
  await expect(page.locator('[data-slot="group-facts"]')).toContainText(
    `${days.map((day) => DAY_NAMES[day]).join(", ")} · 18:00`,
  );
  await expect(page.locator('[data-slot="group-facts"]')).toContainText("UZS 600,000");

  // Creating the group generated this month's lessons from its days and time.
  await page.getByRole("tab", { name: "Lessons" }).click();
  await expect(page.locator("[data-lesson-row]")).toHaveCount(dates.length);
  await expect(page.locator(`[data-lesson-row="${today}"]`)).toContainText("18:00");
  await expect(page.locator(`[data-lesson-row="${today}"]`)).toHaveAttribute("data-lesson-status", "scheduled");

  // ── Enrol a student with the proposed first charge ──
  await page.getByRole("tab", { name: "Students" }).click();
  await expect(page.getByText("No students in this group yet.")).toBeVisible();
  await page.getByRole("button", { name: "Add student" }).click();
  await sheet(page).locator("#enrol-student").fill("Aziz Sulton");
  await sheet(page).locator('[data-slot="student-results"] button').filter({ hasText: "Aziz Sultonov" }).click();

  const amount = formatMoney(expected.amount, "en");
  if (expected.isProrated && expected.lessonsCounted > 0) {
    // Mid-month: Prorated is selected and says how many lessons are left.
    const prorated = sheet(page).locator('[data-charge-mode="prorated"]');
    await expect(prorated).toHaveAttribute("data-state", "checked");
    await expect(prorated).toContainText(`${expected.lessonsCounted} of ${expected.lessonsInMonth} lessons`);
    await expect(prorated).toContainText(amount);
    await expect(sheet(page).locator('[data-charge-mode="full"]')).toContainText("UZS 600,000");
    await expect(sheet(page).locator('[data-charge-mode="custom"]')).toBeVisible();
  } else {
    // On or before the month's first lesson: the full month.
    await expect(sheet(page).locator('[data-charge-mode="full"]')).toHaveAttribute("data-state", "checked");
  }
  // A custom amount needs a note.
  await sheet(page).locator('[data-charge-mode="custom"]').click();
  await sheet(page).getByLabel("Amount, soʻm").fill("100 000");
  await sheet(page).getByRole("button", { name: "Enrol", exact: true }).click();
  await expect(sheet(page).getByText("Say why this amount is charged.")).toBeVisible();
  await sheet(page).locator(`[data-charge-mode="${expected.isProrated ? "prorated" : "full"}"]`).click();
  await page.screenshot({ path: testInfo.outputPath("enrol.png") });
  await sheet(page).getByRole("button", { name: "Enrol", exact: true }).click();

  const studentRow = page.locator("[data-group-student]").filter({ hasText: "Aziz Sultonov" });
  await expect(studentRow).toBeVisible();
  await expect(page.locator('[data-slot="group-facts"]')).toContainText("1 / 12");

  // ── Today: mark attendance ──
  await page.goto("/en/groups");
  const lesson = page.locator("[data-today-lesson]").filter({ hasText: name });
  await expect(lesson).toContainText("18:00");
  await expect(lesson).toContainText("Dilshod Rahimov · 9-xona · 1 student");
  await lesson.getByRole("button", { name: "Mark attendance" }).click();
  // Everyone starts as Present; tap to switch.
  const marks = sheet(page).getByRole("radiogroup", { name: "Aziz Sultonov" });
  await expect(marks.getByRole("radio", { name: "Present" })).toBeChecked();
  await marks.getByRole("radio", { name: "Late" }).click();
  await page.screenshot({ path: testInfo.outputPath("lesson-sheet.png") });
  await sheet(page).getByRole("button", { name: "Save" }).click();
  await expect(sheet(page)).toHaveCount(0);
  // The button turns into a green tick, and the lesson is held.
  await expect(lesson).toHaveAttribute("data-lesson-status", "held");
  await expect(lesson.getByRole("button", { name: "Marked" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("today-marked.png") });

  // ── The group page agrees ──
  await page.goto(`${groupUrl}?tab=lessons`);
  await expect(page.locator(`[data-lesson-row="${today}"]`)).toHaveAttribute("data-lesson-status", "held");
  await expect(page.locator(`[data-lesson-row="${today}"]`)).toContainText("Held");
  await page.getByRole("tab", { name: "Attendance" }).click();
  await expect(page.locator('[data-grid-student] [data-mark="late"]')).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("attendance-grid.png") });
  // A date opens that lesson, with the saved mark.
  await page.locator(`[data-grid-lesson="${today}"]`).click();
  await expect(sheet(page).getByRole("radiogroup", { name: "Aziz Sultonov" }).getByRole("radio", { name: "Late" })).toBeChecked();
  await expect(sheet(page).locator("[data-lesson-status]")).toHaveAttribute("data-lesson-status", "held");
  await sheet(page).getByRole("button", { name: "Cancel" }).click();

  // ── The charge is on the student's ledger ──
  await page.getByRole("tab", { name: "Students" }).click();
  await expect(studentRow).toContainText("100%");
  await studentRow.click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Aziz Sultonov");
  await page.getByRole("tab", { name: "Ledger" }).click();
  const charge = page.locator('[data-ledger="charge"]').filter({ hasText: name });
  await expect(charge).toContainText(`Fee for ${formatMonth(month, "en")}`);
  await expect(charge).toContainText(amount);
  if (expected.isProrated) {
    await expect(charge).toContainText(`${expected.lessonsCounted} of ${expected.lessonsInMonth} lessons`);
  }
  await page.screenshot({ path: testInfo.outputPath("ledger.png") });

  // ── Leave the group again, and archive it as the owner ──
  await page.goto(groupUrl);
  await page.getByRole("button", { name: "Actions for Aziz Sultonov" }).click();
  await page.getByRole("menuitem", { name: "Leave group" }).click();
  await sheet(page).getByRole("button", { name: "Leave group" }).click();
  await expect(page.getByText("No students in this group yet.")).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, "owner");
  await page.goto(groupUrl);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await dialog(page).getByRole("button", { name: "Archive" }).click();
  await expect(page).toHaveURL(/\/en\/groups\?tab=all$/);
  await expect(page.locator("[data-group-row]").first()).toBeVisible();
  await expect(page.locator("[data-group-row]").filter({ hasText: name })).toHaveCount(0);
});

test("a lesson is cancelled with a reason, restored, and given a substitute", async ({ page }, testInfo) => {
  await signIn(page, "manager");
  await page.goto("/en/groups?tab=all");
  await expect(page.locator("[data-group-row]")).not.toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("all-groups.png") });
  await page.locator("[data-group-row]").filter({ hasText: "Python dasturlash" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Python dasturlash");
  await expect(page.locator("[data-group-student]").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("group-students.png") });

  await page.getByRole("tab", { name: "Lessons" }).click();
  // Next month's lessons are all still scheduled. Each screen size takes its own.
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.locator(`[data-lesson-row^="${nextMonth}"]`).first()).toBeVisible();
  const row = page.locator(`[data-lesson-row^="${nextMonth}"][data-lesson-status="scheduled"]`).nth(
    testInfo.project.name.startsWith("phone") ? 3 : 1,
  );
  const date = await row.getAttribute("data-lesson-row");
  const lesson = page.locator(`[data-lesson-row="${date}"]`);
  const actions = lesson.getByRole("button", { name: /^Actions for the lesson/ });

  // Cancel: the reason is required.
  await actions.click();
  await page.getByRole("menuitem", { name: "Cancel lesson" }).click();
  await dialog(page).getByRole("button", { name: "Cancel lesson" }).click();
  await expect(dialog(page).getByText("Write the reason.")).toBeVisible();
  await dialog(page).getByLabel("Reason").fill("Bayram kuni");
  await dialog(page).getByRole("button", { name: "Cancel lesson" }).click();
  await expect(lesson).toHaveAttribute("data-lesson-status", "cancelled");
  await expect(lesson).toContainText("Bayram kuni");

  // Restore.
  await actions.click();
  await page.getByRole("menuitem", { name: "Restore lesson" }).click();
  await expect(lesson).toHaveAttribute("data-lesson-status", "scheduled");

  // A substitute for this one lesson, then back to the group's teacher.
  await actions.click();
  await page.getByRole("menuitem", { name: "Set substitute" }).click();
  await choose(page, dialog(page).locator("#substitute-teacher"), "Nodira Saidova");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(lesson).toContainText("Nodira Saidova");
  await expect(lesson).toContainText("Substitute");
  await page.screenshot({ path: testInfo.outputPath("lessons.png") });
  await actions.click();
  await page.getByRole("menuitem", { name: "Set substitute" }).click();
  await choose(page, dialog(page).locator("#substitute-teacher"), "Sardor Mirzayev");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await expect(lesson).not.toContainText("Substitute");

  // A lesson that has not happened yet cannot be marked.
  await lesson.click();
  await expect(sheet(page).getByText("This lesson has not happened yet.")).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "Save" })).toHaveCount(0);
});
