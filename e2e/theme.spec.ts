import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/auth";
import { PUBLIC_PAGES, appPages } from "./support/pages";

// Dark theme — docs/SPEC.md → "Design system → Dark theme".

test.describe.configure({ timeout: 300_000 });

const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const LIGHT = "rgb(255, 255, 255)";
const DARK = "rgb(19, 19, 22)";

async function openAccountMenu(page: Page) {
  // On a phone the account menu sits in the slide-over navigation.
  const menuButton = page.getByRole("button", { name: "Open menu" });
  if (await menuButton.isVisible()) await menuButton.click();
  await page.locator('[data-slot="user-menu"]:visible').click();
}

test("the theme follows the device until the person chooses, and the choice is kept", async ({ page }, testInfo) => {
  // Sign-in follows the device.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/en/sign-in");
  expect(await background(page)).toBe(DARK);
  await page.screenshot({ path: testInfo.outputPath("sign-in-dark.png") });
  await page.emulateMedia({ colorScheme: "light" });
  expect(await background(page)).toBe(LIGHT);

  // The switch on the sign-in page.
  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await background(page)).toBe(DARK);

  // Kept after signing in and after a reload, with no flash of the light theme:
  // the attribute is already there when the page first paints.
  await signIn(page, "owner");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/en/students");
  await expect(page.locator("h1").first()).toBeVisible();
  expect(await background(page)).toBe(DARK);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: testInfo.outputPath("students-dark.png") });
  await page.goto("/en/finance");
  await expect(page.locator("[data-payment-row]").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("finance-dark.png") });
  if (!testInfo.project.name.startsWith("phone")) {
    await page.goto("/en/reports");
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("reports-dark.png"), fullPage: true });
  }

  // The account menu: Light, then back to the device's.
  await openAccountMenu(page);
  await expect(page.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("data-state", "checked");
  await page.screenshot({ path: testInfo.outputPath("menu-dark.png") });
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await background(page)).toBe(LIGHT);
  // A light choice wins over a dark device.
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await background(page)).toBe(LIGHT);

  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.locator('[data-slot="user-menu"]:visible').click();
  await page.getByRole("menuitemradio", { name: "Same as device" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  expect(await background(page)).toBe(DARK);
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBeNull();
});

test("no serious accessibility issues on any page in the dark theme", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("phone"), "colours are the same at every width");
  await page.emulateMedia({ colorScheme: "dark" });
  const found: string[] = [];
  const check = async (name: string) => {
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const violation of results.violations) {
      if (violation.impact !== "serious" && violation.impact !== "critical") continue;
      const node = violation.nodes[0];
      found.push(`${name}: ${violation.id} — ${node.target.join(" ")} — ${node.failureSummary?.split("\n")[1]?.trim() ?? ""}`);
    }
  };
  for (const entry of PUBLIC_PAGES) {
    await page.goto(`/en${entry.path}`);
    await check(entry.name);
  }
  await signIn(page, "owner");
  for (const entry of await appPages()) {
    await page.goto(`/en${entry.path}`);
    await expect(page.locator("h1").first()).toBeVisible();
    expect(await background(page)).toBe(DARK);
    await check(entry.name);
  }
  expect(found).toEqual([]);
});

test("a printed receipt is light whatever the theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page, "owner");
  await page.goto("/en/finance");
  const receipt = await page.locator("[data-payment-row]").first().getAttribute("data-payment-row");
  expect(receipt).toBeTruthy();
  await page.emulateMedia({ colorScheme: "dark", media: "print" });
  expect(await background(page)).toBe(LIGHT);
});
