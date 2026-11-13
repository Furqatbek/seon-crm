import { z } from "zod";

import { ATTENDANCE_STATUSES } from "@/lib/domain/attendance";
import { parseMoneyInput } from "@/lib/domain/pay-rates";

// Messages are keys under groups.errors in messages/*.json.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .transform((value) => (value === "" ? null : value));

/** Whole soʻm typed by a person; `min` is the smallest amount accepted. */
const money = (message: string, min: number) =>
  z.string().transform((value, ctx) => {
    const amount = parseMoneyInput(value);
    if (amount === null || amount < min) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return amount;
  });

const wholeNumber = (message: string, min: number, max: number) =>
  z.string().transform((value, ctx) => {
    const number = /^\d{1,4}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
    if (!Number.isInteger(number) || number < min || number > max) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return number;
  });

export const GROUP_STATUSES = ["forming", "active", "finished"] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const groupFormSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(120, "tooLong"),
  subject: z.string().trim().min(1, "subjectRequired").max(120, "tooLong"),
  level: optionalText(60),
  teacher_id: z.uuid("teacherRequired"),
  monthly_fee: money("feeInvalid", 0),
  days: z
    .array(z.number().int().min(1).max(7))
    .min(1, "daysRequired")
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "timeInvalid"),
  duration_min: wholeNumber("durationInvalid", 15, 480),
  room: optionalText(60),
  capacity: z.union([z.literal(""), wholeNumber("capacityInvalid", 1, 500)]).transform((value) =>
    value === "" ? null : value,
  ),
  start_date: day,
  status: z.enum(GROUP_STATUSES),
});
export type GroupFormInput = z.input<typeof groupFormSchema>;
export type GroupFormValues = z.output<typeof groupFormSchema>;

// ── Enrol, leave, transfer ──

const discountFields = {
  discount_kind: z.enum(["none", "percent", "amount"]),
  discount_value: z.string(),
};

const chargeFields = {
  charge_mode: z.enum(["prorated", "full", "custom"]),
  custom_amount: z.string(),
  charge_note: z.string().trim().max(500, "tooLong"),
};

type DiscountInput = { discount_kind: "none" | "percent" | "amount"; discount_value: string };
type ChargeInput = { charge_mode: "prorated" | "full" | "custom"; custom_amount: string; charge_note: string };

/** The discount as the database takes it, or an error key. */
export function parseDiscount(
  input: DiscountInput,
): { kind: "percent" | "amount" | null; value: number | null } | { error: "discountInvalid" } {
  if (input.discount_kind === "none") return { kind: null, value: null };
  const value = parseMoneyInput(input.discount_value);
  if (value === null || value < 1) return { error: "discountInvalid" };
  if (input.discount_kind === "percent" && value > 100) return { error: "discountInvalid" };
  return { kind: input.discount_kind, value };
}

function refineDiscount(input: DiscountInput, ctx: z.RefinementCtx) {
  if ("error" in parseDiscount(input)) {
    ctx.addIssue({ code: "custom", message: "discountInvalid", path: ["discount_value"] });
  }
}

function refineCharge(input: ChargeInput, ctx: z.RefinementCtx) {
  if (input.charge_mode !== "custom") return;
  if (parseMoneyInput(input.custom_amount) === null) {
    ctx.addIssue({ code: "custom", message: "customAmountInvalid", path: ["custom_amount"] });
  }
  // A custom amount always says why.
  if (input.charge_note === "") {
    ctx.addIssue({ code: "custom", message: "chargeNoteRequired", path: ["charge_note"] });
  }
}

function refineCredit(input: { credit_amount: string; credit_note: string }, ctx: z.RefinementCtx) {
  if (input.credit_amount.trim() === "") return;
  const amount = parseMoneyInput(input.credit_amount);
  if (amount === null) {
    ctx.addIssue({ code: "custom", message: "creditInvalid", path: ["credit_amount"] });
  } else if (amount > 0 && input.credit_note === "") {
    ctx.addIssue({ code: "custom", message: "creditNoteRequired", path: ["credit_note"] });
  }
}

