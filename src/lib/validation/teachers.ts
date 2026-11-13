import { z } from "zod";

import { normalizePhone } from "@/lib/domain/leads";
import {
  PAY_TYPES,
  parseMoneyInput,
  parsePercentInput,
  paysAmount,
} from "@/lib/domain/pay-rates";

// Messages are keys under teachers.errors in messages/*.json.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid");

export const teacherFormSchema = z.object({
  full_name: z.string().trim().min(1, "nameRequired").max(120, "tooLong"),
  phone: z.string().transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "phoneInvalid" });
      return z.NEVER;
    }
    return phone;
  }),
  // Typed as one line, separated by commas.
  subjects: z
    .string()
    .max(300, "tooLong")
    .transform((value) => [
      ...new Set(
        value
          .split(",")
          .map((subject) => subject.trim())
          .filter(Boolean),
      ),
    ]),
  hired_on: z.union([day, z.literal("")]).transform((value) => value || null),
  is_active: z.boolean(),
  notes: z
    .string()
    .trim()
    .max(2000, "tooLong")
    .transform((value) => value || null),
});
export type TeacherFormInput = z.input<typeof teacherFormSchema>;
export type TeacherFormValues = z.output<typeof teacherFormSchema>;

/**
 * Set new rate. Fixed monthly and per lesson need an amount above 0;
 * percent of revenue must be 1–100.
 */
export const payRateFormSchema = z
  .object({
    pay_type: z.enum(PAY_TYPES, "payTypeRequired"),
    // One text box: soʻm for an amount, a number for a percent.
    value: z.string(),
    effective_from: day,
  })
  .transform((input, ctx) => {
    if (paysAmount(input.pay_type)) {
      const amount = parseMoneyInput(input.value);
      if (amount === null || amount <= 0) {
        ctx.addIssue({ code: "custom", message: "amountInvalid", path: ["value"] });
        return z.NEVER;
      }
      return {
        pay_type: input.pay_type,
        amount,
        percent: null,
        effective_from: input.effective_from,
      };
    }
    const percent = parsePercentInput(input.value);
    if (percent === null || percent < 1 || percent > 100) {
      ctx.addIssue({ code: "custom", message: "percentInvalid", path: ["value"] });
      return z.NEVER;
    }
    return {
      pay_type: input.pay_type,
      amount: null,
      percent,
      effective_from: input.effective_from,
    };
  });
export type PayRateFormInput = z.input<typeof payRateFormSchema>;
export type PayRateFormValues = z.output<typeof payRateFormSchema>;

export type TeacherErrorKey =
  | "nameRequired"
  | "phoneInvalid"
  | "dateInvalid"
  | "tooLong"
  | "payTypeRequired"
  | "amountInvalid"
  | "percentInvalid"
  | "rateDateTaken"
  | "notFound"
  | "notAllowed"
  | "generic";

export type TeacherResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: TeacherErrorKey };

/** URL state of /teachers. */
export const teachersSearchSchema = z.object({
  q: z.string().max(80).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
});
export type TeachersSearch = z.output<typeof teachersSearchSchema>;

/** URL state of /teachers/[id]. */
export const teacherSearchSchema = z.object({
  tab: z.enum(["overview", "pay"]).catch("overview"),
});
