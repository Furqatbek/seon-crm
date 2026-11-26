import { expect, test, type Page } from "@playwright/test";

import { tvName } from "../src/lib/domain/leaderboard";
import { signIn } from "./support/auth";
import { seedStudentId, withDb } from "./support/db";

// Leaderboards and the TV screen — docs/SPEC.md → "Points and rewards add-on":
// "Leaderboard rules", "Screens → Staff: Points", "Screens → TV screen".
// The ranking rules themselves are in supabase/tests/leaderboard.test.ts.

const SHOTS = "/tmp/claude-0/-home-user-seon-crm/8e2658c1-db42-5c63-9a77-a99d1f3e7aa2/scratchpad/shots";
const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');

test("a wrong TV token returns 404 and shows nothing", async ({ page }) => {
  for (const path of [`/en/tv/${"0".repeat(32)}`, "/en/tv/not-a-token", "/uz/tv"]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(404);
    expect(await response.text()).not.toContain("data-tv-row");
  }
});

test("staff see the leaderboards; a hidden student is missing from the TV but visible on the staff board", async ({ page, browser }, testInfo) => {
  const phone = testInfo.project.name.startsWith("phone");
  const marker = `E2E board ${testInfo.project.name} ${Date.now()}`;
  // One seeded student per screen size, put far ahead of everyone this month.
  const id = seedStudentId(phone ? 63 : 64);
  const given = phone ? 9001 : 9002;
  const { name, group, token, totals } = await withDb(async (db) => {
    await db.query("update students set leaderboard_hidden = false where id = $1", [id]);
    const { rows } = await db.query(
      `select s.full_name, g.id as group_id, g.name as group_name
       from students s join enrollments e on e.student_id = s.id and e.status = 'active'
       join groups g on g.id = e.group_id and g.status = 'active' where s.id = $1 order by g.name limit 1`,
      [id],
    );
    await db.query(
      "insert into points_ledger (student_id, delta, source, group_id, reason) values ($1, $2, 'owner_adjustment', $3, $4)",
      [id, given, rows[0].group_id, marker],
    );
    const settings = await db.query("select tv_token from points_settings");
    // What the student has earned, with the points just given: the boards must show exactly this.
    const month = "created_at >= (date_trunc('month', public.tashkent_today())::timestamp at time zone 'Asia/Tashkent')";
    const sums = await db.query(
      `select coalesce(sum(delta) filter (where ${month}), 0)::int as centre,
              coalesce(sum(delta) filter (where ${month} and group_id = $2), 0)::int as "group",
              coalesce(sum(delta) filter (where group_id = $2), 0)::int as "groupAll"
       from points_ledger where student_id = $1 and source not in ('reward_hold', 'reward_return')`,
      [id, rows[0].group_id],
    );
    return {
      totals: sums.rows[0] as { centre: number; group: number; groupAll: number },
      name: rows[0].full_name as string,
      group: { id: rows[0].group_id as string, name: rows[0].group_name as string },
      token: settings.rows[0].tv_token as string,
    };
  });
  const onTv = (tv: Page) => tv.locator(`[data-tv-row="${tvName(name)}"]`).filter({ hasText: String(totals.centre) });

  try {
    await signIn(page, "manager");

    // ── /points: the centre this month, a group, all-time, a past month ──
    if (phone) await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Main navigation" }).locator("visible=true").getByRole("link", { name: "Points" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Points" })).toBeVisible();
    // Since Phase 16 the board is the first of three tabs.
    await expect(page.getByRole("tab", { name: "Leaderboard" })).toHaveAttribute("data-state", "active");
    const row = page.locator(`[data-board-row="${id}"]`);
    await expect(row).toHaveAttribute("data-points", String(totals.centre));
    // Both screen sizes run at once, each with a student of its own at the top.
    expect(Number(await row.getAttribute("data-rank"))).toBeLessThanOrEqual(2);
    await expect(row).not.toContainText("Hidden from TV");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("points.png") });

    await page.getByRole("combobox", { name: "Centre or group" }).click();
    await page.getByRole("option", { name: group.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`group=${group.id}`));
    await expect(row).toHaveAttribute("data-points", String(totals.group));
    await page.getByRole("radio", { name: "All-time" }).click();
    await expect(page).toHaveURL(/period=all/);
    await expect(page.locator('[data-slot="month-nav"]')).toHaveCount(0);
    await expect(row).toHaveAttribute("data-points", String(totals.groupAll));
    // Last month: the points given today are not there.
    await page.getByRole("radio", { name: "This month" }).click();
    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
    await expect(page.locator('[data-slot="month-nav"] [data-month]')).not.toHaveAttribute("data-month", new Date().toISOString().slice(0, 7));
    expect(Number(await row.getAttribute("data-points"))).toBeLessThan(given);

    // ── The group page has its own Leaderboard tab ──
    await page.goto(`/en/groups/${group.id}?tab=leaderboard`);
    await expect(page.getByRole("tab", { name: "Leaderboard" })).toHaveAttribute("data-state", "active");
    await expect(page.locator(`[data-board-row="${id}"]`)).toHaveAttribute("data-rank", "1");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("group-leaderboard.png") });

    // The same board in Uzbek and Russian.
    await page.goto("/uz/points");
    await expect(page.getByRole("tab", { name: "Reyting" })).toHaveAttribute("data-state", "active");
    await page.goto("/ru/points");
    await expect(page.getByRole("tab", { name: "Рейтинг" })).toHaveAttribute("data-state", "active");

    // The TV is designed for one large screen: the rest runs at the desktop size only.
    if (phone) {
      await page.goto(`/en/students/${id}?tab=points`);
      await page.getByRole("switch", { name: /Hide from public leaderboards/ }).click();
      await expect(page.getByText("Hidden from the TV")).toBeVisible();
      await page.goto("/en/points");
      await expect(page.locator(`[data-board-row="${id}"]`)).toContainText("Hidden from TV");
      return;
    }

    // ── The TV: no login, 1920 × 1080, in the language chosen in Settings (Uzbek) ──
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await context.newPage();
    try {
      await tv.goto(`/en/tv/${token}`);
      await expect(tv).toHaveURL(new RegExp(`/uz/tv/${token}$`));
      await expect(tv.locator("[data-tv-title]")).toHaveText("Shu oyning eng yaxshi 10 taligi");
      await expect(onTv(tv)).toBeVisible();
      await expect(tv.locator("[data-tv-row]")).not.toHaveCount(0);
      expect(await tv.locator("[data-tv-row]").count()).toBeLessThanOrEqual(10);
      // First name and last initial only, and nothing but the board.
      await expect(tv.locator("body")).not.toContainText(name);
      await expect(tv.locator("body")).not.toContainText("+998");
      await expect(tv.getByRole("link")).toHaveCount(0);
      await expect(tv.locator("[data-tv-updated]")).toHaveText(/^Yangilandi: \d\d:\d\d$/);
      // Names are at least 32 px, on a white page whatever the device theme.
      const size = await tv.locator("[data-tv-row] span").nth(1).evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
      expect(size).toBeGreaterThanOrEqual(32);
      expect(await tv.locator("main").evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(255, 255, 255)");
      await tv.waitForLoadState("networkidle");
      await tv.screenshot({ path: `${SHOTS}/p15-tv-centre-1920.png` });
      await tv.screenshot({ path: testInfo.outputPath("tv-centre.png") });

      // After 15 seconds the first group's top 5 takes over.
      await expect(tv.locator('[data-slot="tv"]')).toHaveAttribute("data-slide", "1", { timeout: 20_000 });
      expect(await tv.locator("[data-tv-row]").count()).toBeLessThanOrEqual(5);
      await tv.screenshot({ path: `${SHOTS}/p15-tv-group-1920.png` });

      // ── Hide the student: still on the staff board, gone from the TV ──
      await page.goto(`/en/students/${id}?tab=points`);
      await page.getByRole("switch", { name: /Hide from public leaderboards/ }).click();
      await expect(page.getByText("Hidden from the TV")).toBeVisible();
      await page.goto("/en/points");
      await expect(page.locator(`[data-board-row="${id}"]`)).toContainText("Hidden from TV");
      await expect(page.locator(`[data-board-row="${id}"]`)).toHaveAttribute("data-points", String(totals.centre));
      await tv.reload();
      await expect(tv.locator("[data-tv-row]").first()).toBeVisible();
      await expect(onTv(tv)).toHaveCount(0);
    } finally {
      await context.close();
    }

    // ── Settings → Points: the owner copies the link and makes a new one; the old link dies ──
    await page.context().clearCookies();
    await signIn(page, "owner");
    await page.goto("/en/settings?tab=points");
    await expect(page.locator("#tv-link")).toHaveValue(new RegExp(`/uz/tv/${token}$`));
    await expect(page.getByRole("combobox", { name: "TV language" })).toContainText("Oʻzbekcha");
    await page.getByRole("button", { name: "New link" }).click();
    await expect(page.locator('[data-slot="dialog-content"]')).toContainText("The old link stops working at once.");
    await page.locator('[data-slot="dialog-content"]').getByRole("button", { name: "New link" }).click();
    await expect(page.getByText("New link made")).toBeVisible();
    await expect(page.locator("#tv-link")).not.toHaveValue(new RegExp(token));
    const fresh = (await page.locator("#tv-link").inputValue()).split("/").pop()!;
    expect((await page.request.get(`/uz/tv/${token}`)).status()).toBe(404);
    expect((await page.request.get(`/uz/tv/${fresh}`)).status()).toBe(200);
    await expect(sheet(page)).toHaveCount(0);
  } finally {
    await withDb(async (db) => {
      await db.query("delete from points_ledger where reason = $1", [marker]);
      await db.query("update students set leaderboard_hidden = false where id = $1", [id]);
    });
  }
});
