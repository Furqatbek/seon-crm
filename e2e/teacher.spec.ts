import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./support/auth";
import { withDb } from "./support/db";

// The teacher login and coins — docs/SPEC.md → "Screens → My groups".

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"][data-side="right"]');
const TEACHER_USER = "00000001-0000-4000-8000-000000000003";
const TEACHER = "00000002-0000-4000-8000-000000000002";

/** One of the teacher's two groups per screen size, with a lesson to mark and no coins. */
async function fixture(groupName: string) {
  return withDb(async (db) => {
    const { rows: groups } = await db.query("select id from groups where name = $1 and teacher_id = $2", [groupName, TEACHER]);
    const group = groups[0].id as string;
    const { rows: others } = await db.query("select id from groups where teacher_id <> $1 and status = 'active' order by name limit 1", [TEACHER]);
    const { rows: lessons } = await db.query(
      `select id, lesson_date::text as day, status from lessons
       where group_id = $1 and status <> 'cancelled'
         and lesson_date between public.tashkent_today() - 7 and public.tashkent_today()
       order by lesson_date desc limit 1`,
      [group],
    );
    const lesson = lessons[0] as { id: string; day: string; status: string };
    const { rows: marks } = await db.query("select student_id, status, marked_by, marked_at from attendance where lesson_id = $1", [lesson.id]);
    await db.query("delete from attendance where lesson_id = $1", [lesson.id]);
    await db.query("update lessons set status = 'scheduled' where id = $1", [lesson.id]);
    await db.query("delete from coin_transactions where student_id in (select student_id from enrollments where group_id = $1)", [group]);
    return { group, other: others[0].id as string, lesson, marks };
  });
}

async function restore(data: Awaited<ReturnType<typeof fixture>>) {
  await withDb(async (db) => {
    await db.query("delete from coin_transactions where student_id in (select student_id from enrollments where group_id = $1)", [data.group]);
    await db.query("delete from attendance where lesson_id = $1", [data.lesson.id]);
    for (const mark of data.marks) {
      await db.query(
        "insert into attendance (lesson_id, student_id, status, marked_by, marked_at) values ($1, $2, $3, $4, $5)",
        [data.lesson.id, mark.student_id, mark.status, mark.marked_by, mark.marked_at],
      );
    }
    await db.query("update lessons set status = $2 where id = $1", [data.lesson.id, data.lesson.status]);
  });
}

