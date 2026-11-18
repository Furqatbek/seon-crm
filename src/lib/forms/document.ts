// The form document — docs/SPEC.md → "Lead forms add-on → Data model additions
// → Form document". A form's fields, texts and design live in this one JSON
// value (lead_forms.draft and lead_forms.published).

import { z } from "zod";

/** Languages a visitor may read a form in. Korean is for the staff interface only. */
export const FORM_LANGUAGES = ["uz", "ru", "en"] as const;
export type FormLanguage = (typeof FORM_LANGUAGES)[number];

/** Each language's own name, shown in the switch. */
export const LANGUAGE_NAMES: Record<FormLanguage, string> = { uz: "Oʻzbekcha", ru: "Русский", en: "English" };

export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "phone",
  "email",
  "number",
  "date",
  "radio",
  "dropdown",
  "multiple_choice",
  "consent",
  "hidden",
  "heading",
  "paragraph",
  "image",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Fields that only show something: a visitor answers nothing in them. */
export const DISPLAY_TYPES: readonly FieldType[] = ["heading", "paragraph", "image"];
export const CHOICE_TYPES: readonly FieldType[] = ["radio", "dropdown", "multiple_choice"];

export const MAPS_TO = ["name", "phone", "subject", "preferred_time", "notes", "custom"] as const;
export type MapsTo = (typeof MAPS_TO)[number];

export const FORM_FONTS = ["Inter", "Manrope", "Montserrat", "Roboto", "Open Sans", "PT Sans", "Nunito", "Rubik"] as const;
export type FormFont = (typeof FORM_FONTS)[number];

const text = z.string().max(2000);
const localized = z.object({ uz: text.optional(), ru: text.optional(), en: text.optional() });
export type Localized = z.infer<typeof localized>;

const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().regex(/^[a-z0-9_]{1,40}$/);

const field = z.object({
  id,
  type: z.enum(FIELD_TYPES),
  maps_to: z.enum(MAPS_TO).default("custom"),
  label: localized.default({}),
  placeholder: localized.default({}),
  help: localized.default({}),
  required: z.boolean().default(false),
  width: z.enum(["full", "half"]).default("full"),
  options: z.array(z.object({ id, label: localized })).max(50).default([]),
  /** A hidden field's value, or an image field's asset id. */
  value: z.string().max(500).default(""),
});
export type FormField = z.infer<typeof field>;

export const formDocumentSchema = z
  .object({
    languages: z.array(z.enum(FORM_LANGUAGES)).min(1),
    default_language: z.enum(FORM_LANGUAGES),
    texts: z.object({
      title: localized,
      subtitle: localized.default({}),
      button: localized,
      thank_you_title: localized,
      thank_you_text: localized.default({}),
      closed_text: localized,
      consent_text: localized,
    }),
    fields: z.array(field).min(2).max(60),
    design: z.object({
      font: z.enum(FORM_FONTS).default("Inter"),
      logo: z.object({ asset: z.string().nullable().default(null), position: z.enum(["top", "left"]).default("top") }),
      background: z.object({
        color: colour.default("#F5F5F7"),
        asset: z.string().nullable().default(null),
        overlay: z.number().int().min(0).max(80).default(0),
      }),
      colors: z.object({ text: colour, card: colour, card_text: colour, button: colour, button_text: colour }),
      corners: z.enum(["square", "rounded", "pill"]).default("rounded"),
      layout: z.enum(["card", "split"]).default("card"),
    }),
    after_submit: z.object({ mode: z.enum(["message", "redirect"]).default("message"), url: z.string().max(500).default("") }),
    share: z.object({
      page_title: localized.default({}),
      description: localized.default({}),
      image_asset: z.string().nullable().default(null),
    }),
  })
  .superRefine((doc, ctx) => {
    if (!doc.languages.includes(doc.default_language)) {
      ctx.addIssue({ code: "custom", path: ["default_language"], message: "The default language is not one of the form's languages" });
    }
    const seen = new Set<string>();
    for (const [index, item] of doc.fields.entries()) {
      if (seen.has(item.id)) ctx.addIssue({ code: "custom", path: ["fields", index, "id"], message: "Field ids must differ" });
      seen.add(item.id);
      if (CHOICE_TYPES.includes(item.type) && item.options.length === 0) {
        ctx.addIssue({ code: "custom", path: ["fields", index, "options"], message: "A choice needs options" });
      }
    }
    // Name and Phone are on every form: they can be relabelled, not removed.
    for (const [mapsTo, types] of [["name", ["short_text"]], ["phone", ["phone"]]] as const) {
      const found = doc.fields.filter((item) => item.maps_to === mapsTo);
      if (found.length !== 1 || !(types as readonly string[]).includes(found[0].type)) {
        ctx.addIssue({ code: "custom", path: ["fields"], message: `A form has exactly one ${mapsTo} field` });
      }
    }
    if (doc.after_submit.mode === "redirect" && !isHttpUrl(doc.after_submit.url)) {
      ctx.addIssue({ code: "custom", path: ["after_submit", "url"], message: "A redirect needs a web address" });
    }
  });

export type FormDocument = z.infer<typeof formDocumentSchema>;
/** A document as written by hand or stored: defaults may be left out. */
export type FormDocumentInput = z.input<typeof formDocumentSchema>;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** The text in the visitor's language, else the form's default language, else any. */
export function pick(value: Localized | undefined, language: FormLanguage, fallback: FormLanguage): string {
  if (!value) return "";
  return (value[language] || value[fallback] || FORM_LANGUAGES.map((code) => value[code]).find(Boolean) || "").trim();
}

/**
 * The language a visitor reads the form in: the one they chose, else the
 * first of their browser's languages the form has, else the form's default.
 */
export function visitorLanguage(
  doc: Pick<FormDocument, "languages" | "default_language">,
  chosen: string | null | undefined,
  acceptLanguage: string | null | undefined,
): FormLanguage {
  const offered = (code: string | null | undefined): code is FormLanguage =>
    doc.languages.some((language) => language === code);
  if (offered(chosen)) return chosen;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const code = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (offered(code)) return code;
  }
  return doc.default_language;
}
