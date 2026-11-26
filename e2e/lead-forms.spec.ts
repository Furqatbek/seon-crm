import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { hashVisitor } from "../src/lib/intake/trap";
import { withDb } from "./support/db";

// Public lead forms — docs/SPEC.md → "Lead forms add-on": "Decisions locked in",
// "Defaults to confirm", "Form builder". Forms live on their own host; the
// duplicate rules and rate limits are in supabase/tests/lead-forms.test.ts.

const FORMS = `http://${process.env.FORMS_HOST ?? "forms.localhost:3000"}`;
// Direct HTTP calls reach the same server under the forms host's name.
const HOST = { host: new URL(FORMS).host };
const SHOTS = "/tmp/claude-0/-home-user-seon-crm/8e2658c1-db42-5c63-9a77-a99d1f3e7aa2/scratchpad/shots/forms";
// Every lead these tests make has a phone starting with this.
const PHONE_PREFIX = "+99890555";

const phoneFor = (project: string, n: number) => `${PHONE_PREFIX}${project.startsWith("phone") ? 1 : 2}${String(n).padStart(3, "0")}`;

// Each test is its own visitor, so tests running side by side neither share a
// rate limit nor read each other's log rows.
let visitor = "";
const log = (columns: string) =>
  withDb(async (db) => (await db.query(`select ${columns} from intake_log where ip_hash = $1 order by received_at`, [visitor])).rows);
const cleanLeads = () => withDb((db) => db.query("delete from leads where phone like $1", [`${PHONE_PREFIX}%`]));

