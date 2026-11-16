import { expect, type Page } from "@playwright/test";

// The logins from supabase/seed.sql.
export const LOGINS = {
  owner: "owner@demo.educrm.uz",
  manager: "manager@demo.educrm.uz",
  // Linked to the teacher Nodira Saidova: IELTS 6.5 and English Kids.
  teacher: "teacher@demo.educrm.uz",
} as const;

export const PASSWORD = process.env.SEED_PASSWORD ?? "EduCrm-demo-2026";

export async function signIn(page: Page, who: keyof typeof LOGINS, locale = "en") {
  await page.goto(`/${locale}/sign-in`);
  await page.locator("#email").fill(LOGINS[who]);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("button[type=submit]").click();
  // Owner lands on Reports, manager on Groups, a teacher on My groups.
  await expect(page).toHaveURL(new RegExp(`/${locale}/(reports|groups|my-groups)$`));
}