test("a teacher sees only their groups, marks attendance and gives coins; staff spend them", async ({ page }, testInfo) => {
  const phone = testInfo.project.name.startsWith("phone");
  const groupName = phone ? "English Kids" : "IELTS 6.5";
  const data = await fixture(groupName);

  try {
    await signIn(page, "teacher");
    await expect(page).toHaveURL(/\/en\/my-groups$/);

    // ── Only their two groups, and nothing else in the navigation ──
    await expect(page.locator("[data-my-group]")).toHaveCount(2);
    await expect(page.locator("[data-my-group]").filter({ hasText: "IELTS 6.5" })).toBeVisible();
    await expect(page.locator("[data-my-group]").filter({ hasText: "English Kids" })).toBeVisible();
    if (phone) await page.getByRole("button", { name: "Open menu" }).click();
    const nav = page.getByRole("navigation", { name: "Main navigation" }).locator("visible=true");
    await expect(nav.getByRole("link")).toHaveText(["My groups"]);
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(page.locator('[data-slot="user-menu"]:visible')).toContainText("Teacher");
    if (phone) await page.keyboard.press("Escape");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("my-groups.png") });

    // ── Staff pages take a teacher back to their groups; another group is not found ──
    for (const path of ["/en/students", "/en/finance", "/en/reports", `/en/groups/${data.other}`]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/en\/my-groups$/);
      await expect(page.locator("[data-my-group]")).toHaveCount(2);
    }
    await page.goto(`/en/my-groups/${data.other}`);
    await expect(page.locator('[data-slot="page-problem"]').getByRole("heading", { name: "Nothing here" })).toBeVisible();

    // ── The group: lessons and students, names only ──
    await page.goto("/en/my-groups");
    await page.locator("[data-my-group]").filter({ hasText: groupName }).click();
    await expect(page.getByRole("heading", { level: 1, name: groupName })).toBeVisible();
    const students = page.locator("[data-coin-row]");
    await expect(students.first()).toBeVisible();
    await expect(page.locator("main")).not.toContainText("+998");
    await expect(page.locator("main")).not.toContainText("UZS");

    // ── Attendance ──
    const lesson = page.locator(`[data-my-lesson="${data.lesson.day}"]`);
    await expect(lesson).toContainText("Scheduled");
    await lesson.getByRole("button", { name: /^Mark attendance/ }).click();
    await expect(sheet(page).getByRole("heading", { name: "Attendance" })).toBeVisible();
    const first = sheet(page).locator("[data-lesson-student]").first();
    const absentee = await first.getAttribute("data-lesson-student");
    await first.getByRole("radio", { name: "Absent" }).click();
    await page.screenshot({ path: testInfo.outputPath("attendance.png") });
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Attendance saved")).toBeVisible();
    await expect(sheet(page)).toBeHidden();
    await expect(lesson).toContainText("Held");
    await expect(lesson.getByRole("button", { name: /^Change attendance/ })).toBeVisible();
    const saved = await withDb((db) =>
      db.query("select student_id, status, marked_by from attendance where lesson_id = $1 and status = 'absent'", [data.lesson.id]),
    );
    expect(saved.rows).toEqual([{ student_id: absentee, status: "absent", marked_by: TEACHER_USER }]);

    // ── Coins: 5 to one student, who takes first place ──
    const target = students.nth(1);
    const studentId = await target.getAttribute("data-coin-row");
    const studentName = (await target.locator('[data-cell="name"]').innerText()).trim();
    await target.getByRole("button", { name: /^Give coins/ }).click();
    await expect(sheet(page).getByRole("heading", { name: `Give coins to ${studentName}` })).toBeVisible();
    await sheet(page).getByRole("radio", { name: "5", exact: true }).click();
    await sheet(page).getByLabel("What for (optional)").fill("Homework");
    await page.screenshot({ path: testInfo.outputPath("give-coins.png") });
    await sheet(page).getByRole("button", { name: "Give coins" }).click();
    await expect(page.getByText(`${studentName}: 5 coins given`)).toBeVisible();
    const winner = page.locator(`[data-coin-row="${studentId}"]`);
    await expect(students.first()).toHaveAttribute("data-coin-row", studentId!);
    await expect(winner.locator('[data-cell="rank"]')).toHaveText("Place 1");
    await expect(winner.locator('[data-cell="earned"] [data-coins]')).toHaveAttribute("data-coins", "5");
    await expect(winner.locator('[data-cell="balance"]')).toHaveText("5");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("my-group.png"), fullPage: true });

    // ── No serious accessibility issues, in the light and the dark theme ──
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${colorScheme}: ${v.id} — ${v.nodes[0].target.join(" ")}`)).toEqual([]);
    }
    await page.emulateMedia({ colorScheme: "light" });

    // ── The same screens in Uzbek and Russian ──
    await page.goto(`/uz/my-groups/${data.group}`);
    await expect(page.getByRole("heading", { level: 2, name: "Oʻquvchilar va tangalar" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Tanga berish/ }).first()).toBeVisible();
    await page.goto(`/ru/my-groups/${data.group}`);
    await expect(page.getByRole("heading", { level: 2, name: "Ученики и монеты" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Мои группы" }).first()).toBeVisible();

    // ── Profile is still theirs ──
    await page.goto("/en/settings?tab=profile");
    await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("Nodira Saidova");
    // Profile only: none of the owner's settings tabs.
    await expect(page.getByRole("tab")).toHaveCount(0);

    // ── A manager sees the coins on the group and spends some ──
    await page.context().clearCookies();
    await signIn(page, "manager");
    await page.goto(`/en/groups/${data.group}`);
    const row = page.locator(`[data-group-student="${studentId}"]`);
    await expect(row.locator('[data-cell="coins"]')).toHaveAttribute("data-coin-rank", "1");
    await expect(row.locator("[data-coins]")).toHaveAttribute("data-coins", "5");
    await row.getByRole("button", { name: `Actions for ${studentName}` }).click();
    await page.getByRole("menuitem", { name: "Coins" }).click();
    await expect(sheet(page).locator('[data-slot="coins-balance"]')).toHaveText("5 coins to spend");
    await sheet(page).getByRole("radio", { name: "Spend coins" }).click();
    await sheet(page).getByLabel("How many").fill("9");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(sheet(page).getByText("The student does not have that many coins.")).toBeVisible();
    await expect(sheet(page).getByText("Say what the coins were spent on.")).toBeVisible();
    await sheet(page).getByLabel("How many").fill("3");
    await sheet(page).getByLabel("What they were spent on").fill("Notebook");
    await page.screenshot({ path: testInfo.outputPath("spend-coins.png") });
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(`${studentName}: 3 coins spent`)).toBeVisible();
    await expect(row.locator("[data-coins]")).toHaveAttribute("data-coins", "2");
    // Still first: spending does not lower what was earned.
    await expect(row.locator('[data-cell="coins"]')).toHaveAttribute("data-coin-rank", "1");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: testInfo.outputPath("group-coins.png") });
  } finally {
    await restore(data);
  }
});

test("the owner sees which teacher a login belongs to and can invite a teacher", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/en/settings?tab=users");
  const teacher = page.locator('[data-user-row="teacher@demo.educrm.uz"]');
  await expect(teacher.getByRole("combobox", { name: "Role of Nodira Saidova" })).toContainText("Teacher");
  await expect(teacher.locator('[data-slot="linked-teacher"]')).toHaveText("Nodira Saidova");

  await page.getByRole("button", { name: "Invite user" }).click();
  const form = sheet(page);
  await expect(form.getByRole("combobox", { name: "Teacher" })).toHaveCount(0);
  await form.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: "Teacher" }).click();
  await form.getByLabel("Email").fill("someone@example.uz");
  await form.getByLabel("Full name").fill("Someone");
  // A teacher login needs its teacher.
  await form.getByRole("button", { name: "Send invitation" }).click();
  await expect(form.getByText("Choose the teacher.")).toBeVisible();
  await form.getByRole("combobox", { name: "Teacher" }).click();
  // Nodira already has a login: she is not offered again.
  await expect(page.getByRole("option", { name: "Dilshod Rahimov" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Nodira Saidova" })).toHaveCount(0);
});
