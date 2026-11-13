import { z } from "zod";

import { parseMoneyInput } from "@/lib/domain/pay-rates";
import { isRealDay } from "@/lib/domain/payments";

// Messages are keys under finance.errors in messages/*.json.

// A day on the calendar: "2026-02-31" is refused here, not later.
const day = z.string().refine(isRealDay, "dateInvalid");
const monthParam = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .optional()
  .catch(undefined);

/** Whole soʻm above 0, typed by a person. */
const positiveMoney = (message: string) =>
  z.string().transform((value, ctx) => {
    const amount = parseMoneyInput(value);
    if (amount === null || amount <= 0) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return amount;
  });

export const PAYMENT_METHODS = ["cash", "card", "transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Take payment: amount, method, date and group. */
export const paymentSchema = z.object({
  student_id: z.uuid("studentRequired"),
  group_id: z.uuid("groupRequired"),
  amount: positiveMoney("amountInvalid"),
  method: z.enum(PAYMENT_METHODS, "methodRequired"),
  paid_on: day,
  note: z
    .string()
    .trim()
    .max(500, "tooLong")
    .transform((value) => value || null),
});
export type PaymentInput = z.input<typeof paymentSchema>;
export type PaymentValues = z.output<typeof paymentSchema>;

/** Void payment: owner only, with a reason. */
export const voidSchema = z.object({
  payment_id: z.uuid(),
  reason: z.string().trim().min(1, "reasonRequired").max(300, "tooLong"),
});

/** Add credit: a negative adjustment, always with a note. */
export const creditSchema = z.object({
  student_id: z.uuid(),
  group_id: z.union([z.uuid(), z.literal("")]).transform((value) => value || null),
  amount: positiveMoney("amountInvalid"),
  note: z.string().trim().min(1, "noteRequired").max(500, "tooLong"),
});
export type CreditInput = z.input<typeof creditSchema>;
export type CreditValues = z.output<typeof creditSchema>;

export type FinanceErrorKey =
  | "studentRequired"
  | "groupRequired"
  | "amountInvalid"
  | "methodRequired"
  | "dateInvalid"
  | "dateInFuture"
  | "noteRequired"
  | "reasonRequired"
  | "tooLong"
  | "monthNotCurrent"
  | "alreadyVoided"
  | "notFound"
  | "notAllowed"
  | "generic";

export type FinanceResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: FinanceErrorKey };

export const FINANCE_TABS = ["payments", "debtors", "charges"] as const;
export type FinanceTab = (typeof FINANCE_TABS)[number];

/** URL state of /finance. */
export const financeSearchSchema = z.object({
  tab: z.enum(FINANCE_TABS).catch("payments"),
  month: monthParam,
  method: z.enum(PAYMENT_METHODS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});
export type FinanceSearch = z.output<typeof financeSearchSchema>;
