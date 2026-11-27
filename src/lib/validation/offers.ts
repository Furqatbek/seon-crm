import { z } from "zod";

// Vouchers and free open lessons — docs/STUDENT_APP_SPEC.md → "Rules →
// Vouchers" and "Rules → Free open lessons".

export const VOUCHER_TYPES = ["percent", "fixed", "trial_week"] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];
export type VoucherStatus = "issued" | "redeemed" | "expired";
export type BookingStatus = "booked" | "cancelled" | "came" | "no_show";
export const SLOT_LEVELS = ["any", "beginner", "topik1", "topik2"] as const;

export type OfferErrorKey =
  | "generic"
  | "notAllowed"
  | "notFound"
  | "valueRange"
  | "noType"
  | "titleRequired"
  | "tooLong"
  | "timeInvalid"
  | "seatsInvalid"
  | "durationInvalid";

export type OfferResult = { ok: true } | { ok: false; error: OfferErrorKey };

const whole = (min: number, max: number) => z.coerce.number("valueRange").int("valueRange").min(min, "valueRange").max(max, "valueRange");

/** Settings → Vouchers: each type on or off, its weight in the draw and its value; how long a voucher is valid. */
export const voucherSettingsSchema = z
  .object({
    percent_enabled: z.boolean(),
    percent_weight: whole(0, 100),
    percent_value: whole(1, 100),
    fixed_enabled: z.boolean(),
    fixed_weight: whole(0, 100),
    fixed_value: whole(1000, 100_000_000),
    trial_enabled: z.boolean(),
    trial_weight: whole(0, 100),
    trial_value: whole(1, 31),
    valid_days: whole(1, 90),
  })
  .superRefine((value, ctx) => {
    // With nothing to draw, nobody would get a voucher.
    const drawable = (value.percent_enabled && value.percent_weight > 0) || (value.fixed_enabled && value.fixed_weight > 0) || (value.trial_enabled && value.trial_weight > 0);
    if (!drawable) ctx.addIssue({ code: "custom", path: ["percent_enabled"], message: "noType" });
  });
export type VoucherSettingsInput = z.input<typeof voucherSettingsSchema>;
export type VoucherSettingsValues = z.output<typeof voucherSettingsSchema>;

/** A weekly open-lesson slot. */
export const slotSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1, "titleRequired").max(120, "tooLong"),
  korean_level: z.enum(SLOT_LEVELS),
  weekday: z.coerce.number().int().min(1).max(7),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "timeInvalid"),
  duration_min: z.coerce.number("durationInvalid").int("durationInvalid").min(15, "durationInvalid").max(240, "durationInvalid"),
  room: z.string().trim().max(60, "tooLong"),
  teacher_id: z.union([z.uuid(), z.literal("")]),
  seats: z.coerce.number("seatsInvalid").int("seatsInvalid").min(1, "seatsInvalid").max(200, "seatsInvalid"),
  is_active: z.boolean(),
});
export type SlotInput = z.input<typeof slotSchema>;
export type SlotValues = z.output<typeof slotSchema>;

export const markSchema = z.object({ booking_id: z.uuid(), status: z.enum(["booked", "came", "no_show"]) });

/** The enrol sheet asks what a code would do to the first charge. */
export const voucherProposalSchema = z.object({
  group_id: z.uuid(),
  joined_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  discount_kind: z.enum(["none", "percent", "amount"]),
  discount_value: z.string(),
  charge_mode: z.enum(["prorated", "full", "custom"]),
  code: z.string().trim().min(1).max(20),
});
