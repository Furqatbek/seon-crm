import { describe, expect, it } from "vitest";

import { BLANK_DOCUMENT } from "./blank";
import { formDocumentSchema, formDraftSchema } from "./document";
import { MAPS_TO_BY_TYPE, isLocked, missingIn, missingLanguages, moveField, newField, newOption, uniqueId } from "./fields";
import { FORM_TEMPLATES } from "./templates";
import { embedSnippet, formsBaseUrl, slugProblem, slugify } from "./url";

const blank = formDocumentSchema.parse(BLANK_DOCUMENT);
const course = formDocumentSchema.parse(FORM_TEMPLATES[0].document);

describe("editing a form document", () => {
  it("the blank form is a complete form: name, phone and a required consent box", () => {
    expect(blank.fields.map((field) => [field.id, field.maps_to, field.required])).toEqual([
      ["name", "name", true],
      ["phone", "phone", true],
      ["consent", "custom", true],
    ]);
    expect(blank.fields.filter(isLocked).map((field) => field.id)).toEqual(["name", "phone"]);
  });

  it("a new field has an id of its own and a label in each of the form's languages", () => {
    const first = newField("dropdown", course);
    expect(first).toMatchObject({ id: "dropdown", type: "dropdown", maps_to: "custom", required: false, width: "full" });
    expect(Object.keys(first.label)).toEqual(["uz", "ru", "en"]);
    expect(first.options.map((option) => option.id)).toEqual(["option", "option_2"]);
    expect(first.options[1].label.ru).toBe("Вариант 2");
    const second = newField("dropdown", { ...course, fields: [...course.fields, first] });
    expect(second.id).toBe("dropdown_2");
    expect(newField("short_text", { fields: [], languages: ["ru"] }).label).toEqual({ ru: "Вопрос" });
    expect(newField("consent", course).required).toBe(true);
    expect(uniqueId("time", ["time", "time_2"])).toBe("time_3");
    expect(newOption(first.options, ["en"])).toEqual({ id: "option_3", label: { en: "Option 3" } });
  });

  it("a half-finished draft is saved but not published", () => {
    const draft = { ...course, fields: course.fields.map((field) => (field.id === "level" ? { ...field, options: [] } : field)) };
    expect(formDraftSchema.safeParse(draft).success).toBe(true);
    expect(formDocumentSchema.safeParse(draft).success).toBe(false);
    const redirect = { ...course, after_submit: { mode: "redirect" as const, url: "" } };
    expect(formDraftSchema.safeParse(redirect).success).toBe(true);
    expect(formDocumentSchema.safeParse(redirect).success).toBe(false);
    expect(formDraftSchema.safeParse({ ...course, design: { ...course.design, font: "Comic Sans" } }).success).toBe(false);
  });

  it("marks the languages in which a field's texts are missing", () => {
    const level = course.fields.find((field) => field.id === "level")!;
    expect(missingLanguages(level, course)).toEqual([]);
    expect(missingLanguages({ ...level, label: { uz: "Daraja", ru: " " } }, course)).toEqual(["ru", "en"]);
    const options = level.options.map((option, index) => (index === 0 ? { ...option, label: { ...option.label, en: "" } } : option));
    expect(missingLanguages({ ...level, options }, course)).toEqual(["en"]);
    // A help text written in one language is expected in the others; none at all is fine.
    expect(missingLanguages({ ...level, help: { uz: "Yordam" } }, course)).toEqual(["ru", "en"]);
    // Only the form's own languages count.
    expect(missingLanguages({ ...level, label: { uz: "Daraja" } }, { ...course, languages: ["uz"] })).toEqual([]);
    // The consent box is judged by the consent text.
    const consent = course.fields.find((field) => field.type === "consent")!;
    expect(missingLanguages(consent, { ...course, texts: { ...course.texts, consent_text: { uz: "Roziman" } } })).toEqual(["ru", "en"]);
    expect(missingIn([course.texts.title, { uz: "x", ru: "y" }], course.languages)).toEqual(["en"]);
  });

  it("moves a field and leaves the list alone for a move to nowhere", () => {
    const ids = (fields: typeof course.fields) => fields.map((field) => field.id);
    expect(ids(moveField(course.fields, 2, 0))).toEqual(["level", "name", "phone", "time", "comment", "consent"]);
    expect(ids(moveField(course.fields, 0, 5))).toEqual(["phone", "level", "time", "comment", "consent", "name"]);
    expect(moveField(course.fields, 1, 1)).toBe(course.fields);
    expect(moveField(course.fields, 1, 9)).toBe(course.fields);
  });

  it("each type maps only where the spec allows", () => {
    expect(MAPS_TO_BY_TYPE.short_text).toEqual(["custom", "subject", "preferred_time", "notes"]);
    expect(MAPS_TO_BY_TYPE.long_text).toEqual(["custom", "notes"]);
    expect(MAPS_TO_BY_TYPE.dropdown).toEqual(["custom", "subject", "preferred_time"]);
    expect(MAPS_TO_BY_TYPE.phone).toEqual(["phone"]);
    for (const type of ["email", "number", "date", "multiple_choice", "hidden"] as const) expect(MAPS_TO_BY_TYPE[type]).toEqual(["custom"]);
  });
});

describe("a form's address", () => {
  it("is lowercase Latin letters, digits and hyphens, and not a reserved word", () => {
    for (const good of ["ielts-autumn", "topik2", "a1"]) expect(slugProblem(good), good).toBe(null);
    for (const bad of ["Ielts", "ielts_autumn", "-ielts", "ielts-", "a", "ielts--autumn", "курс", "x".repeat(61), ""]) expect(slugProblem(bad), bad).toBe("format");
    for (const reserved of ["api", "admin", "form", "forms", "uz", "ru", "en", "ko"]) expect(slugProblem(reserved), reserved).toBe("reserved");
  });

  it("is made from a title", () => {
    expect(slugify("Kursga yozilish")).toBe("kursga-yozilish");
    expect(slugify("Oʻquv markazi — 2026!")).toBe("oquv-markazi-2026");
    expect(slugify("Запись на курс")).toBe("");
  });

  it("is served over https, except on this machine", () => {
    expect(formsBaseUrl("Forms.YourCentre.uz ")).toBe("https://forms.yourcentre.uz");
    expect(formsBaseUrl("forms.localhost:3000")).toBe("http://forms.localhost:3000");
    expect(formsBaseUrl("")).toBe(null);
    expect(formsBaseUrl(undefined)).toBe(null);
  });

  it("the embed snippet is an iframe that listens for its own form's height", () => {
    const snippet = embedSnippet("https://forms.yourcentre.uz", "free-trial", 'Trial "lesson" <1>');
    expect(snippet).toContain('src="https://forms.yourcentre.uz/free-trial?embed=1"');
    expect(snippet).toContain('title="Trial &quot;lesson&quot; &lt;1>"');
    expect(snippet).toContain('e.origin==="https://forms.yourcentre.uz"');
    expect(snippet).toContain('e.data.slug==="free-trial"');
    expect(snippet).toContain('getElementById("lead-form-free-trial").style.height=e.data.height+"px"');
  });
});
