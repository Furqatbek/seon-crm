// The public form page. Reached only on the forms host, where the proxy sends
// /<slug> here; on the staff host this path is a 404.
// docs/SPEC.md → "Lead forms add-on": "Form builder", "Defaults to confirm".
//
// It answers with plain HTML and no framework script, so a phone on a slow
// connection gets the whole form in one small response. GET shows the form,
// POST takes the answers and redirects to the thank-you screen.

import { createHash } from "node:crypto";

import { after, type NextRequest } from "next/server";
import { createElement } from "react";

import en from "../../../../messages/en.json";
import ru from "../../../../messages/ru.json";
import uz from "../../../../messages/uz.json";
import { FORM_CSS, FORM_SCRIPT } from "@/components/forms/form-css";
import { FormRenderer, fieldName, type FormRendererState, type FormUiTexts } from "@/components/forms/form-renderer";
import { isHttpUrl, pick, visitorLanguage, type FormLanguage } from "@/lib/forms/document";
import { countFormView, getPublicForm, type PublicForm } from "@/lib/forms/public";
import { submitIntake } from "@/lib/intake/intake";
import { supabaseIntakeStore } from "@/lib/intake/store";
import { HONEYPOT_FIELD, TOKEN_FIELD, issueToken } from "@/lib/intake/trap";
import { isAnswered } from "@/lib/intake/validator";
import { createAdminClient } from "@/lib/supabase/admin";

const UI: Record<FormLanguage, FormUiTexts> = { uz: uz.publicForm, ru: ru.publicForm, en: en.publicForm };

const SCRIPT_HASH = createHash("sha256").update(FORM_SCRIPT).digest("base64");
const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  // Each response carries its own signed timestamp, so it is never stored.
  "cache-control": "private, no-store",
  "content-security-policy": [
    "default-src 'none'",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src https: http: data:",
    `script-src 'sha256-${SCRIPT_HASH}'`,
    "base-uri 'none'",
  ].join("; "),
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
};

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const notFound = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

async function page(form: PublicForm, language: FormLanguage, state: FormRendererState, token: string, status = 200) {
  const { document, slug } = form;
  const text = (value: Parameters<typeof pick>[0]) => pick(value, language, document.default_language);
  // Loaded when needed: this module may not be imported at the top of a route.
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = renderToStaticMarkup(
    createElement(FormRenderer, {
      document,
      language,
      assets: form.assets,
      ui: UI[language],
      state,
      action: `/${slug}`,
      token,
      languageHref: (code) => `/${slug}?lang=${code}`,
    }),
  );

  const title = text(document.share.page_title) || text(document.texts.title) || form.name;
  const description = text(document.share.description) || text(document.texts.subtitle);
  const image = document.share.image_asset ? form.assets[document.share.image_asset] : undefined;
  const host = process.env.FORMS_HOST;
  const font = document.design.font.replace(/ /g, "+");
  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escape(title)}</title>`,
    description ? `<meta name="description" content="${escape(description)}">` : "",
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escape(title)}">`,
    description ? `<meta property="og:description" content="${escape(description)}">` : "",
    host ? `<meta property="og:url" content="https://${escape(host)}/${slug}">` : "",
    image ? `<meta property="og:image" content="${escape(image.url)}">` : "",
    image?.width ? `<meta property="og:image:width" content="${image.width}">` : "",
    image?.height ? `<meta property="og:image:height" content="${image.height}">` : "",
    `<meta property="og:locale" content="${language}">`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="theme-color" content="${document.design.background.color}">`,
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${font}:wght@400;600;700&amp;display=swap">`,
    `<style>html,body{margin:0}${FORM_CSS}</style>`,
  ].join("");

  const html = `<!doctype html><html lang="${language}"><head>${head}</head><body>${body}<script>${FORM_SCRIPT}</script></body></html>`;
  return new Response(html, { status, headers: HEADERS });
}

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  const form = await getPublicForm(slug);
  const secret = process.env.FORM_SIGNING_SECRET;
  if (!form || !secret) return notFound();

  const query = request.nextUrl.searchParams;
  const language = visitorLanguage(form.document, query.get("lang"), request.headers.get("accept-language"));
  if (form.status === "closed") return page(form, language, { kind: "closed" }, "");
  if (query.get("done") === "1") return page(form, language, { kind: "thanks" }, "");

  // Counted on the server after the page is on its way. No cookie, no visitor id.
  if (request.method === "GET" && request.headers.get("purpose") !== "prefetch") {
    after(() => countFormView(form.id).catch(() => undefined));
  }
  return page(form, language, { kind: "form" }, issueToken(secret, form.id, new Date()));
}

export async function POST(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  const form = await getPublicForm(slug);
  const secret = process.env.FORM_SIGNING_SECRET;
  const db = createAdminClient();
  if (!form || !secret || !db) return notFound();

  const data = await request.formData().catch(() => null);
  if (!data) return new Response("Bad request", { status: 400 });
  const string = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" ? value : null;
  };

  const language = visitorLanguage(form.document, string("lang"), request.headers.get("accept-language"));
  const values: Record<string, string | string[]> = {};
  for (const field of form.document.fields) {
    if (!isAnswered(field)) continue;
    const sent = data.getAll(fieldName(field.id)).filter((value): value is string => typeof value === "string");
    if (field.type === "multiple_choice") values[field.id] = sent;
    else if (sent.length > 0) values[field.id] = sent[0];
  }

  const now = new Date();
  const result = await submitIntake(
    {
      channel: "form",
      form,
      values,
      language,
      trap: { honeypot: string(HONEYPOT_FIELD), token: string(TOKEN_FIELD) },
      ip: request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip"),
      now,
    },
    { store: supabaseIntakeStore(db), secret },
  );

  if (result.status === "accepted") {
    const { after_submit: afterSubmit } = form.document;
    const location =
      afterSubmit.mode === "redirect" && isHttpUrl(afterSubmit.url) ? afterSubmit.url : `/${slug}?lang=${language}&done=1`;
    return new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });
  }
  if (result.status === "closed") return page(form, language, { kind: "closed" }, "", 410);

  const token = issueToken(secret, form.id, now);
  if (result.status === "invalid") return page(form, language, { kind: "form", values, errors: result.errors }, token, 422);
  if (result.status === "expired") return page(form, language, { kind: "form", values, notice: "expired" }, token, 422);
  if (result.status === "rate_limited") return page(form, language, { kind: "form", values, notice: "rate_limited" }, token, 429);
  return page(form, language, { kind: "form", values, notice: "failed" }, token, 500);
}
