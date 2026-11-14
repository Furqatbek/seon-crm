import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/auth";

// Everything here is done with the keyboard alone: no click reaches the page.
// (The leads board's keyboard dragging is covered in leads.spec.ts.)

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');
const inSheet = (page: Page) =>
  page.evaluate(() => document.activeElement?.closest('[data-slot="sheet-content"]') !== null);

async function seriousIn(page: Page) {
  const results = await new AxeBuilder({ page })
    .include('[data-slot="sheet-content"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id} — ${violation.nodes[0]?.target.join(" ")}`);
}

/** Focuses a control and presses a key on it, as a keyboard user would after tabbing to it. */
async function pressOn(page: Page, name: string | RegExp, key: string, role: "button" | "tab" = "button") {
  const control = page.getByRole(role, { name }).first();
  await control.focus();
  await expect(control).toBeFocused();
  await page.keyboard.press(key);
  return control;
}

const SHEETS: Array<{ path: string; open: string | RegExp; title: string | RegExp }> = [
  { path: "/en/leads", open: "New lead", title: "New lead" },
  { path: "/en/students", open: "New student", title: "New student" },
  { path: "/en/groups", open: "New group", title: "New group" },
  { path: "/en/teachers", open: "New teacher", title: "New teacher" },
  { path: "/en/finance", open: "Take payment", title: "Take payment" },
  { path: "/en/finance?tab=expenses", open: "Add expense", title: "New expense" },
  { path: "/en/settings?tab=users", open: "Invite user", title: "Invite a user" },
];

test("sheets open, trap focus, pass axe and close from the keyboard", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, "owner");

  for (const entry of SHEETS) {
    await page.goto(entry.path);
    const trigger = await pressOn(page, entry.open, "Enter");
    await expect(sheet(page).getByRole("heading", { name: entry.title })).toBeVisible();
    // Focus moves into the sheet and stays there however far Tab goes, both ways.
    await expect.poll(() => inSheet(page)).toBe(true);
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");
      expect(await inSheet(page), `${entry.title}: Tab left the sheet`).toBe(true);
    }
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await inSheet(page), `${entry.title}: Shift+Tab left the sheet`).toBe(true);
    }
    expect(await seriousIn(page), `${entry.title}: axe`).toEqual([]);

    // Escape closes it and focus goes back to the button that opened it.
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});

test("a form in a sheet is filled in and sent with the keyboard", async ({ page }, testInfo) => {
  const name = `Keyboard Lead ${testInfo.project.name} ${Date.now()}`;
  await signIn(page, "manager");
  await page.goto("/en/leads");
  await pressOn(page, "New lead", "Enter");
  await expect(sheet(page)).toBeVisible();

  // Enter on an empty form shows the errors and moves focus to the first field in error.
  await page.keyboard.press("Enter");
  await expect(sheet(page).locator('[role="alert"]').first()).toBeVisible();

  await sheet(page).getByLabel("Name").focus();
  await page.keyboard.type(name);
  await sheet(page).getByLabel("Phone").focus();
  await page.keyboard.type("90 111 22 33".replace("111 22 33", String(Date.now()).slice(-7)));
  // The source is a list: Enter opens it, the arrows move, Enter chooses.
  await sheet(page).getByRole("combobox", { name: "Source" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown", { delay: 60 });
  await page.keyboard.press("Enter");
  await expect(sheet(page).getByRole("combobox", { name: "Source" })).not.toHaveText("");
  await sheet(page).getByLabel("Name").focus();
  await page.keyboard.press("Enter");
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByText(name).first()).toBeVisible();
});

test("the attendance sheet is marked and saved with the keyboard", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/en/groups/00000003-0000-4000-8000-000000000001?tab=attendance");

  // A lesson that is already held: its marks are saved back exactly as they were.
  const lesson = page.getByRole("button", { name: /^Open the lesson on/ }).first();
  await lesson.focus();
  await page.keyboard.press("Enter");
  await expect(sheet(page)).toBeVisible();
  await expect.poll(() => inSheet(page)).toBe(true);
  expect(await seriousIn(page)).toEqual([]);

  // Each student is one radio group: Tab moves between students, arrows choose the mark.
  const first = sheet(page).getByRole("radiogroup").first();
  const student = await first.getAttribute("aria-label");
  expect(student).toBeTruthy();
  const checked = first.getByRole("radio", { checked: true });
  const before = (await checked.innerText()).trim();
  await checked.focus();
  await expect(checked).toBeFocused();

  // A key is held for a moment, as a finger holds it.
  await page.keyboard.press("ArrowRight", { delay: 60 });
  const after = (await first.getByRole("radio", { checked: true }).innerText()).trim();
  expect(after).not.toBe(before);
  await expect(first.getByRole("radio", { checked: true })).toBeFocused();
  await page.keyboard.press("ArrowLeft", { delay: 60 });
  await expect(first.getByRole("radio", { checked: true })).toHaveText(before);

  // One Tab leaves the group for the next student, not the next mark.
  await page.keyboard.press("Tab");
  const second = sheet(page).getByRole("radiogroup").nth(1);
  await expect(second.getByRole("radio", { checked: true })).toBeFocused();

  // Save is reached by Tab and pressed with Enter.
  const save = sheet(page).getByRole("button", { name: /^Save/ });
  for (let i = 0; i < 80 && !(await save.evaluate((node) => node === document.activeElement)); i += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(save).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet(page)).toBeHidden();
});
