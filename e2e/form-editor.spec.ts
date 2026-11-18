import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { signIn } from "./support/auth";
import { withDb } from "./support/db";

// The form editor — docs/SPEC.md → "Lead forms add-on": "Form builder",
// "Editor with live preview". Undo/redo rules and the contrast function are
// unit-tested in src/lib/forms/history.test.ts.

const FORMS = `http://${process.env.FORMS_HOST ?? "forms.localhost:3000"}`;
const SHOTS = "/tmp/claude-0/-home-user-seon-crm/8e2658c1-db42-5c63-9a77-a99d1f3e7aa2/scratchpad/shots/editor";

// Forms made by these tests, removed at the end.
const made: string[] = [];
test.afterAll(async () => {
  if (made.length === 0) return;
  await withDb(async (db) => {
    await db.query("delete from intake_log where form_id = any($1)", [made]);
    await db.query("delete from form_daily_stats where form_id = any($1)", [made]);
    await db.query("delete from form_assets where form_id = any($1)", [made]);
    await db.query("delete from lead_form_versions where form_id = any($1)", [made]);
    await db.query("delete from lead_forms where id = any($1)", [made]);
  });
});

const frame = (page: Page) => page.locator("[data-preview-frame]");
const saved = (page: Page) => expect(page.locator("[data-save-state]")).toHaveAttribute("data-save-state", "saved", { timeout: 15_000 });

/** New form from a template, through the list. Returns its id. */
async function newForm(page: Page, template: string): Promise<string> {
  await page.goto("/en/leads/forms");
  await page.getByRole("button", { name: "New form" }).first().click();
  await page.locator(`[data-template="${template}"]`).click();
  await expect(page).toHaveURL(/\/en\/leads\/forms\/[0-9a-f-]{36}\/edit$/);
  const id = /forms\/([0-9a-f-]{36})\/edit/.exec(page.url())![1];
  made.push(id);
  await expect(frame(page)).toBeVisible();
  return id;
}

