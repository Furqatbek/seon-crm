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

/** The Custom part of a teacher's + / − sheet: 1 to the per-action limit, with a reason. */
export const customPointsSchema = (maxPerAction: number) =>
  z.object({
    amount: z.string().transform((value, ctx) => {
      const amount = Number(value);
      if (!Number.isInteger(amount) || amount < 1 || amount > maxPerAction) {
        ctx.addIssue({ code: "custom", message: "amountInvalid" });
        return z.NEVER;
      }
      return amount;
    }),
    reason: reason.min(1, "reasonRequired"),
  });
export type CustomPointsInput = { amount: string; reason: string };
export type CustomPointsValues = { amount: number; reason: string };

export const BOARD_PERIODS = ["month", "all"] as const;
export type BoardPeriod = (typeof BOARD_PERIODS)[number];

/** URL state of /points and of the leaderboards on the group pages. */
export const boardSearchSchema = z.object({
  group: z.uuid().optional().catch(undefined),
  period: z.enum(BOARD_PERIODS).catch("month"),
  // A past month, "YYYY-MM".
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
});

export const TV_LANGUAGES = ["uz", "ru", "en"] as const;

export const POINTS_TABS = ["leaderboard", "rewards", "requests"] as const;
export type PointsTab = (typeof POINTS_TABS)[number];

/** URL state of /points: the tab, plus the leaderboard's own filters. */
export const pointsSearchSchema = boardSearchSchema.extend({ tab: z.enum(POINTS_TABS).catch("leaderboard") });

/** Reward photos: what the bucket accepts. */
export const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** Add or edit a reward. An empty stock means unlimited. */
export const rewardSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "nameRequired").max(80, "tooLong"),
  description: z
    .string()
    .trim()
    .max(300, "tooLong")
    .transform((value) => value || null),
  cost: z.coerce.number("costInvalid").int("costInvalid").min(1, "costInvalid").max(100_000, "costInvalid"),
  stock: z.string().transform((value, ctx) => {
    if (value.trim() === "") return null;
    const stock = Number(value);
    if (!Number.isInteger(stock) || stock < 0 || stock > 100_000) {
      ctx.addIssue({ code: "custom", message: "stockInvalid" });
      return z.NEVER;
    }
    return stock;
  }),
  /** The stock field as the form loaded it: stock is saved only when the owner changed it. */
  stock_loaded: z.string().optional(),
  is_active: z.boolean(),
  // The photo's name in the bucket; set by the upload, never typed.
  photo_path: z
    .string()
    .regex(/^[0-9a-f-]{36}\.(jpg|png|webp)$/)
    .nullable(),
});
export type RewardInput = z.input<typeof rewardSchema>;
export type RewardValues = z.output<typeof rewardSchema>;

/** Give, or reject / cancel with a reason. */
export const handleRedemptionSchema = z
  .object({
    id: z.uuid(),
    action: z.enum(["give", "reject", "cancel"]),
    note: reason,
  })
  .superRefine((value, ctx) => {
    if (value.action !== "give" && !value.note) ctx.addIssue({ code: "custom", path: ["note"], message: "reasonRequired" });
  });

export const requestRewardSchema = z.object({ student_id: z.uuid(), reward_id: z.uuid() });

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
  | "nameRequired"
  | "costInvalid"
  | "stockInvalid"
  | "outOfStock"
  | "alreadyHandled"
  | "notOnOffer"
  | "photoInvalid"
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
  ER001: "notEnough",
  ER002: "outOfStock",
  ER003: "alreadyHandled",
  ER004: "reasonRequired",
  ER005: "notOnOffer",
  "42501": "notAllowed",
  P0002: "notFound",
};

export type PointsResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: PointsErrorKey; /** Points left today, or the balance, when the database says so. */ detail?: number };
