import { z } from "zod";

import { EXPLANATION_MAX, OPTION_IDS, OPTION_TEXT_MAX, QUESTION_LANGUAGES, QUESTION_TEXT_MAX, type FileError, type RowError } from "@/lib/domain/questions";

// Game question banks — docs/STUDENT_APP_SPEC.md → "CRM changes" (Points → Questions).

export type QuestionErrorKey =
  | "generic"
  | "notAllowed"
  | "notFound"
  | "subjectRequired"
  | "textRequired"
  | "optionsTooFew"
  | "optionRequired"
  | "optionsRepeat"
  | "correctInvalid"
  | "tooLong"
  | "imageInvalid"
  | "fileInvalid"
  | "fileTooLarge"
  | FileError;

export type QuestionResult<T = undefined> = (T extends undefined ? { ok: true } : { ok: true; data: T }) | { ok: false; error: QuestionErrorKey };

/** Question pictures: what the bucket accepts. */
export const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
/** An import file: CSV or Excel, up to 2 MB. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

/** Add or edit a question. The choices are lettered a–d in the order they are written. */
export const questionSchema = z
  .object({
    id: z.uuid().optional(),
    subject: z.string().trim().min(1, "subjectRequired").max(80, "tooLong"),
    level: z.string().trim().max(80, "tooLong"),
    language: z.enum(QUESTION_LANGUAGES),
    text: z.string().trim().min(1, "textRequired").max(QUESTION_TEXT_MAX, "tooLong"),
    options: z
      .array(z.object({ text: z.string().trim().min(1, "optionRequired").max(OPTION_TEXT_MAX, "tooLong") }))
      .min(2, "optionsTooFew")
      .max(OPTION_IDS.length, "optionsTooFew"),
    correct: z.enum(OPTION_IDS, "correctInvalid"),
    explanation: z
      .string()
      .trim()
      .max(EXPLANATION_MAX, "tooLong")
      .transform((value) => value || null),
    difficulty: z.coerce.number().int().min(1).max(3),
    image_path: z.string().max(200).nullable(),
  })
  .superRefine((value, ctx) => {
    if (OPTION_IDS.indexOf(value.correct) >= value.options.length) ctx.addIssue({ code: "custom", path: ["correct"], message: "correctInvalid" });
    const texts = value.options.map((option) => option.text.toLowerCase());
    if (new Set(texts).size !== texts.length) ctx.addIssue({ code: "custom", path: ["options"], message: "optionsRepeat" });
  });
export type QuestionInput = z.input<typeof questionSchema>;
export type QuestionValues = z.output<typeof questionSchema>;

export const QUESTION_STATES = ["all", "on", "off"] as const;
export const QUESTION_FLAGS = ["any", "tooHard", "tooEasy"] as const;
export const QUESTIONS_PAGE_SIZE = 50;

/** URL state of the question lists. `bank` is "subject|level". */
export const questionsSearchSchema = z.object({
  q: z.string().trim().max(80).catch(""),
  bank: z.string().max(170).catch(""),
  state: z.enum(QUESTION_STATES).catch("all"),
  flag: z.enum(QUESTION_FLAGS).catch("any"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type QuestionsSearch = z.output<typeof questionsSearchSchema>;

export const bankKey = (subject: string, level: string) => `${subject}|${level}`;

export type ImportRowError = { row: number; errors: RowError[] };
