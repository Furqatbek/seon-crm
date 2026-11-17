import { z } from "zod";

// Points — docs/SPEC.md → "Points and rewards add-on → Point rules".
// Messages are keys under points.errors in messages/*.json. The database
// enforces every limit again (award_points, adjust_points and the checks on
// points_settings and point_presets).

export const PRESET_KINDS = ["award", "deduction"] as const;
export type PresetKind = (typeof PRESET_KINDS)[number];

/** The owner adjusts at most this many points in one go. */
export const ADJUST_MAX = 10_000;

const reason = z.string().trim().max(200, "tooLong");
const whole = (min: number, max: number) =>
  z.coerce.number("valueInvalid").int("valueInvalid").min(min, "valueInvalid").max(max, "valueInvalid");

/** A teacher's award or deduction: a preset, or a custom amount with a reason. */
export const awardSchema = z
  .object({
    student_id: z.uuid(),
    group_id: z.uuid(),
    lesson_id: z.uuid().nullish(),
    preset_id: z.uuid().nullish(),
    /** Signed: negative takes points away. Ignored when a preset is given. */
    points: z.number().int("amountInvalid").optional(),
    reason,
  })
  .superRefine((value, ctx) => {
    if (value.preset_id) return;
    if (!value.points) ctx.addIssue({ code: "custom", path: ["points"], message: "amountInvalid" });
    if (!value.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "reasonRequired" });
  });

/** Owner adjustment: any amount, reason required. */
export const adjustSchema = z.object({
  student_id: z.uuid(),
  kind: z.enum(["add", "take"]),
  amount: z.coerce.number("amountInvalid").int("amountInvalid").min(1, "amountInvalid").max(ADJUST_MAX, "amountInvalid"),
  reason: reason.min(1, "reasonRequired"),
});
export type AdjustInput = z.input<typeof adjustSchema>;
export type AdjustValues = z.output<typeof adjustSchema>;

/** Settings → Points: on or off, every value and both limits. */
export const pointsSettingsSchema = z.object({
  enabled: z.boolean(),
  present: whole(0, 1000),
  late: whole(0, 1000),
  perfect_month: whole(0, 1000),
  perfect_month_min_lessons: whole(1, 31),
  on_time: whole(0, 1000),
  referral: whole(0, 1000),
  max_per_action: whole(1, 100),
  teacher_daily_cap: whole(1, 1000),
});
export type PointsSettingsInput = z.input<typeof pointsSettingsSchema>;
export type PointsSettingsValues = z.output<typeof pointsSettingsSchema>;

const label = z.string().trim().min(1, "labelRequired").max(60, "tooLong");

/** One preset, in three languages. */
export const presetSchema = z.object({
  id: z.uuid().optional(),
  kind: z.enum(PRESET_KINDS),
  points: whole(1, 100),
  label_uz: label,
  label_ru: label,
  label_en: label,
  is_active: z.boolean(),
});
export type PresetInput = z.input<typeof presetSchema>;
export type PresetValues = z.output<typeof presetSchema>;

export type PointsErrorKey =
  | "programmeOff"
  | "amountInvalid"
  | "reasonRequired"
  | "dailyLimit"
  | "notInGroup"
  | "undoTooLate"
  | "notEnough"
  | "valueInvalid"
  | "labelRequired"
  | "tooLong"
  | "notAllowed"
  | "notFound"
  | "generic";

/** Database error codes → message keys. */
export const POINTS_ERRORS: Record<string, PointsErrorKey> = {
  EP001: "programmeOff",
  EP002: "amountInvalid",
  EP003: "reasonRequired",
  EP004: "dailyLimit",
  EP005: "notInGroup",
  EP006: "undoTooLate",
  EP007: "notEnough",
  "42501": "notAllowed",
  P0002: "notFound",
};

export type PointsResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: PointsErrorKey; /** Points left today, or the balance, when the database says so. */ detail?: number };
