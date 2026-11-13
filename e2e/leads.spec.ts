import { expect, test, type Locator, type Page } from "@playwright/test";

import { signIn } from "./support/auth";

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');
const dialog = (page: Page) => page.locator('[data-slot="dialog-content"]');
const column = (page: Page, status: string) => page.locator(`[data-lead-column="${status}"]`);
const card = (scope: Page | Locator, name: string) =>
  scope.locator("[data-lead-card]").filter({ hasText: name });

async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name: option }).first().click();
}

test("a lead moves New → Contacted → Trial → Lost and every step is in the timeline", async ({ page }, testInfo) => {
  const phone = testInfo.project.name.startsWith("phone");
  const name = `E2E ${testInfo.project.name} ${Date.now()}`;
  const digits = String(Date.now()).slice(-7);

  await signIn(page, "manager");
  await page.goto("/en/leads");
  await expect(page.getByRole("heading", { level: 1, name: "Leads" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Follow up today" })).toBeVisible();
  // The board is interactive once its cards are there.
  await expect(page.locator("[data-lead-card]").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("board.png") });

  // ── Create ──
  await page.getByRole("button", { name: "New lead" }).first().click();
  await sheet(page).getByLabel("Name").fill(name);
  await sheet(page).getByLabel("Phone").fill(`90 ${digits}`);
  await choose(page, sheet(page).locator("#lead-source"), "Instagram");
  await sheet(page).getByLabel("Subject").fill("IELTS");
  await page.screenshot({ path: testInfo.outputPath("new-lead.png") });
  await sheet(page).getByRole("button", { name: "Save" }).click();
  await expect(card(column(page, "new"), name)).toBeVisible();

  // ── New → Contacted ──
  if (phone) {
    // On a phone the next column is off screen: use the stage menu in the lead sheet.
    await card(page, name).click();
    await choose(page, sheet(page).getByRole("combobox", { name: "Stage" }), "Contacted");
  } else {
    // Drag with the keyboard: Space picks up, → moves one column, Space drops.
    await card(page, name).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await expect(card(column(page, "contacted"), name)).toBeVisible();
    // Enter opens the lead.
    await card(page, name).focus();
    await page.keyboard.press("Enter");
  }
  await expect(sheet(page).getByText("New → Contacted")).toBeVisible();
  await expect(sheet(page).locator("[data-lead-status]")).toHaveAttribute("data-lead-status", "contacted");

  // Log a call and add a note on the way.
  await sheet(page).getByRole("button", { name: "Log call" }).click();
  await sheet(page).locator("#lead-composer").fill("Asked about the evening group");
  await sheet(page).getByRole("button", { name: "Save call" }).click();
  await expect(sheet(page).getByText("Asked about the evening group")).toBeVisible();

  // ── Contacted → Trial: needs a group and a date ──
  await sheet(page).getByRole("button", { name: "Book trial" }).click();
  await dialog(page).getByRole("button", { name: "Book trial" }).click();
  await expect(dialog(page).getByText("Choose a group.")).toBeVisible();
  await choose(page, dialog(page).locator("#trial-group"), /English B1/);
  await dialog(page).getByRole("button", { name: "Book trial" }).click();
  await expect(sheet(page).getByText("Contacted → Trial lesson")).toBeVisible();
  await expect(sheet(page).getByText(/English B1 ·/)).toBeVisible();

  // ── Trial → Lost: needs a reason ──
  await sheet(page).getByRole("button", { name: "Mark lost" }).click();
  await dialog(page).getByRole("button", { name: "Mark lost" }).click();
  await expect(dialog(page).getByText("Choose a reason.")).toBeVisible();
  await choose(page, dialog(page).locator("#lost-reason"), "Price");
  await dialog(page).getByRole("button", { name: "Mark lost" }).click();
  await expect(sheet(page).getByText("Trial lesson → Lost")).toBeVisible();
  await expect(sheet(page).getByText("Reason: Price")).toBeVisible();
  await expect(sheet(page).locator("[data-lead-status]")).toHaveAttribute("data-lead-status", "lost");

  // The whole history, newest first.
  await expect(sheet(page).locator("[data-activity]")).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath("lead-sheet.png") });

  // ── A manager is not offered Archive ──
  await sheet(page).getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Archive" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await sheet(page).getByRole("button", { name: "Close" }).click();
  await expect(card(column(page, "lost"), name)).toBeVisible();

  // ── List view finds it, with its status ──
  await page.goto(`/en/leads?view=list&q=${encodeURIComponent(name)}`);
  const row = page.locator("[data-lead-row]").filter({ hasText: name });
  await expect(row).toContainText("Lost");
  await page.screenshot({ path: testInfo.outputPath("list.png") });

  // ── The owner is offered Archive, and archiving removes the lead ──
  await page.context().clearCookies();
  await signIn(page, "owner");
  await page.goto(`/en/leads?view=list&q=${encodeURIComponent(name)}`);
  await page.locator("[data-lead-row]").filter({ hasText: name }).click();
  await sheet(page).getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await dialog(page).getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("No leads match these filters.")).toBeVisible();
});

test("a phone number that is already used shows a warning with a link", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/en/leads");
  await page.getByRole("button", { name: "New lead" }).first().click();

  // Student 1 from the seed: +998 91 108 62 43.
  await sheet(page).getByLabel("Phone").fill("911086243");
  const warning = sheet(page).locator("#lead-phone-matches");
  await expect(warning).toContainText("A student already has this number:");
  await expect(warning.getByRole("link")).toHaveAttribute("href", /\/en\/students\//);

  // A lead's number links to that lead.
  const existing = await page.locator("[data-lead-card]").first().getAttribute("data-lead-card");
  await page.goto(`/en/leads?lead=${existing}`);
  const number = await sheet(page).locator('a[href^="tel:"]').innerText();
  await sheet(page).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "New lead" }).first().click();
  await sheet(page).getByLabel("Phone").fill(number);
  await expect(sheet(page).locator("#lead-phone-matches")).toContainText("A lead already has this number:");
  await expect(sheet(page).locator("#lead-phone-matches").getByRole("link")).toHaveAttribute(
    "href",
    new RegExp(`/en/leads\\?lead=${existing}`),
  );
});