test.beforeEach(async ({ context }, testInfo) => {
  const address = `10.${testInfo.project.name.startsWith("phone") ? 1 : 2}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  visitor = hashVisitor(process.env.FORM_SIGNING_SECRET ?? "e2e-form-signing-secret", address) ?? "";
  await context.setExtraHTTPHeaders({ "x-forwarded-for": address });
});
test.afterAll(cleanLeads);

/** People take longer than three seconds to fill a form in; so does this. */
async function fill(page: Page, slug: string, language: string) {
  await page.goto(`${FORMS}/${slug}?lang=${language}`);
  return page.waitForTimeout(3_200);
}

test("a submit in Russian creates a lead with Russian answers", async ({ page }, testInfo) => {
  const phone = phoneFor(testInfo.project.name, 1);
  const views = () =>
    withDb(async (db) => (await db.query("select coalesce(sum(s.views), 0)::int as n from form_daily_stats s join lead_forms f on f.id = s.form_id where f.slug = 'course-signup'")).rows[0].n as number);
  const before = await views();

  await fill(page, "course-signup", "ru");
  await expect(page).toHaveTitle("Запись на курс");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Запись на курс");
  await expect(page.getByRole("heading", { level: 1, name: "Запись на курс" })).toBeVisible();

  await page.getByLabel("Имя и фамилия").fill("Тест Формы");
  await page.getByLabel("Номер телефона").fill(phone.replace("+998", "+998 "));
  await page.getByRole("group", { name: "Ваш уровень сейчас" }).getByLabel("Начальный").check();
  await page.getByLabel("Удобное время").selectOption({ label: "Вечером" });
  await page.getByLabel("Комментарий").fill("Хочу сдать TOPIK");
  await page.getByLabel(/Я согласен\(на\)/).check();
  await page.getByRole("button", { name: "Записаться" }).click();

  await expect(page.getByRole("heading", { name: "Спасибо!" })).toBeVisible();
  await expect(page.getByText("Заявка принята. Мы скоро свяжемся с вами.")).toBeVisible();
  await expect(page).toHaveURL(`${FORMS}/course-signup?lang=ru&done=1`);
  await expect(page.locator("form")).toHaveCount(0);

  const lead = await withDb(async (db) =>
    (
      await db.query(
        `select l.full_name, l.source, l.status, l.assigned_to, l.submitted_language, l.preferred_time, l.notes, l.tags, l.answers, f.slug
         from leads l join lead_forms f on f.id = l.form_id where l.phone = $1`,
        [phone],
      )
    ).rows,
  );
  expect(await log("outcome")).toEqual([{ outcome: "created" }]);
  expect(lead).toEqual([
    {
      full_name: "Тест Формы",
      source: "web_form",
      status: "new",
      assigned_to: null,
      submitted_language: "ru",
      preferred_time: "Вечером",
      notes: "Хочу сдать TOPIK",
      tags: ["course-signup"],
      answers: [
        { id: "level", type: "radio", label: "Ваш уровень сейчас", value: "Начальный" },
        { id: "consent", type: "consent", label: "Я согласен(на) на использование моих данных для связи со мной.", value: true },
      ],
      slug: "course-signup",
    },
  ]);
  // The view was counted on the server; the thank-you screen is not a view.
  await expect.poll(views).toBe(before + 1);
  // No cookies and no tracking of any kind.
  expect(await page.context().cookies()).toEqual([]);
});

test("a honeypot submit shows success but creates nothing", async ({ page }, testInfo) => {
  const phone = phoneFor(testInfo.project.name, 2);
  await fill(page, "consultation", "en");
  await page.getByLabel("Full name").fill("Spam Bot");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel(/I agree/).check();
  // A person never sees this field; a script fills every input it finds.
  const trap = page.locator('input[name="website"]');
  await expect(trap).not.toBeInViewport();
  await trap.evaluate((input: HTMLInputElement) => (input.value = "https://spam.example"));
  await page.getByRole("button", { name: "Request a call" }).click();

  await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible();
  expect(await withDb(async (db) => (await db.query("select 1 from leads where phone = $1", [phone])).rowCount)).toBe(0);
  expect(await log("outcome, detail, lead_id")).toEqual([{ outcome: "spam", detail: "honeypot", lead_id: null }]);
});

test("a form sent in under three seconds is treated the same way", async ({ page }, testInfo) => {
  const phone = phoneFor(testInfo.project.name, 3);
  await page.goto(`${FORMS}/consultation?lang=en`);
  const response = await page.request.post("/consultation", {
    headers: HOST,
    form: { lang: "en", ts: await page.locator('input[name="ts"]').inputValue(), website: "", f_name: "Fast Bot", f_phone: phone, f_consent: "on" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe("/consultation?lang=en&done=1");
  expect(await log("outcome, detail")).toEqual([{ outcome: "spam", detail: "too_fast" }]);
  expect(await withDb(async (db) => (await db.query("select 1 from leads where phone = $1", [phone])).rowCount)).toBe(0);
});

test("a staff route on the forms host returns 404, and a form returns 404 on the staff host", async ({ page }) => {
  for (const path of ["/", "/en", "/en/leads", "/uz/sign-in", "/en/students", "/en/tv/abc", "/auth/callback", "/api/jobs/reminders", "/api/telegram/webhook", "/form/course-signup", "/course-signup/extra", "/no-such-form"]) {
    const response = await page.request.get(path, { headers: HOST, maxRedirects: 0 });
    expect(response.status(), `forms host ${path}`).toBe(404);
    expect(await response.text(), path).not.toContain("<form");
  }
  expect((await page.request.post("/api/telegram/webhook", { headers: HOST, data: {} })).status()).toBe(404);
  expect((await page.request.get("/course-signup", { headers: HOST })).status()).toBe(200);

  // The staff host: no form pages, and the app is where it always was.
  for (const path of ["/form/course-signup", "/form", "/form/free-trial?lang=ru"]) {
    expect((await page.request.get(path, { maxRedirects: 0 })).status(), `staff host ${path}`).toBe(404);
  }
  const onStaff = await page.request.get("/course-signup");
  expect(await onStaff.text()).not.toContain("lf-form");
  expect((await page.request.get("/en/sign-in")).status()).toBe(200);
});

test("errors are shown in the visitor's language next to their fields, and changing language keeps what was typed", async ({ page }, testInfo) => {
  await fill(page, "free-trial", "uz");
  await page.getByLabel("Ism va familiya").fill("Til Sinovi");
  await page.getByLabel("Yoshingiz").fill("yigirma");
  await page.getByRole("link", { name: "Русский" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Бесплатный пробный урок" })).toBeVisible();
  await expect(page.getByLabel("Имя и фамилия")).toHaveValue("Til Sinovi");
  await expect(page.getByLabel("Ваш возраст")).toHaveValue("yigirma");
  await expect(page.getByRole("link", { name: "Русский" })).toHaveAttribute("aria-current", "true");

  await page.waitForTimeout(3_200);
  await page.getByRole("button", { name: "Записаться на пробный урок" }).click();
  await expect(page.getByRole("alert")).toHaveText("Проверьте отмеченные поля.");
  const phone = page.getByLabel("Номер телефона");
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(phone).toBeFocused();
  await expect(phone).toHaveAccessibleDescription("Введите номер телефона, например +998 90 123 45 67.");
  await expect(page.getByLabel("Ваш возраст")).toHaveAccessibleDescription("Введите число.");
  await expect(page.getByRole("group", { name: "Удобное время" })).toContainText("Заполните это поле.");
  await expect(page.getByLabel("Имя и фамилия")).toHaveValue("Til Sinovi");
  await expect(page.getByLabel("Имя и фамилия")).not.toHaveAttribute("aria-invalid", "true");
  expect(await log("outcome")).toEqual([{ outcome: "invalid" }]);
  await page.screenshot({ path: `${SHOTS}/errors-${testInfo.project.name}.png`, fullPage: true });

  const found = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(found.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.target.join(" ")}`)).toEqual([]);
});

