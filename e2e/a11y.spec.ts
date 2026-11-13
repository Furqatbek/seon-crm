import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/auth";
import { PUBLIC_PAGES, appPages } from "./support/pages";

// Every page is checked with axe-core against WCAG 2.1 A and AA. Serious and
// critical findings fail the test; the rest are listed in the report.

test.describe.configure({ timeout: 300_000 });

async function serious(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      page: name,
      rule: violation.id,
      help: violation.help,
      nodes: violation.nodes.slice(0, 3).map((node) => `${node.target.join(" ")} — ${node.failureSummary?.split("\n")[1]?.trim() ?? ""}`),
    }));
}

test("no serious accessibility issues on any page", async ({ page }) => {
  const found: Awaited<ReturnType<typeof serious>> = [];
  for (const entry of PUBLIC_PAGES) {
    await page.goto(`/en${entry.path}`);
    found.push(...(await serious(page, entry.name)));
  }
  await signIn(page, "owner");
  for (const entry of await appPages()) {
    await page.goto(`/en${entry.path}`);
    await expect(page.locator("h1").first()).toBeVisible();
    found.push(...(await serious(page, entry.name)));
  }
  // One line per rule and page keeps a failure readable.
  expect(found.map((entry) => `${entry.page}: ${entry.rule} — ${entry.nodes[0]}`)).toEqual([]);
});

test("a record that does not exist shows a clear page, inside the app", async ({ page }) => {
  await signIn(page, "manager");
  for (const path of ["/en/students/11111111-1111-4111-8111-111111111111", "/en/groups/not-an-id", "/en/teachers/11111111-1111-4111-8111-111111111111"]) {
    await page.goto(path);
    const problem = page.locator('[data-slot="page-problem"]');
    await expect(problem.getByRole("heading", { name: "Nothing here" })).toBeVisible();
    await expect(problem.getByRole("link", { name: "Go to the start page" })).toBeVisible();
    // The sidebar is still there to go somewhere else.
    await expect(page.getByRole("link", { name: "Students" }).first()).toBeAttached();
    expect(await serious(page, path)).toEqual([]);
  }
  await page.locator('[data-slot="page-problem"]').getByRole("link", { name: "Go to the start page" }).click();
  await expect(page).toHaveURL(/\/en\/groups$/);
});
