// What the editor knows about field types, and small pure helpers for
// changing a form document. docs/SPEC.md → "Lead forms add-on → Form builder".

import {
  CHOICE_TYPES,
  DISPLAY_TYPES,
  FORM_LANGUAGES,
  type FieldType,
  type FormDocument,
  type FormField,
  type FormLanguage,
  type Localized,
  type MapsTo,
} from "./document";

/** The field types offered by "Add field", in the order of the grid. */
export const ADDABLE_TYPES: readonly FieldType[] = [
  "short_text",
  "long_text",
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
];

/** What each type's answer may fill on the lead ("Can map to" in the spec's table). */
export const MAPS_TO_BY_TYPE: Record<FieldType, readonly MapsTo[]> = {
  short_text: ["custom", "subject", "preferred_time", "notes"],
  long_text: ["custom", "notes"],
  phone: ["phone"],
  email: ["custom"],
  number: ["custom"],
  date: ["custom"],
  radio: ["custom", "subject", "preferred_time"],
  dropdown: ["custom", "subject", "preferred_time"],
  multiple_choice: ["custom"],
  consent: ["custom"],
  hidden: ["custom"],
  heading: ["custom"],
  paragraph: ["custom"],
  image: ["custom"],
};

/** Name and Phone are on every form: relabelled, never deleted. */
export function isLocked(field: Pick<FormField, "maps_to">): boolean {
  return field.maps_to === "name" || field.maps_to === "phone";
}

const NEW_LABEL: Record<FieldType, Localized> = {
  short_text: { uz: "Savol", ru: "Вопрос", en: "Question" },
  long_text: { uz: "Izoh", ru: "Комментарий", en: "Comment" },
  phone: { uz: "Telefon raqami", ru: "Номер телефона", en: "Phone number" },
  email: { uz: "Email", ru: "Эл. почта", en: "Email" },
  number: { uz: "Son", ru: "Число", en: "Number" },
  date: { uz: "Sana", ru: "Дата", en: "Date" },
  radio: { uz: "Bittasini tanlang", ru: "Выберите один вариант", en: "Choose one" },
  dropdown: { uz: "Roʻyxatdan tanlang", ru: "Выберите из списка", en: "Choose from the list" },
  multiple_choice: { uz: "Bir nechtasini tanlang", ru: "Выберите несколько", en: "Choose any" },
  consent: {},
  hidden: { uz: "Yashirin qiymat", ru: "Скрытое значение", en: "Hidden value" },
  heading: { uz: "Sarlavha", ru: "Заголовок", en: "Heading" },
  paragraph: { uz: "Matn", ru: "Текст", en: "Text" },
  image: { uz: "Rasm", ru: "Изображение", en: "Image" },
};

const OPTION_LABEL: Localized = { uz: "Variant", ru: "Вариант", en: "Option" };

/** An id no other field (or option) in the list has: "dropdown", "dropdown_2", … */
export function uniqueId(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.includes(`${base}_${n}`)) return `${base}_${n}`;
}

const only = (text: Localized, languages: readonly FormLanguage[]): Localized =>
  Object.fromEntries(languages.filter((code) => text[code]).map((code) => [code, text[code]]));

export function newOption(options: FormField["options"], languages: readonly FormLanguage[]): FormField["options"][number] {
  const id = uniqueId("option", options.map((option) => option.id));
  const number = options.length + 1;
  return { id, label: Object.fromEntries(languages.map((code) => [code, `${OPTION_LABEL[code]} ${number}`])) };
}

/** A new field of this type, labelled in each of the form's languages. */
export function newField(type: FieldType, document: Pick<FormDocument, "fields" | "languages">): FormField {
  const field: FormField = {
    id: uniqueId(type, document.fields.map((item) => item.id)),
    type,
    maps_to: "custom",
    label: only(NEW_LABEL[type], document.languages),
    placeholder: {},
    help: {},
    required: type === "consent",
    width: "full",
    options: [],
    value: "",
  };
  if (CHOICE_TYPES.includes(type)) {
    field.options = [newOption([], document.languages)];
    field.options.push(newOption(field.options, document.languages));
  }
  return field;
}

/** Which texts a field shows, so a missing translation can be marked. */
function fieldTexts(field: FormField, document: Pick<FormDocument, "texts">): Localized[] {
  if (field.type === "consent") return [document.texts.consent_text];
  if (field.type === "hidden" || field.type === "image") return [];
  const texts = [field.label];
  // A placeholder or help text written in one language is expected in the others.
  for (const optional of [field.placeholder, field.help]) {
    if (FORM_LANGUAGES.some((code) => optional[code]?.trim())) texts.push(optional);
  }
  for (const option of field.options) texts.push(option.label);
  return texts;
}

export const isMissing = (text: Localized | undefined, language: FormLanguage) => !text?.[language]?.trim();

/** The form's languages in which this field still lacks a text. */
export function missingLanguages(field: FormField, document: Pick<FormDocument, "texts" | "languages">): FormLanguage[] {
  const texts = fieldTexts(field, document);
  return document.languages.filter((language) => texts.some((text) => isMissing(text, language)));
}

/** The same for a group of the form's own texts (title, button, thank-you…). */
export function missingIn(texts: (Localized | undefined)[], languages: readonly FormLanguage[]): FormLanguage[] {
  return languages.filter((language) => texts.some((text) => isMissing(text, language)));
}

export function moveField(fields: FormField[], from: number, to: number): FormField[] {
  if (from === to || from < 0 || to < 0 || from >= fields.length || to >= fields.length) return fields;
  const next = [...fields];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export const answersNothing = (type: FieldType) => DISPLAY_TYPES.includes(type);
