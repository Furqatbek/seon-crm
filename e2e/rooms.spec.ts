import { expect, test, type Locator, type Page } from "@playwright/test";

import { signIn } from "./support/auth";
import { withDb } from "./support/db";

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');
const dialog = (page: Page) => page.locator('[data-slot="dialog-content"]');

async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole("option", { name: option }).first().click();
}

/** Fills the New group sheet for a Sunday group in a room and presses Save. */
async function newGroup(page: Page, options: { name: string; room: RegExp; start: string }) {
  await page.getByRole("button", { name: "New group" }).click();
  await sheet(page).getByLabel("Name").fill(options.name);
  await sheet(page).getByLabel("Subject").fill("E2E");
  await choose(page, sheet(page).locator("#group-teacher"), "Dilshod Rahimov");
  await sheet(page).getByLabel("Monthly fee").fill("300 000");
  await sheet(page).locator('[data-weekday="7"]').click();
  await sheet(page).getByLabel("Start time").fill(options.start);
  await choose(page, sheet(page).getByRole("combobox", { name: "Room" }), options.room);
}

test("the owner adds a room, a manager creates a group in it, and a clashing group is refused", async ({ page, browser }, testInfo) => {
  // Each screen size has its own room, so the two runs never share a slot.
  const tag = `${testInfo.project.name.startsWith("phone") ? "P" : "D"}${String(Date.now()).slice(-5)}`;
  const number = `9${tag}`;
  const roomName = "E2E hall";
  const label = `${number} · ${roomName}`;
  const first = `E2E Rooms A ${tag}`;
  const second = `E2E Rooms B ${tag}`;

  try {
    // ── The owner: Settings → Rooms ──
    await signIn(page, "owner");
    await page.goto("/en/settings?tab=rooms");
    await expect(page.getByRole("tab", { name: "Rooms" })).toHaveAttribute("data-state", "active");
    // A seeded room that groups use: they are listed, and it cannot be archived.
    const used = page.locator('[data-room-row="1"]');
    await expect(used).toContainText("Ingliz tili xonasi");
    await expect(used).toContainText("English A2");
    await expect(used).toContainText("English B1");
    await expect(used.getByRole("button", { name: /^Archive room/ })).toBeDisabled();

    // Add room: a number and a capacity are required.
    await page.getByRole("button", { name: "Add room" }).click();
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page).getByText("Enter the room number.")).toBeVisible();
    await sheet(page).getByLabel("Number").fill(number);
    await sheet(page).getByLabel("Name").fill(roomName);
    await sheet(page).getByLabel("Capacity").fill("0");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page).getByText("Enter a capacity from 1 to 500.")).toBeVisible();
    await sheet(page).getByLabel("Capacity").fill("8");
    await page.screenshot({ path: testInfo.outputPath("add-room.png") });
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page)).toBeHidden();

    const row = page.locator(`[data-room-row="${number}"]`);
    await expect(row).toContainText(roomName);
    await expect(row).toContainText("8");
    await expect(row).toContainText("No groups");
    await expect(row).toHaveAttribute("data-room-in-use", "false");
    await expect(row.getByRole("button", { name: /^Archive room/ })).toBeEnabled();

    // The same number cannot be used twice.
    await page.getByRole("button", { name: "Add room" }).click();
    await sheet(page).getByLabel("Number").fill(` ${number.toLowerCase()} `);
    await sheet(page).getByLabel("Capacity").fill("5");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page).getByText("Another room already has this number.")).toBeVisible();
    await sheet(page).getByRole("button", { name: "Cancel" }).click();

    // Edit room: a bigger capacity.
    await row.getByRole("button", { name: `Edit room ${label}` }).click();
    await expect(sheet(page).getByLabel("Number")).toHaveValue(number);
    await sheet(page).getByLabel("Capacity").fill("10");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page)).toBeHidden();
    await expect(row.locator("td").nth(2)).toHaveText("10");

    // ── A manager, in their own browser: a group in that room ──
    const theirs = await browser.newContext({ viewport: testInfo.project.use.viewport ?? undefined });
    const manager = await theirs.newPage();
    await signIn(manager, "manager");
    // Rooms are the owner's to manage: a manager has no such tab.
    await manager.goto("/en/settings?tab=rooms");
    await expect(manager.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
    await expect(manager.locator("[data-room-row]")).toHaveCount(0);

    await manager.goto("/en/groups?tab=all");
    await newGroup(manager, { name: first, room: new RegExp(`^${label} \\(10 seats\\)$`), start: "10:00" });
    // The group takes the room's capacity, and cannot be made larger than the room.
    await expect(sheet(manager).getByLabel("Capacity")).toHaveValue("10");
    await sheet(manager).getByLabel("Capacity").fill("11");
    await sheet(manager).getByRole("button", { name: "Save" }).click();
    await expect(sheet(manager).getByText("The room holds 10. The group cannot be larger.")).toBeVisible();
    await sheet(manager).getByLabel("Capacity").fill("10");
    await manager.screenshot({ path: testInfo.outputPath("group-room.png") });
    await sheet(manager).getByRole("button", { name: "Save" }).click();
    await expect(manager).toHaveURL(/\/en\/groups\/[0-9a-f-]{36}$/);
    // The group page shows the room as "number · name".
    await expect(manager.getByText(label, { exact: true })).toBeVisible();

    // And so does a lesson's sheet.
    await manager.getByRole("tab", { name: "Lessons" }).click();
    await manager.locator("[data-lesson-row]").first().locator("td").first().click();
    await expect(sheet(manager).locator('[data-slot="lesson-room"]')).toHaveText(label);
    await manager.keyboard.press("Escape");

    // ── A second group in the same room at an overlapping time: refused, by name ──
    await manager.goto("/en/groups?tab=all");
    await newGroup(manager, { name: second, room: new RegExp(`^${label}`), start: "10:30" });
    await sheet(manager).getByRole("button", { name: "Save" }).click();
    await expect(sheet(manager).getByRole("alert").filter({ hasText: "The room is taken" })).toHaveText(
      `The room is taken at that time by ${first}.`,
    );
    // The form is longer than a phone screen: the error is scrolled into view.
    await expect(sheet(manager).getByRole("alert").filter({ hasText: "The room is taken" })).toBeInViewport();
    await manager.screenshot({ path: testInfo.outputPath("room-clash.png") });
    await expect(manager).toHaveURL(/\/en\/groups\?tab=all$/);

    // Straight after the first group (10:00 + 90 minutes) the room is free.
    await sheet(manager).getByLabel("Start time").fill("11:30");
    await sheet(manager).getByRole("button", { name: "Save" }).click();
    await expect(manager).toHaveURL(/\/en\/groups\/[0-9a-f-]{36}$/);
    await theirs.close();

    // ── Back with the owner: both groups are listed, and the room is now in use ──
    await page.reload();
    await expect(row).toContainText(first);
    await expect(row).toContainText(second);
    await expect(row.getByRole("button", { name: /^Archive room/ })).toBeDisabled();
    // It cannot be shrunk below the group of 10 either.
    await row.getByRole("button", { name: `Edit room ${label}` }).click();
    await sheet(page).getByLabel("Capacity").fill("9");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page).getByText("A group in this room is larger than that.")).toBeVisible();
    await sheet(page).getByRole("button", { name: "Cancel" }).click();
    await expect(sheet(page)).toBeHidden();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("rooms.png") });

    // ── Once its groups have finished, the room can be archived ──
    await withDb((db) =>
      db.query("update groups set status = 'finished', end_date = start_date where name = any($1)", [[first, second]]),
    );
    await page.reload();
    await expect(row).toHaveAttribute("data-room-in-use", "false");
    await row.getByRole("button", { name: `Archive room ${label}` }).click();
    await expect(dialog(page)).toContainText(`Archive room ${label}?`);
    await dialog(page).getByRole("button", { name: "Archive" }).click();
    await expect(row).toHaveCount(0);
  } finally {
    // Leave the database as the seed made it: five rooms.
    await withDb(async (db) => {
      await db.query("update groups set room_id = null, archived_at = coalesce(archived_at, now()) where name = any($1)", [[first, second]]);
      await db.query("delete from rooms where number = $1", [number]);
    });
  }
});
