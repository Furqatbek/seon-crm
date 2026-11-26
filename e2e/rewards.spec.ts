import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/auth";
import { seedStudentId, withDb } from "./support/db";

// Rewards — docs/SPEC.md → "Points and rewards add-on": "Defaults to confirm →
// Redeeming", "Screens → Staff: Points". The rules (locks, stock, refunds) are
// proven in supabase/tests/rewards.test.ts.

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');
const dialog = (page: Page) => page.locator('[data-slot="dialog-content"]');
const total = async (page: Page, key: string) =>
  Number(await page.locator(`[data-points-total="${key}"]`).getAttribute("data-value"));
const TSHIRT = "Brend futbolka";
const NOTEBOOKS = "Daftarlar toʻplami";
// A 1 × 1 PNG.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("a manager redeems a T-shirt at the desk and marks it given; a rejected request returns the points", async ({ page }, testInfo) => {
  const phone = testInfo.project.name.startsWith("phone");
  const marker = `E2E rewards ${testInfo.project.name} ${Date.now()}`;
  // One seeded student per screen size, brought to exactly 150 points to spend.
  const id = seedStudentId(phone ? 65 : 66);
  const name = await withDb(async (db) => {
    await db.query(
      `insert into points_ledger (student_id, delta, source, reason)
       select $1, 150 - b.balance, 'owner_adjustment', $2
       from (select coalesce(sum(delta), 0)::int as balance from points_ledger where student_id = $1) b
       where b.balance <> 150`,
      [id, marker],
    );
    return (await db.query("select full_name from students where id = $1", [id])).rows[0].full_name as string;
  });
  const requests = () => page.locator(`[data-request-row][data-student="${id}"]`);

  try {
    await signIn(page, "manager");

    // ── The desk request, from the student's Points tab ──
    await page.goto(`/en/students/${id}?tab=points`);
    const before = { balance: await total(page, "balance"), earned: await total(page, "earnedAllTime") };
    expect(before.balance).toBe(150);
    await page.getByRole("button", { name: "Redeem reward" }).click();
    await expect(sheet(page).getByRole("heading", { name: `Reward for ${name}` })).toBeVisible();
    await expect(sheet(page).locator("[data-reward]")).toHaveCount(3);
    await page.screenshot({ path: testInfo.outputPath("redeem.png") });
    await sheet(page).locator(`[data-reward="${TSHIRT}"]`).getByRole("button", { name: /^Redeem/ }).click();
    await expect(page.getByText(`${TSHIRT}: request made, points held`)).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
    // The points are held at once; what was earned (and so the rank) is untouched.
    await expect.poll(() => total(page, "balance")).toBe(before.balance - 100);
    expect(await total(page, "earnedAllTime")).toBe(before.earned);
    const hold = page.locator('[data-points-row="reward_hold"]').first();
    await expect(hold).toHaveAttribute("data-delta", "-100");
    await expect(hold).toContainText("Reward requested");
    await expect(hold).toContainText(TSHIRT);

    // ── The sidebar counts it; Requests lists it; Give is final ──
    if (phone) await page.getByRole("button", { name: "Open menu" }).click();
    const nav = page.getByRole("navigation", { name: "Main navigation" }).locator("visible=true");
    await expect(nav.locator("[data-nav-count]")).toBeVisible();
    await nav.getByRole("link", { name: /^Points/ }).click();
    await page.getByRole("tab", { name: /^Requests/ }).click();
    await expect(page).toHaveURL(/tab=requests/);
    await expect(requests()).toHaveCount(1);
    await expect(requests()).toHaveAttribute("data-request-row", "requested");
    await expect(requests()).toContainText(TSHIRT);
    await expect(requests()).toContainText("Desk");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("requests.png") });
    await requests().getByRole("button", { name: /^Give/ }).click();
    await expect(page.getByText(`${name}: reward given`)).toBeVisible();
    await expect(requests()).toHaveAttribute("data-request-row", "given");
    await expect(requests().getByRole("button")).toHaveCount(0);
    const given = await withDb((db) =>
      db.query(
        `select r.status, r.cost, r.via, p.full_name as by, r.handled_at is not null as handled
         from redemptions r join profiles p on p.id = r.handled_by where r.student_id = $1`,
        [id],
      ),
    );
    expect(given.rows).toEqual([{ status: "given", cost: 100, via: "desk", by: expect.any(String), handled: true }]);

    // ── A second request is rejected: a reason is required, and the points come back ──
    await page.goto(`/en/students/${id}?tab=points`);
    await page.getByRole("button", { name: "Redeem reward" }).click();
    // 50 points are left: the T-shirt is out of reach, the notebooks are not.
    await expect(sheet(page).locator(`[data-reward="${TSHIRT}"]`).getByRole("button")).toHaveCount(0);
    await sheet(page).locator(`[data-reward="${NOTEBOOKS}"]`).getByRole("button", { name: /^Redeem/ }).click();
    await expect.poll(() => total(page, "balance")).toBe(before.balance - 140);
    await page.goto("/en/points?tab=requests");
    const open = requests().and(page.locator('[data-request-row="requested"]'));
    await open.getByRole("button", { name: /^Reject/ }).click();
    await expect(dialog(page)).toContainText("40 points return to the student");
    await dialog(page).getByRole("button", { name: "Reject" }).click();
    await expect(dialog(page).getByText("Write the reason.")).toBeVisible();
    await dialog(page).getByLabel("Reason").fill("Wrong colour");
    await dialog(page).getByRole("button", { name: "Reject" }).click();
    await expect(page.getByText(`${name}: request rejected, points returned`)).toBeVisible();
    await expect(requests().filter({ hasText: "Wrong colour" })).toHaveAttribute("data-request-row", "rejected");
    await page.goto(`/en/students/${id}?tab=points`);
    expect(await total(page, "balance")).toBe(before.balance - 100);
    await expect(page.locator('[data-points-row="reward_return"]').first()).toHaveAttribute("data-delta", "40");

    // ── A manager looks at the catalogue but does not edit it ──
    await page.goto("/en/points?tab=rewards");
    await expect(page.locator(`[data-reward="${TSHIRT}"]`)).toContainText("100 points");
    await expect(page.locator('[data-reward="Bepul dars"]')).toContainText("Unlimited");
    await expect(page.getByRole("button", { name: "Add reward" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Edit/ })).toHaveCount(0);

    // ── The owner adds a reward with a photo, then archives it ──
    await page.context().clearCookies();
    await signIn(page, "owner");
    await page.goto("/en/points?tab=rewards");
    await page.getByRole("button", { name: "Add reward" }).click();
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page).getByText("Enter a name.")).toBeVisible();
    await sheet(page).getByLabel("Name").fill(marker);
    await sheet(page).getByLabel("Cost, points").fill("25");
    await sheet(page).getByLabel("In stock").fill("2");
    await sheet(page).getByLabel("Photo").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PIXEL });
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Reward saved")).toBeVisible();
    const card = page.locator(`[data-reward="${marker}"]`);
    await expect(card).toContainText("25 points");
    await expect(card).toContainText("2 left");
    // The photo comes from the private bucket through a signed link, and loads.
    await expect(card.locator("img")).toHaveAttribute("src", /reward-photos\/.+token=/);
    await expect.poll(() => card.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("rewards.png"), fullPage: true });
    await card.getByRole("button", { name: /^Edit/ }).click();
    await expect(sheet(page).getByLabel("Name")).toHaveValue(marker);
    await sheet(page).getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Reward archived")).toBeVisible();
    await expect(card).toHaveCount(0);

    // The same tabs in Uzbek and Russian.
    await page.goto("/uz/points?tab=rewards");
    await expect(page.getByRole("tab", { name: "Sovgʻalar" })).toHaveAttribute("data-state", "active");
    await page.goto("/ru/points?tab=requests");
    await expect(page.getByRole("tab", { name: /^Запросы/ })).toHaveAttribute("data-state", "active");
  } finally {
    await withDb(async (db) => {
      // The T-shirt that was given goes back on the shelf, and the student's test rows go.
      await db.query(
        `update rewards set stock = stock + 1 where stock is not null
           and id in (select reward_id from redemptions where student_id = $1 and status = 'given')`,
        [id],
      );
      await db.query("delete from points_ledger where student_id = $1 and (reason = $2 or redemption_id is not null)", [id, marker]);
      await db.query("delete from redemptions where student_id = $1", [id]);
      await db.query("delete from rewards where name = $1", [marker]);
    });
  }
});