test("under 1024 px the editor asks to be opened on a computer", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("phone"), "the phone-sized check");
  await signIn(page, "owner");
  const id = await withDb(async (db) => (await db.query("select id from lead_forms where slug = 'course-signup'")).rows[0].id as string);
  await page.goto(`/en/leads/forms/${id}/edit`);
  await expect(page.getByRole("heading", { name: "Open on a computer" })).toBeVisible();
  await expect(page.locator("[data-form-editor]")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the forms list shows each form with its last 30 days", async ({ page }, testInfo) => {
  await signIn(page, "owner");
  await page.goto("/en/leads");
  await page.locator("[data-leads-tabs]").getByRole("link", { name: "Forms" }).click();
  await expect(page).toHaveURL(/\/en\/leads\/forms$/);
  const row = page.locator('[data-form-row="course-signup"]');
  await expect(row.getByRole("link", { name: "Course sign-up" })).toBeVisible();
  await expect(row.getByText("Live", { exact: true })).toBeVisible();
  await expect(row).toContainText("forms.localhost:3000/course-signup");
  for (const stat of ["views", "leads", "won", "conversion"]) await expect(row.locator(`[data-stat="${stat}"] dd`)).toHaveText(/^(\d[\d\s,]*|—|\d+([.,]\d)?%)$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/list-${testInfo.project.name}.png`, fullPage: true });
});

test("a teacher has no forms; a manager has no Archive", async ({ page }) => {
  await signIn(page, "teacher");
  const id = await withDb(async (db) => (await db.query("select id from lead_forms where slug = 'course-signup'")).rows[0].id as string);
  await page.goto(`/en/leads/forms/${id}/edit`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("[data-form-editor], [data-open-on-computer]")).toHaveCount(0);
  await page.goto("/en/leads/forms");
  await expect(page.locator("[data-form-row]")).toHaveCount(0);
  await page.goto("/auth/sign-out?locale=en");

  await signIn(page, "manager");
  await page.goto("/en/leads/forms");
  await page.getByRole("button", { name: "Actions for Course sign-up" }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Archive" })).toHaveCount(0);
});

test("create from a template, add a dropdown in three languages, restyle, preview on Phone, publish, and the live page matches", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("phone"), "the editor needs a computer");
  test.setTimeout(180_000);
  await signIn(page, "owner");
  const id = await newForm(page, "free_trial");
  await expect(page.locator("[data-form-name]")).toHaveText("Free trial lesson");
  await expect(page.locator("[data-editor-top-bar]").getByText("Draft", { exact: true })).toBeVisible();

  // ── A dropdown, labelled in uz, ru and en ──
  await page.getByRole("button", { name: "Add field" }).click();
  await page.locator('[data-field-type="dropdown"]').click();
  const card = page.locator('[data-field="dropdown"]');
  const texts = {
    UZ: { label: "Qaysi filial?", options: ["Chilonzor", "Yunusobod"] },
    RU: { label: "Какой филиал?", options: ["Чиланзар", "Юнусабад"] },
    EN: { label: "Which branch?", options: ["Chilanzar", "Yunusabad"] },
  };
  for (const [language, text] of Object.entries(texts)) {
    await card.getByRole("tab", { name: language }).click();
    await card.getByLabel("Label").fill(text.label);
    await card.getByLabel("Option 1", { exact: true }).fill(text.options[0]);
    await card.getByLabel("Option 2", { exact: true }).fill(text.options[1]);
  }
  // Every language is filled in: no missing-translation dot on the card.
  await expect(card.locator("[data-missing]")).toHaveCount(0);
  // The preview follows within a moment, in the preview language (uz first).
  await expect(frame(page).getByLabel("Qaysi filial?")).toBeVisible();
  await page.getByRole("radiogroup", { name: "Preview language" }).getByRole("radio", { name: "RU" }).click();
  await expect(frame(page).getByLabel("Какой филиал?").locator("option")).toHaveText(["Выберите…", "Чиланзар", "Юнусабад"]);

  // A missing translation shows a dot.
  await card.getByRole("tab", { name: "EN" }).click();
  await card.getByLabel("Label").fill("");
  await expect(card.locator('[data-missing="en"]')).toBeVisible();
  await card.getByLabel("Label").fill("Which branch?");
  await expect(card.locator("[data-missing]")).toHaveCount(0);

  // Name and Phone are locked; the dropdown can be deleted.
  await expect(page.locator('[data-field="name"]').getByRole("button", { name: /^Delete/ })).toHaveCount(0);
  await expect(page.locator('[data-field="phone"]').getByRole("button", { name: /^Delete/ })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /^Delete/ })).toBeVisible();

  // ── Design: button colour and font ──
  await page.getByRole("tab", { name: "Design" }).click();
  const button = frame(page).getByRole("button", { name: "Записаться на пробный урок" });
  await page.locator('[data-colour="Button"]').getByRole("textbox", { name: "Button", exact: true }).fill("#1F5FBF");
  await expect(button).toHaveCSS("background-color", "rgb(31, 95, 191)");
  // Dark text on that blue is hard to read: the warning appears, and goes with white text.
  await expect(page.locator('[data-colour="Button text"] [data-contrast-warning]')).toBeVisible();
  await page.locator('[data-colour="Button text"]').getByRole("textbox", { name: "Button text", exact: true }).fill("#FFFFFF");
  await expect(page.locator("[data-contrast-warning]")).toHaveCount(0);
  await expect(button).toHaveCSS("color", "rgb(255, 255, 255)");

  await page.locator('[data-font="Rubik"]').click();
  await expect(page.locator('[data-font="Rubik"]')).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => button.evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(/Rubik/i);

  // ── Screen sizes: the frame, the scale and the layout change ──
  const scale = page.locator("[data-preview-scale]");
  const sizes = page.getByRole("radiogroup", { name: "Screen size" });
  const title = frame(page).getByRole("heading", { level: 1 });
  const cardBox = frame(page).locator(".lf-card");
  await expect(frame(page)).toHaveAttribute("data-preview-frame", "desktop");
  // 1280 does not fit beside the 400 px panel in a 1440 px window: it is scaled down and says so.
  await expect(scale).toHaveText(/^1280 px · (7\d|8\d)%$/);
  // Split layout on a desktop: the heading sits beside the card.
  const beside = async () => {
    const [heading, form] = await Promise.all([title.boundingBox(), cardBox.boundingBox()]);
    return heading!.x + heading!.width <= form!.x && Math.abs(heading!.y - form!.y) < form!.height;
  };
  expect(await beside()).toBe(true);
  await page.screenshot({ path: `${SHOTS}/editor-desktop-1280.png` });

  await sizes.getByRole("radio", { name: "Tablet 768" }).click();
  await expect(frame(page)).toHaveAttribute("data-preview-frame", "tablet");
  await expect(scale).toHaveText("768 px · 100%");
  await page.screenshot({ path: `${SHOTS}/editor-tablet-768.png` });

  await sizes.getByRole("radio", { name: "Phone 390" }).click();
  await expect(frame(page)).toHaveAttribute("data-preview-frame", "phone");
  await expect(scale).toHaveText("390 px · 100%");
  expect((await frame(page).boundingBox())!.width).toBeCloseTo(390, 0);
  // On a phone the heading is above the card, and half-width fields stack.
  expect(await beside()).toBe(false);
  const [nameBox, phoneBox] = await Promise.all([frame(page).getByLabel("Имя и фамилия").boundingBox(), frame(page).getByLabel("Номер телефона").boundingBox()]);
  expect(phoneBox!.y).toBeGreaterThan(nameBox!.y + nameBox!.height);
  await page.screenshot({ path: `${SHOTS}/editor-phone-390.png` });

  // ── The preview can be typed into and sent; nothing is created ──
  await frame(page).getByRole("button", { name: "Записаться на пробный урок" }).click();
  await expect(frame(page).getByRole("alert")).toHaveText("Проверьте отмеченные поля.");
  await frame(page).getByLabel("Имя и фамилия").fill("Предпросмотр");
  await frame(page).getByLabel("Номер телефона").fill("+998 90 555 30 01");
  await frame(page).getByLabel("Утром").check();
  await frame(page).getByLabel(/Я согласен/).check();
  await frame(page).getByRole("button", { name: "Записаться на пробный урок" }).click();
  await expect(frame(page).getByRole("heading", { name: "Спасибо!" })).toBeVisible();
  await expect(page.getByLabel("Show thank-you screen")).toBeChecked();
  await page.getByLabel("Show thank-you screen").click();
  await expect(frame(page).locator("form")).toBeVisible();
  expect(await withDb(async (db) => (await db.query("select 1 from leads where phone = '+998905553001'")).rowCount)).toBe(0);

  // ── Auto-save, then publish ──
  await saved(page);
  const publish = page.locator("[data-publish]");
  await expect(publish).toHaveText("Publish");
  await publish.click();
  await expect(page.getByText(/Published: version 1 is live/)).toBeVisible();
  await expect(page.locator("[data-editor-top-bar]").getByText("Live", { exact: true })).toBeVisible();
  await expect(publish).toBeDisabled();

  const { slug, versions } = await withDb(async (db) => ({
    slug: (await db.query("select slug from lead_forms where id = $1 and status = 'live' and published = draft", [id])).rows[0].slug as string,
    versions: (await db.query("select version, published_by is not null as by from lead_form_versions where form_id = $1", [id])).rows,
  }));
  expect(slug).toMatch(/^free-trial-\d+$/);
  expect(versions).toEqual([{ version: 1, by: true }]);
  await expect(page.locator("[data-open-live]")).toHaveAttribute("href", `${FORMS}/${slug}`);

  // ── The live page has the same field, colour and font ──
  const live = await page.context().newPage();
  await live.setViewportSize({ width: 390, height: 844 });
  await live.goto(`${FORMS}/${slug}?lang=ru`, { waitUntil: "networkidle" });
  await expect(live.getByLabel("Какой филиал?").locator("option")).toHaveText(["Выберите…", "Чиланзар", "Юнусабад"]);
  const liveButton = live.getByRole("button", { name: "Записаться на пробный урок" });
  await expect(liveButton).toHaveCSS("background-color", "rgb(31, 95, 191)");
  await expect(liveButton).toHaveCSS("color", "rgb(255, 255, 255)");
  expect(await liveButton.evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(/^"?Rubik"?/);
  expect(await live.evaluate(() => document.fonts.check('16px "Rubik"'))).toBe(true);
  await live.goto(`${FORMS}/${slug}?lang=en`);
  await expect(live.getByLabel("Which branch?").locator("option")).toHaveText(["Choose…", "Chilanzar", "Yunusabad"]);
  await live.goto(`${FORMS}/${slug}?lang=uz`);
  await expect(live.getByLabel("Qaysi filial?")).toBeVisible();
  await live.screenshot({ path: `${SHOTS}/live-390.png`, fullPage: true });
  await live.close();

  // ── A later change reads "Publish changes" and does not reach visitors until published ──
  await page.getByRole("tab", { name: "Fields" }).click();
  await page.locator('[data-card="texts"]').getByRole("button", { expanded: false }).click();
  await page.locator('[data-card="texts"]').getByRole("tab", { name: "EN" }).click();
  await page.locator('[data-card="texts"]').getByLabel("Title", { exact: true }).fill("Trial lesson, version two");
  await expect(publish).toHaveText("Publish changes");
  await saved(page);
  const check = await page.context().newPage();
  await check.goto(`${FORMS}/${slug}?lang=en`);
  await expect(check.getByRole("heading", { level: 1 })).toHaveText("Free trial lesson");
  await publish.click();
  await expect(page.getByText(/Published: version 2 is live/)).toBeVisible();
  // The cached page is refreshed on publish.
  await expect(async () => {
    await check.reload();
    await expect(check.getByRole("heading", { level: 1 })).toHaveText("Trial lesson, version two", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await check.close();

  // ── Version history: restore version 1 into the draft ──
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Version history" }).click();
  const history = page.getByRole("dialog", { name: "Version history" });
  await expect(history.locator("[data-version]")).toHaveCount(2);
  await expect(history.locator('[data-version="2"]')).toContainText("published now");
  await expect(history.locator('[data-version="1"]')).toContainText("Jasur Karimov");
  await history.locator('[data-version="1"]').getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Version 1 is loaded into the draft")).toBeVisible();
  await page.getByRole("radiogroup", { name: "Preview language" }).getByRole("radio", { name: "EN" }).click();
  await expect(frame(page).getByRole("heading", { level: 1 })).toHaveText("Free trial lesson");
  await expect(publish).toHaveText("Publish changes");
  await saved(page);
});

test("undo and redo, from the buttons and the keyboard; rename; address warning; close and reopen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("phone"), "the editor needs a computer");
  test.setTimeout(120_000);
  await signIn(page, "owner");
  const id = await newForm(page, "blank");
  const heading = frame(page).getByRole("heading", { level: 1 });
  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });
  await expect(undo).toBeDisabled();
  await expect(heading).toHaveText("Ariza qoldiring");

  // Two changes: the title, then a new field.
  const texts = page.locator('[data-card="texts"]');
  await texts.getByRole("button", { expanded: false }).click();
  await texts.getByLabel("Title", { exact: true }).fill("Yangi sarlavha");
  await expect(heading).toHaveText("Yangi sarlavha");
  await page.getByRole("button", { name: "Add field" }).click();
  await page.locator('[data-field-type="email"]').click();
  await expect(frame(page).getByLabel("Email")).toBeVisible();

  // Ctrl+Z takes back the field, then the whole typed title (one step, not one per letter).
  await page.locator("body").click({ position: { x: 700, y: 30 } });
  await page.keyboard.press("Control+z");
  await expect(frame(page).getByLabel("Email")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(heading).toHaveText("Ariza qoldiring");
  await expect(undo).toBeDisabled();
  // Shift+Ctrl+Z brings them back; the buttons do the same.
  await page.keyboard.press("Control+Shift+z");
  await expect(heading).toHaveText("Yangi sarlavha");
  await redo.click();
  await expect(frame(page).getByLabel("Email")).toBeVisible();
  await expect(redo).toBeDisabled();
  await undo.click();
  await expect(frame(page).getByLabel("Email")).toHaveCount(0);

  // Rename from the top bar.
  await page.locator("[data-form-name]").click();
  await page.getByRole("textbox", { name: "Form name" }).fill("E2E undo form");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-form-name]")).toHaveText("E2E undo form");
  await saved(page);
  expect(await withDb(async (db) => (await db.query("select name, draft #>> '{texts,title,uz}' as title from lead_forms where id = $1", [id])).rows)).toEqual([
    { name: "E2E undo form", title: "Yangi sarlavha" },
  ]);

  // The address: reserved words are refused; a draft changes without a warning.
  await page.getByRole("tab", { name: "Settings" }).click();
  const address = page.locator("[data-slug-field]");
  await address.getByRole("textbox").fill("admin");
  await expect(address.getByRole("alert")).toHaveText("This address is reserved. Choose another.");
  await expect(address.getByRole("button", { name: "Save address" })).toBeDisabled();
  const slug = `e2e-undo-${Date.now()}`;
  await address.getByRole("textbox").fill(slug);
  await expect(address.locator("[data-slug-warning]")).toHaveCount(0);
  await address.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText("Address saved")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Embed code" })).toHaveValue(new RegExp(`${FORMS}/${slug}\\?embed=1`));

  // Published: changing the address now warns that links will break.
  await page.locator("[data-publish]").click();
  await expect(page.getByText(/Published: version 1 is live/)).toBeVisible();
  await address.getByRole("textbox").fill(`${slug}-new`);
  await expect(address.locator("[data-slug-warning]")).toContainText("links already shared will stop working");
  await address.getByRole("textbox").fill(slug);

  // Close: visitors get the closed message. Reopen: the form is back.
  const live = await page.context().newPage();
  await live.goto(`${FORMS}/${slug}?lang=en`);
  await expect(live.locator("form")).toBeVisible();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Close form" }).click();
  await expect(page.locator("[data-editor-top-bar]").getByText("Closed", { exact: true })).toBeVisible();
  await expect(async () => {
    await live.reload();
    await expect(live.getByRole("status")).toHaveText("This form is closed. Please contact us by phone.", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Reopen form" }).click();
  await expect(page.locator("[data-editor-top-bar]").getByText("Live", { exact: true })).toBeVisible();
  await live.close();
});

test("a logo is uploaded, stored as WebP and shown in the preview; the embed page reports its height", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("phone"), "the editor needs a computer");
  await signIn(page, "owner");
  const id = await newForm(page, "consultation");
  await page.getByRole("tab", { name: "Design" }).click();

  // A real 2×1 PNG.
  const png = await sharp({ create: { width: 2, height: 1, channels: 4, background: "#F7941D" } }).png().toBuffer();
  await page.locator('[data-upload="logo"] input[type=file]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  const logo = frame(page).locator("img.lf-logo");
  await expect(logo).toBeVisible({ timeout: 20_000 });
  await expect(logo).toHaveAttribute("src", /\/storage\/v1\/object\/public\/form-assets\/.+\.webp$/);
  expect(await withDb(async (db) => (await db.query("select kind, width, height, path like '%.webp' as webp from form_assets where form_id = $1", [id])).rows)).toEqual([
    { kind: "logo", width: 2, height: 1, webp: true },
  ]);
  const stored = await page.request.get((await logo.getAttribute("src"))!);
  expect(stored.headers()["content-type"]).toBe("image/webp");

  // Not a picture, whatever it is called: refused.
  await page.locator('[data-upload="logo"] input[type=file]').setInputFiles({ name: "notes.png", mimeType: "image/png", buffer: Buffer.from("not a picture") });
  await expect(page.getByText("Choose a PNG, JPG or WebP picture up to 5 MB.")).toBeVisible();

  // Embedded in another page, the form tells the page around it how tall it is.
  await saved(page);
  await page.locator("[data-publish]").click();
  await expect(page.getByText(/Published: version 1 is live/)).toBeVisible();
  const slug = await withDb(async (db) => (await db.query("select slug from lead_forms where id = $1", [id])).rows[0].slug as string);
  const host = await page.context().newPage();
  // Any page of another site will do: here a plain "Not found" page of the staff host.
  await host.goto("/form");
  const height = await host.evaluate(
    ({ src, slug: formSlug }) =>
      new Promise<number>((resolve) => {
        window.addEventListener("message", (event) => {
          if (event.data?.type === "lead-form-height" && event.data.slug === formSlug) resolve(event.data.height as number);
        });
        const iframe = document.createElement("iframe");
        iframe.src = src;
        iframe.style.width = "390px";
        document.body.append(iframe);
      }),
    { src: `${FORMS}/${slug}?embed=1&lang=en`, slug },
  );
  expect(height).toBeGreaterThan(400);
  await host.close();
});
