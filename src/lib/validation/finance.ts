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

export const EXPENSE_CATEGORIES = ["rent", "utilities", "marketing", "supplies", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Add expense: owner only. */
export const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES, "categoryRequired"),
  amount: positiveMoney("amountInvalid"),
  spent_on: day,
  note: z
    .string()
    .trim()
    .max(500, "tooLong")
    .transform((value) => value || null),
});
export type ExpenseInput = z.input<typeof expenseSchema>;
export type ExpenseValues = z.output<typeof expenseSchema>;

/** Whole soʻm, 0 or more; an empty field is 0. */
const optionalMoney = z.string().transform((value, ctx) => {
  if (value.trim() === "") return 0;
  const amount = parseMoneyInput(value);
  if (amount === null) {
    ctx.addIssue({ code: "custom", message: "amountInvalid" });
    return z.NEVER;
  }
  return amount;
});

/** Bonus and deduction on a draft payout: either one needs a note. */
export const payoutAdjustmentSchema = z
  .object({
    payout_id: z.uuid(),
    bonus: optionalMoney,
    deduction: optionalMoney,
    note: z.string().trim().max(500, "tooLong"),
  })
  .refine((value) => (value.bonus === 0 && value.deduction === 0) || value.note !== "", {
    path: ["note"],
    message: "adjustmentNoteRequired",
  });
export type PayoutAdjustmentInput = z.input<typeof payoutAdjustmentSchema>;
export type PayoutAdjustmentValues = z.output<typeof payoutAdjustmentSchema>;

/** Mark paid: the payout and the amount the owner saw when confirming. */
export const markPaidSchema = z.object({
  payout_id: z.uuid(),
  expected: z.number().int(),
});

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
  | "monthInFuture"
  | "categoryRequired"
  | "adjustmentNoteRequired"
  | "deductionTooLarge"
  | "alreadyPaid"
  | "payoutChanged"
  | "alreadyVoided"
  | "notFound"
  | "notAllowed"
  | "generic";

export type FinanceResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: FinanceErrorKey };

export const FINANCE_TABS = ["payments", "debtors", "charges", "expenses", "salaries", "adjustments"] as const;
/** The tabs a manager has; the rest are the owner's. */
export const MANAGER_FINANCE_TABS = ["payments", "debtors"] as const satisfies readonly (typeof FINANCE_TABS)[number][];
export type FinanceTab = (typeof FINANCE_TABS)[number];

/** URL state of /finance. */
export const financeSearchSchema = z.object({
  tab: z.enum(FINANCE_TABS).catch("payments"),
  month: monthParam,
  method: z.enum(PAYMENT_METHODS).optional().catch(undefined),
  category: z.enum(EXPENSE_CATEGORIES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});
export type FinanceSearch = z.output<typeof financeSearchSchema>;
