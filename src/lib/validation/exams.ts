import { z } from "zod";

import { EXAM_EXPLANATION_MAX, EXAM_LEVELS, EXAM_OPTION_IDS, EXAM_OPTION_MAX, EXAM_PRESETS, PASSAGE_TEXT_MAX, PROMPT_MAX, checkThresholds, type ExamFileError, type ExamRowError, type ThresholdError } from "@/lib/domain/exams";

// Mock exams — docs/STUDENT_APP_SPEC.md → "CRM changes" (Points → Mock exams).

export type ExamErrorKey =
  | "generic"
  | "notAllowed"
  | "notFound"
  | "titleRequired"
  | "tooLong"
  | "numberInvalid"
  | "promptRequired"
  | "passageEmpty"
  | "optionsTooFew"
  | "optionRequired"
  | "correctInvalid"
  | "published"
  | "sectionIncomplete"
  | "audioMissingFile"
  | "mediaInvalid"
  | "fileInvalid"
  | "fileTooLarge"
  | "uploadFailed"
  | ThresholdError
  | ExamFileError;

export type ExamResult<T = undefined> = (T extends undefined ? { ok: true } : { ok: true; data: T }) | { ok: false; error: ExamErrorKey; detail?: string };

const title = z.string().trim().min(1, "titleRequired").max(120, "tooLong");
const whole = (min: number, max: number) => z.coerce.number("numberInvalid").int("numberInvalid").min(min, "numberInvalid").max(max, "numberInvalid");

/** A new exam: its title and one of the four presets. */
export const createExamSchema = z.object({ title, preset: z.enum(EXAM_PRESETS.map((preset) => preset.key) as [string, ...string[]]) });

/** Everything about an exam but its questions. An empty rate means the one in Settings → Points. */
export const examSettingsSchema = z
  .object({
    id: z.uuid(),
    title,
    level: z.enum(EXAM_LEVELS),
    audio_max_plays: whole(1, 2),
    coins_per_correct: z.string().transform((value, ctx) => {
      if (value.trim() === "") return null;
      const rate = Number(value);
      if (!Number.isInteger(rate) || rate < 0 || rate > 1000) {
        ctx.addIssue({ code: "custom", message: "numberInvalid" });
        return z.NEVER;
      }
      return rate;
    }),
    listening_questions: whole(1, 200),
    listening_minutes: whole(1, 240),
    reading_questions: whole(1, 200),
    reading_minutes: whole(1, 240),
    thresholds: z.array(z.object({ level: whole(1, 6), min_correct: whole(1, 400) })).max(4),
  })
  .superRefine((value, ctx) => {
    const problem = checkThresholds(value.thresholds, value.level, value.listening_questions + value.reading_questions);
    if (problem) ctx.addIssue({ code: "custom", path: ["thresholds"], message: problem });
  });
export type ExamSettingsInput = z.input<typeof examSettingsSchema>;
export type ExamSettingsValues = z.output<typeof examSettingsSchema>;

/** A passage: a text (with an optional picture) or an audio recording. */
export const passageSchema = z
  .object({
    id: z.uuid().optional(),
    exam_id: z.uuid(),
    section_id: z.uuid(),
    kind: z.enum(["text", "audio"]),
    text: z.string().trim().max(PASSAGE_TEXT_MAX, "tooLong"),
    image_path: z.string().max(300).nullable(),
    audio_path: z.string().max(300).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "text" && value.text === "" && !value.image_path) ctx.addIssue({ code: "custom", path: ["text"], message: "passageEmpty" });
  });
export type PassageInput = z.input<typeof passageSchema>;

/** A question: two to four choices, each a text or a picture, lettered a–d in their order. */
export const examQuestionSchema = z
  .object({
    id: z.uuid().optional(),
    exam_id: z.uuid(),
    section_id: z.uuid(),
    passage_id: z.uuid().nullable(),
    prompt: z.string().trim().min(1, "promptRequired").max(PROMPT_MAX, "tooLong"),
    options: z
      .array(z.object({ text: z.string().trim().max(EXAM_OPTION_MAX, "tooLong"), image_path: z.string().max(300).nullable() }))
      .min(2, "optionsTooFew")
      .max(EXAM_OPTION_IDS.length, "optionsTooFew"),
    correct: z.enum(EXAM_OPTION_IDS, "correctInvalid"),
    explanation: z.string().trim().max(EXAM_EXPLANATION_MAX, "tooLong"),
  })
  .superRefine((value, ctx) => {
    if (value.options.some((option) => option.text === "" && !option.image_path)) ctx.addIssue({ code: "custom", path: ["options"], message: "optionRequired" });
    if (EXAM_OPTION_IDS.indexOf(value.correct) >= value.options.length) ctx.addIssue({ code: "custom", path: ["correct"], message: "correctInvalid" });
  });
export type ExamQuestionInput = z.input<typeof examQuestionSchema>;

export type ExamImportRowError = { row: number; errors: ExamRowError[] };
/** The import sheet: Excel, up to 2 MB. */
export const EXAM_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