export const enrolSchema = z
  .object({
    student_id: z.uuid("studentRequired"),
    group_id: z.uuid("groupRequired"),
    joined_on: day,
    note: z.string().trim().max(500, "tooLong"),
    ...discountFields,
    ...chargeFields,
  })
  .superRefine((input, ctx) => {
    refineDiscount(input, ctx);
    refineCharge(input, ctx);
  });
export type EnrolInput = z.input<typeof enrolSchema>;

export const leaveSchema = z
  .object({
    enrollment_id: z.uuid(),
    left_on: day,
    credit_amount: z.string(),
    credit_note: z.string().trim().max(500, "tooLong"),
  })
  .superRefine(refineCredit);
export type LeaveInput = z.input<typeof leaveSchema>;

export const transferSchema = z
  .object({
    enrollment_id: z.uuid(),
    group_id: z.uuid("groupRequired"),
    joined_on: day,
    credit_amount: z.string(),
    credit_note: z.string().trim().max(500, "tooLong"),
    ...discountFields,
    ...chargeFields,
  })
  .superRefine((input, ctx) => {
    refineCredit(input, ctx);
    refineDiscount(input, ctx);
    refineCharge(input, ctx);
  });
export type TransferInput = z.input<typeof transferSchema>;

/** The enrol and transfer sheet: one form, checked on the client before it is sent. */
export const enrolFormSchema = z
  .object({
    student_id: z.uuid("studentRequired"),
    group_id: z.uuid("groupRequired"),
    joined_on: day,
    note: z.string().trim().max(500, "tooLong"),
    credit_amount: z.string(),
    credit_note: z.string().trim().max(500, "tooLong"),
    ...discountFields,
    ...chargeFields,
  })
  .superRefine((input, ctx) => {
    refineCredit(input, ctx);
    refineDiscount(input, ctx);
    refineCharge(input, ctx);
  });
export type EnrolFormInput = z.input<typeof enrolFormSchema>;

export const proposalSchema = z.object({
  group_id: z.uuid(),
  joined_on: day,
  ...discountFields,
});

// ── Lessons ──

export const attendanceSchema = z.object({
  lesson_id: z.uuid(),
  marks: z
    .array(z.object({ student_id: z.uuid(), status: z.enum(ATTENDANCE_STATUSES) }))
    .min(1, "noStudents"),
});

export const cancelLessonSchema = z.object({
  lesson_id: z.uuid(),
  reason: z.string().trim().min(1, "reasonRequired").max(300, "tooLong"),
});

export const substituteSchema = z.object({ lesson_id: z.uuid(), teacher_id: z.uuid("teacherRequired") });

export type GroupErrorKey =
  | "nameRequired"
  | "subjectRequired"
  | "teacherRequired"
  | "feeInvalid"
  | "daysRequired"
  | "timeInvalid"
  | "durationInvalid"
  | "capacityInvalid"
  | "dateInvalid"
  | "tooLong"
  | "studentRequired"
  | "groupRequired"
  | "discountInvalid"
  | "customAmountInvalid"
  | "chargeNoteRequired"
  | "creditInvalid"
  | "creditNoteRequired"
  | "reasonRequired"
  | "noStudents"
  | "alreadyEnrolled"
  | "groupClosed"
  | "dateOutOfRange"
  | "lessonCancelled"
  | "lessonFuture"
  | "notInGroup"
  | "sameGroup"
  | "attendanceLocked"
  | "notFound"
  | "notAllowed"
  | "generic";

export type GroupResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: GroupErrorKey };

// ── URL state ──

export const groupsSearchSchema = z.object({
  tab: z.enum(["today", "all"]).catch("today"),
  q: z.string().max(80).catch(""),
  status: z.enum(GROUP_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
  lesson: z.uuid().optional().catch(undefined),
});
export type GroupsSearch = z.output<typeof groupsSearchSchema>;

export const GROUP_TABS = ["students", "attendance", "lessons", "trials"] as const;
export type GroupTab = (typeof GROUP_TABS)[number];

export const groupSearchSchema = z.object({
  tab: z.enum(GROUP_TABS).catch("students"),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
  lesson: z.uuid().optional().catch(undefined),
});
