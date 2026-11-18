// Turns whatever a website sends into a lead. docs/SPEC.md → "Lead forms
// add-on → Public intake URL and Meta lead ads": each source has a field map
// from incoming names to lead fields; common names are recognised without
// setup; unmapped fields go to the lead's answers.

import type { FormLanguage } from "../forms/document.ts";
import type { LeadCheck } from "./intake.ts";
import { LONG_TEXT_MAX, SHORT_TEXT_MAX, normalizeIntakePhone, type AnswerError, type StoredAnswer } from "./validator.ts";

/** Where an incoming field goes. "answer" keeps it with the lead's answers; "ignore" drops it. */
export const MAP_TARGETS = ["name", "phone", "subject", "preferred_time", "notes", "language", "answer", "ignore"] as const;
export type MapTarget = (typeof MAP_TARGETS)[number];
export type FieldMap = Record<string, MapTarget>;

/** Lower case, with spaces, dashes, underscores and brackets taken out: "Full Name", "full_name" and "fullName" are one name. */
export const fieldKey = (name: string) => name.toLowerCase().replace(/[\s_\-.[\]()'’ʻʼ:*]/g, "");

/** Names recognised without setup, in English, Uzbek and Russian. */
export const BUILT_IN: Record<Exclude<MapTarget, "answer" | "ignore">, readonly string[]> = {
  name: ["name", "fullname", "yourname", "fio", "ism", "ismi", "ismingiz", "ismfamiliya", "fish", "имя", "вашеимя", "фио", "имяифамилия"],
  phone: ["phone", "phonenumber", "tel", "telephone", "telefon", "telefonraqami", "telefonraqam", "raqam", "mobile", "mobilephone", "телефон", "номертелефона", "номер", "вашномер", "вашномертелефона"],
  subject: ["subject", "course", "kurs", "fan", "курс", "предмет"],
  preferred_time: ["preferredtime", "time", "qulayvaqt", "vaqt", "удобноевремя", "время"],
  notes: ["notes", "note", "message", "comment", "comments", "izoh", "xabar", "сообщение", "комментарий"],
  language: ["language", "lang", "til", "язык"],
};
/** A first and a last name sent apart are put together. */
const FIRST_NAME = ["firstname", "first", "givenname"];
const LAST_NAME = ["lastname", "last", "surname", "familyname", "familiya", "фамилия"];
/** Never part of a lead: the key itself, and a builder's connection test. */
const RESERVED = ["key", "test"];

const builtIn = new Map<string, MapTarget>();
for (const [target, names] of Object.entries(BUILT_IN)) for (const name of names) builtIn.set(fieldKey(name), target as MapTarget);

/** Any value a JSON or form body can hold, as one line of text. */
function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  return JSON.stringify(value);
}

/** A source's own map, cleaned: only known targets, names compared loosely. */
export function parseFieldMap(value: unknown): FieldMap {
  const map: FieldMap = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return map;
  for (const [name, target] of Object.entries(value)) {
    if (name.trim() !== "" && (MAP_TARGETS as readonly string[]).includes(target as string)) map[name.trim()] = target as MapTarget;
  }
  return map;
}

/** Where one incoming field goes: the source's own map first, then the built-in names, else the answers. */
export function targetOf(name: string, map: FieldMap): MapTarget | "first_name" | "last_name" {
  const key = fieldKey(name);
  for (const [mapped, target] of Object.entries(map)) if (fieldKey(mapped) === key) return target;
  if (RESERVED.includes(key)) return "ignore";
  if (FIRST_NAME.includes(key)) return "first_name";
  if (LAST_NAME.includes(key)) return "last_name";
  return builtIn.get(key) ?? "answer";
}

export type MappedLead = {
  check: LeadCheck;
  language: FormLanguage | null;
  /** True when a phone was sent at all (right or wrong): the test-request rule asks. */
  hasPhone: boolean;
};

/**
 * A request body → a checked lead. The same rules as a form: a name and a
 * phone are required, the phone is an Uzbek number in any spelling or a full
 * international one, and texts have the same length limits.
 */
export function mapLead(body: Record<string, unknown>, fieldMap: FieldMap): MappedLead {
  const found: Record<"name" | "phone" | "subject" | "preferred_time" | "notes" | "first_name" | "last_name", string[]> = {
    name: [],
    phone: [],
    subject: [],
    preferred_time: [],
    notes: [],
    first_name: [],
    last_name: [],
  };
  const answers: StoredAnswer[] = [];
  let language: FormLanguage | null = null;

  for (const [name, raw] of Object.entries(body)) {
    const value = text(raw);
    if (value === "") continue;
    const target = targetOf(name, fieldMap);
    if (target === "ignore") continue;
    if (target === "language") {
      const code = value.slice(0, 2).toLowerCase();
      if (code === "uz" || code === "ru" || code === "en") language = code;
    } else if (target === "answer") {
      // The label is the field's name as the website sent it.
      answers.push({ id: fieldKey(name).slice(0, 40) || "field", type: "short_text", label: name.slice(0, SHORT_TEXT_MAX), value: value.slice(0, LONG_TEXT_MAX) });
    } else {
      found[target].push(value);
    }
  }

  const fullName = found.name[0] ?? [found.first_name[0], found.last_name[0]].filter(Boolean).join(" ");
  const errors: Record<string, AnswerError> = {};
  if (fullName === "") errors.name = "required";
  else if (fullName.length > SHORT_TEXT_MAX) errors.name = "too_long";
  const phone = found.phone[0] ? normalizeIntakePhone(found.phone[0]) : null;
  if (!found.phone[0]) errors.phone = "required";
  else if (!phone) errors.phone = "phone";
  const joined = (values: string[], separator: string) => (values.length > 0 ? values.join(separator) : null);
  const subject = joined(found.subject, ", ");
  const preferredTime = joined(found.preferred_time, ", ");
  const notes = joined(found.notes, "\n");
  if (subject && subject.length > SHORT_TEXT_MAX) errors.subject = "too_long";
  if (preferredTime && preferredTime.length > SHORT_TEXT_MAX) errors.preferred_time = "too_long";
  if (notes && notes.length > LONG_TEXT_MAX) errors.notes = "too_long";

  const hasPhone = found.phone.length > 0;
  if (Object.keys(errors).length > 0 || !phone) return { check: { ok: false, errors }, language, hasPhone };
  return {
    check: { ok: true, lead: { fullName, phone, subject, preferredTime, notes, answers: answers.slice(0, 50) } },
    language,
    hasPhone,
  };
}
