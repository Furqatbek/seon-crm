import { z } from "zod";

import { UI_LANGUAGES } from "./settings";

// Card payments and receipts — docs/STUDENT_APP_SPEC.md → "Rules → Receipts".

export type ReceiptStatus = "pending" | "approved" | "rejected";

export type PaymentSettingsErrorKey = "generic" | "notAllowed" | "cardInvalid" | "holderRequired" | "tooLong";
export type PaymentSettingsResult = { ok: true } | { ok: false; error: PaymentSettingsErrorKey };

const instruction = z.string().trim().max(1000, "tooLong");

/**
 * Settings → Payments: the card students transfer to, and the instructions in
 * the app's four languages. An empty card number switches Pay by card off.
 */
export const paymentSettingsSchema = z
  .object({
    card_number: z
      .string()
      .transform((value) => value.replace(/[\s-]/g, ""))
      .refine((value) => value === "" || /^\d{16}$/.test(value), "cardInvalid"),
    card_holder: z.string().trim().max(100, "tooLong"),
    bank: z.string().trim().max(100, "tooLong"),
    instructions: z.object(Object.fromEntries(UI_LANGUAGES.map((code) => [code, instruction])) as Record<(typeof UI_LANGUAGES)[number], typeof instruction>),
  })
  .superRefine((value, ctx) => {
    if (value.card_number !== "" && value.card_holder === "") ctx.addIssue({ code: "custom", path: ["card_holder"], message: "holderRequired" });
  });
export type PaymentSettingsInput = z.input<typeof paymentSettingsSchema>;

export type ReceiptErrorKey = "generic" | "notAllowed" | "notFound" | "reasonRequired" | "tooLong" | "alreadyReviewed";
export type ReceiptResult = { ok: true } | { ok: false; error: ReceiptErrorKey };

/** Rejecting a receipt needs a reason the student will read. */
export const rejectReceiptSchema = z.object({ receipt_id: z.uuid(), reason: z.string().trim().min(1, "reasonRequired").max(300, "tooLong") });
export type RejectReceiptInput = z.input<typeof rejectReceiptSchema>;

/** "8600123456789012" → "8600 1234 5678 9012" */
export const groupCardNumber = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, "$1 ");
