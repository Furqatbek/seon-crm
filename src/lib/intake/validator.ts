// Builds the check for one form's answers from its document, and turns checked
// answers into what a lead stores. docs/SPEC.md → "Lead forms add-on → Form builder".

import { z } from "zod";

import { normalizePhone } from "../domain/leads.ts";
import { DISPLAY_TYPES, pick, type FormDocument, type FormField, type FormLanguage } from "../forms/document.ts";

/** Why an answer was refused. The page shows each in the visitor's language. */
export const ANSWER_ERRORS = ["required", "phone", "email", "number", "date", "choice", "too_long"] as const;
export type AnswerError = (typeof ANSWER_ERRORS)[number];

export const SHORT_TEXT_MAX = 200;
export const LONG_TEXT_MAX = 2000;

/** An Uzbek number in any spelling, or a full international number starting with +. */
export function normalizeIntakePhone(input: string): string | null {
  const uzbek = normalizePhone(input);
  if (uzbek) return uzbek;
  const trimmed = input.trim();
  if (!/^\+[\d\s()-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

const fail = (code: AnswerError) => ({ message: code });

/** Whether a visitor answers this field. */
export function isAnswered(field: FormField): boolean {
  return !DISPLAY_TYPES.includes(field.type) && field.type !== "hidden";
}

function fieldSchema(field: FormField): z.ZodType {
  // Name and Phone are required on every form, whatever the document says.
  const required = field.required || field.maps_to === "name" || field.maps_to === "phone";
  const blank = (value: unknown) => (typeof value === "string" ? value.trim() : value);
  const optional = <T extends z.ZodType>(schema: T) =>
    z.preprocess(
      (value) => (blank(value) === "" || value === undefined || value === null ? undefined : blank(value)),
      required ? z.any().refine((value) => value !== undefined, fail("required")).pipe(schema) : schema.optional(),
    );
  const options = field.options.map((option) => option.id);

  switch (field.type) {
    case "short_text":
      return optional(z.string(fail("required")).max(SHORT_TEXT_MAX, fail("too_long")));
    case "long_text":
      return optional(z.string(fail("required")).max(LONG_TEXT_MAX, fail("too_long")));
    case "phone":
      return optional(
        z.string(fail("required")).transform((value, ctx) => {
          const phone = normalizeIntakePhone(value);
          if (!phone) {
            ctx.addIssue({ code: "custom", message: "phone" });
            return z.NEVER;
          }
          return phone;
        }),
      );
    case "email":
      return optional(z.string(fail("required")).max(SHORT_TEXT_MAX, fail("too_long")).pipe(z.email(fail("email"))));
    case "number":
      return optional(
        z.string(fail("required")).regex(/^-?\d{1,12}([.,]\d{1,4})?$/, fail("number")).transform((value) => value.replace(",", ".")),
      );
    case "date":
      return optional(
        z.string(fail("required")).refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), fail("date")),
      );
    case "radio":
    case "dropdown":
      return optional(z.string(fail("required")).refine((value) => options.includes(value), fail("choice")));
    case "multiple_choice":
      return z.preprocess(
        (value) => (value === undefined || value === null || value === "" ? [] : Array.isArray(value) ? value : [value]),
        z
          .array(z.string().refine((value) => options.includes(value), fail("choice")), fail("choice"))
          .max(options.length, fail("choice"))
          .refine((value) => !required || value.length > 0, fail("required"))
          .transform((value) => [...new Set(value)]),
      );
    case "consent":
      return z.preprocess(
        (value) => value === true || value === "on" || value === "true" || value === "1",
        z.boolean().refine((value) => !required || value, fail("required")),
      );
    default:
      return z.any();
  }
}

/** The zod check for one submission: an object keyed by field id. */
export function buildAnswersSchema(document: Pick<FormDocument, "fields">) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of document.fields) {
    if (isAnswered(field)) shape[field.id] = fieldSchema(field);
  }
  return z.object(shape);
}

export type CheckedAnswers = Record<string, string | string[] | boolean | undefined>;

export type AnswersCheck =
  | { ok: true; answers: CheckedAnswers }
  | { ok: false; errors: Record<string, AnswerError> };

export function checkAnswers(document: Pick<FormDocument, "fields">, raw: Record<string, unknown>): AnswersCheck {
  const parsed = buildAnswersSchema(document).safeParse(raw);
  if (parsed.success) return { ok: true, answers: parsed.data as CheckedAnswers };
  const errors: Record<string, AnswerError> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "");
    const code = (ANSWER_ERRORS as readonly string[]).includes(issue.message) ? (issue.message as AnswerError) : "required";
    if (key && !errors[key]) errors[key] = code;
  }
  return { ok: false, errors };
}

/** One answer as the lead keeps it: the label as it read when it was sent. */
export type StoredAnswer = { id: string; type: FormField["type"]; label: string; value: string | boolean };

export type LeadFromForm = {
  fullName: string;
  phone: string;
  subject: string | null;
  preferredTime: string | null;
  notes: string | null;
  answers: StoredAnswer[];
};

/**
 * Checked answers → a lead. Fields mapped to name, phone, subject, preferred
 * time or notes fill the lead's own columns; every other answer, consent and
 * hidden values included, is kept with its label in the visitor's language.
 */
export function leadFromAnswers(document: FormDocument, answers: CheckedAnswers, language: FormLanguage): LeadFromForm {
  const text = (value: Parameters<typeof pick>[0]) => pick(value, language, document.default_language);
  const mapped: Record<"name" | "phone" | "subject" | "preferred_time" | "notes", string[]> = {
    name: [],
    phone: [],
    subject: [],
    preferred_time: [],
    notes: [],
  };
  const stored: StoredAnswer[] = [];

  for (const field of document.fields) {
    if (DISPLAY_TYPES.includes(field.type)) continue;
    const answer = field.type === "hidden" ? field.value : answers[field.id];
    const label = field.type === "consent" ? text(document.texts.consent_text) : text(field.label) || field.id;

    if (field.type === "consent") {
      // Consent is saved as given, with the words the visitor agreed to.
      stored.push({ id: field.id, type: field.type, label, value: answer === true });
      continue;
    }

    const optionLabel = (id: string) => text(field.options.find((option) => option.id === id)?.label) || id;
    const display = Array.isArray(answer)
      ? answer.map(optionLabel).join(", ")
      : typeof answer !== "string" || answer === ""
        ? ""
        : field.type === "radio" || field.type === "dropdown"
          ? optionLabel(answer)
          : answer;
    if (display === "") continue;

    if (field.maps_to === "custom") stored.push({ id: field.id, type: field.type, label, value: display });
    else mapped[field.maps_to].push(display);
  }

  const joined = (values: string[], separator: string) => (values.length > 0 ? values.join(separator) : null);
  return {
    fullName: mapped.name[0] ?? "",
    phone: mapped.phone[0] ?? "",
    subject: joined(mapped.subject, ", "),
    preferredTime: joined(mapped.preferred_time, ", "),
    notes: joined(mapped.notes, "\n"),
    answers: stored,
  };
}