test("each template passes the accessibility check and sends under 100 KB of JavaScript", async ({ page }) => {
  for (const slug of ["course-signup", "free-trial", "consultation"]) {
    let scripts = 0;
    const count = async (response: import("@playwright/test").Response) => {
      if (response.request().resourceType() === "script") scripts += (await response.body().catch(() => Buffer.alloc(0))).length;
    };
    page.on("response", count);
    const response = await page.goto(`${FORMS}/${slug}`, { waitUntil: "networkidle" });
    page.off("response", count);
    const html = (await response!.body()).length;
    // No script files at all: the page's own HTML, inline script included, is the whole budget.
    expect(scripts, `${slug} script files`).toBe(0);
    expect(html, `${slug} page size`).toBeLessThan(100 * 1024);

    const found = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(found.violations.map((violation) => `${slug} ${violation.id}: ${violation.nodes[0]?.target.join(" ")}`)).toEqual([]);
  }
});

test("a closed form shows its closed message and takes nothing; a redirect form sends the visitor on", async ({ page }, testInfo) => {
  const suffix = `${testInfo.project.name.startsWith("phone") ? "p" : "d"}${Date.now()}`;
  const phone = phoneFor(testInfo.project.name, 4);
  const [closed, redirect] = [`closed-${suffix}`, `redirect-${suffix}`];
  await withDb(async (db) => {
    await db.query(
      `insert into lead_forms (name, slug, status, draft, published, published_version, published_at)
       select 'E2E closed', $1, 'closed', published, published, 1, now() from lead_forms where slug = 'consultation'`,
      [closed],
    );
    await db.query(
      `insert into lead_forms (name, slug, status, draft, published, published_version, published_at)
       select 'E2E redirect', $1, 'live', doc, doc, 1, now()
       from (select jsonb_set(published, '{after_submit}', $2::jsonb) as doc from lead_forms where slug = 'consultation') d`,
      [redirect, JSON.stringify({ mode: "redirect", url: `${FORMS}/course-signup?lang=en` })],
    );
  });
  try {
    await page.goto(`${FORMS}/${closed}?lang=en`);
    await expect(page.getByRole("status")).toHaveText("This form is closed. Please contact us by phone.");
    await expect(page.locator("form")).toHaveCount(0);
    expect((await page.request.post(`/${closed}`, { headers: HOST, form: { f_name: "A", f_phone: phone, f_consent: "on" } })).status()).toBe(410);

    await fill(page, redirect, "en");
    await page.getByLabel("Full name").fill("Redirect Test");
    await page.getByLabel("Phone number").fill(phone);
    await page.getByLabel(/I agree/).check();
    await page.getByRole("button", { name: "Request a call" }).click();
    await expect(page).toHaveURL(`${FORMS}/course-signup?lang=en`);
    expect(await withDb(async (db) => (await db.query("select 1 from leads where phone = $1", [phone])).rowCount)).toBe(1);
  } finally {
    await withDb(async (db) => {
      await db.query("delete from intake_log where form_id in (select id from lead_forms where slug = any($1))", [[closed, redirect]]);
      await db.query("delete from leads where phone = $1", [phone]);
      await db.query("delete from form_daily_stats where form_id in (select id from lead_forms where slug = any($1))", [[closed, redirect]]);
      await db.query("delete from lead_forms where slug = any($1)", [[closed, redirect]]);
    });
  }
});

test("screenshots of each template", async ({ browser }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("phone"), "taken once, at both widths");
  for (const [width, height] of [[390, 844], [1280, 800]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    for (const [slug, language] of [["course-signup", "uz"], ["free-trial", "ru"], ["consultation", "en"]] as const) {
      await page.goto(`${FORMS}/${slug}?lang=${language}`, { waitUntil: "networkidle" });
      await expect(page.locator("h1")).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/${slug}-${width}.png`, fullPage: true });
    }
    await page.goto(`${FORMS}/course-signup?lang=uz&done=1`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${SHOTS}/thanks-${width}.png`, fullPage: true });
    await context.close();
  }
});
