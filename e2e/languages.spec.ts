import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/auth";
import { PUBLIC_PAGES, appPages } from "./support/pages";

// Every page in Uzbek, Russian and English: nothing untranslated, nothing
// wider than the screen, and no button, tab, pill or heading with its text cut off.

test.describe.configure({ timeout: 420_000 });

const NAMESPACES = "app|common|nav|empty|language|userMenu|auth|leads|students|groups|teachers|finance|reports|settings|notify|bot|enrolments|dev";
const RAW_KEY = new RegExp(`\\b(?:${NAMESPACES})\\.[A-Za-z_][\\w.]*`, "g");

async function problems(page: Page, where: string): Promise<string[]> {
  await page.waitForLoadState("networkidle");
  return page.evaluate(
    ({ where, rawKey }) => {
      const found: string[] = [];
      const main = document.querySelector("main") ?? document.body;

      // A key shown instead of its text.
      const keys = main.innerText.match(new RegExp(rawKey, "g"));
      if (keys) found.push(`${where}: untranslated ${[...new Set(keys)].join(", ")}`);

      // The page scrolls sideways.
      const extra = document.documentElement.scrollWidth - window.innerWidth;
      if (extra > 1) found.push(`${where}: ${extra}px wider than the screen`);

      // Text cut off inside a control that should show all of it.
      const selector = 'button, a[data-slot="button"], [role="tab"], [data-slot="badge"], h1, h2, h3, th, label, [data-slot="kpi-card"] span, [role="radio"]';
      for (const element of main.querySelectorAll<HTMLElement>(selector)) {
        if (!element.checkVisibility() || element.closest("[hidden], .sr-only")) continue;
        const cut = element.scrollWidth - element.clientWidth;
        const text = element.innerText.trim().replace(/\\s+/g, " ");
        // A select shows its choice on one line and cuts a long one by design.
        if (cut > 2 && text && element.getAttribute("role") !== "combobox" && !element.closest('[role="combobox"]')) {
          found.push(`${where}: "${text.slice(0, 40)}" is cut off by ${cut}px (${element.tagName.toLowerCase()})`);
        }
      }
      return found;
    },
    { where, rawKey: RAW_KEY.source },
  );
}

for (const locale of ["uz", "ru", "en"] as const) {
  test(`every page in ${locale}: translated, no overflow, no cut-off text`, async ({ page }) => {
    const found: string[] = [];
    for (const entry of PUBLIC_PAGES) {
      await page.goto(`/${locale}${entry.path}`);
      found.push(...(await problems(page, entry.name)));
    }
    await signIn(page, "owner");
    for (const entry of await appPages()) {
      await page.goto(`/${locale}${entry.path}`);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      found.push(...(await problems(page, entry.name)));
    }
    expect([...new Set(found)]).toEqual([]);
  });
}
