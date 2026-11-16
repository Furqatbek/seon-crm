import { z } from "zod";

// Coins — docs/SPEC.md → "Business rules → Coins".
// Messages are keys under coins.errors in messages/*.json.
// The database enforces the same limits in add_coins().

/** A teacher gives this many coins at most in one go. */
export const TEACHER_COINS_MAX = 10;
/** The quick choices on the teacher's Give coins sheet. */
export const TEACHER_COIN_CHOICES = [1, 2, 3, 5, 10] as const;
/** Owner and manager: at most this many in one go. */
export const STAFF_COINS_MAX = 1000;

const reason = z
  .string()
  .trim()
  .max(200, "tooLong")
  .transform((value) => value || null);

const whole = (max: number) =>
  z.coerce.number("amountInvalid").int("amountInvalid").min(1, "amountInvalid").max(max, "amountInvalid");

/** A teacher gives coins to a student of their own group. */
export const giveCoinsSchema = z.object({
  group_id: z.uuid(),
  student_id: z.uuid(),
  amount: whole(TEACHER_COINS_MAX),
  reason,
});

/** Owner or manager: give coins, or spend them (a prize, a correction) with a reason. */
export const staffCoinsSchema = z
  .object({
    group_id: z.uuid(),
    student_id: z.uuid(),
    kind: z.enum(["give", "spend"]),
    amount: whole(STAFF_COINS_MAX),
    reason,
    /** What the student has now; spending more is refused before the database is asked. */
    balance: z.number().int().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind !== "spend") return;
    if (!value.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "reasonRequired" });
    if (value.balance !== undefined && value.amount > value.balance) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "notEnough" });
    }
  });
export type StaffCoinsInput = z.input<typeof staffCoinsSchema>;
export type StaffCoinsValues = z.output<typeof staffCoinsSchema>;

/** What add_coins() is given: spending is a negative amount. */
export function signedAmount(kind: "give" | "spend", amount: number): number {
  return kind === "spend" ? -amount : amount;
}

export type CoinsErrorKey =
  | "amountInvalid"
  | "reasonRequired"
  | "notEnough"
  | "notInGroup"
  | "tooLong"
  | "notFound"
  | "notAllowed"
  | "generic";

export type CoinsResult = { ok: true; balance: number } | { ok: false; error: CoinsErrorKey };

/** add_coins() error codes → messages. */
export const COIN_ERRORS: Record<string, CoinsErrorKey> = {
  "42501": "notAllowed",
  P0002: "notFound",
  ET002: "amountInvalid",
  ET003: "reasonRequired",
  ET004: "notEnough",
  ET005: "notInGroup",
};
