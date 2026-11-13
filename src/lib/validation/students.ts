import { z } from "zod";

import { normalizePhone } from "@/lib/domain/leads";

// Messages are keys under students.errors in messages/*.json.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .transform((value) => (value === "" ? null : value));

export const STUDENT_STATUSES = ["active", "paused", "left"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];
export const LANGUAGES = ["uz", "ru", "en"] as const;

export const studentFormSchema = z.object({
  full_name: z.string().trim().min(1, "nameRequired").max(120, "tooLong"),
  phone: z.string().transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "phoneInvalid" });
      return z.NEVER;
    }
    return phone;
  }),
  parent_name: optionalText(120),
  // Optional, but if anything is typed it must be a real number.
  parent_phone: z.string().transform((value, ctx) => {
    if (value.replace(/[\s+]/g, "") === "" || value.trim() === "+998") return null;
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "parentPhoneInvalid" });
      return z.NEVER;
    }
    return phone;
  }),
  birth_date: z.union([day, z.literal("")]).transform((value) => value || null),
  language: z.enum(LANGUAGES, "languageRequired"),
  notes: optionalText(2000),
});
export type StudentFormInput = z.input<typeof studentFormSchema>;
export type StudentFormValues = z.output<typeof studentFormSchema>;

export type StudentErrorKey =
  | "nameRequired"
  | "phoneInvalid"
  | "parentPhoneInvalid"
  | "dateInvalid"
  | "languageRequired"
  | "tooLong"
  | "leadNotOpen"
  | "notFound"
  | "notAllowed"
  | "generic";

export type StudentResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: StudentErrorKey };

/** URL state of /students. */
export const studentsSearchSchema = z.object({
  q: z.string().max(80).catch(""),
  status: z.enum(STUDENT_STATUSES).optional().catch(undefined),
  group: z.uuid().optional().catch(undefined),
  debt: z.literal("1").optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});
export type StudentsSearch = z.output<typeof studentsSearchSchema>;

export const STUDENT_TABS = ["overview", "ledger", "attendance", "messages"] as const;
export type StudentTab = (typeof STUDENT_TABS)[number];

/** URL state of /students/[id]. */
export const studentSearchSchema = z.object({
  tab: z.enum(STUDENT_TABS).catch("overview"),
  // Attendance month, "YYYY-MM".
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
});
