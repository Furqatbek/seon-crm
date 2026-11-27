"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getSignedInUser } from "@/lib/auth";
import { EXAM_OPTION_IDS, EXAM_PRESETS, presetSections, readExamImport, type SectionKind } from "@/lib/domain/exams";
import { xlsxRows } from "@/lib/questions/excel";
import { createClient } from "@/lib/supabase/server";
import { EXAM_IMPORT_MAX_BYTES, createExamSchema, examQuestionSchema, examSettingsSchema, passageSchema, type ExamErrorKey, type ExamImportRowError, type ExamResult } from "@/lib/validation/exams";

// Mock exams, built in the CRM. Everything is written as the signed-in user:
// Row Level Security and the guard triggers decide who may build, that a
// published exam is not changed, and that only the owner and managers publish.

async function session(...roles: Array<"owner" | "manager" | "teacher">) {
  const [user, supabase] = await Promise.all([getSignedInUser(), createClient()]);
  const allowed = roles.length > 0 ? roles : (["owner", "manager", "teacher"] as const);
  return user && supabase && (allowed as readonly string[]).includes(user.role) ? { user, supabase } : null;
}

const CODES: Record<string, ExamErrorKey> = { "42501": "notAllowed", EX001: "sectionIncomplete", EX002: "audioMissingFile", EX004: "attemptsRunning", "23503": "questionAnswered", P0002: "notFound" };

function failure(error: { code?: string; message?: string; details?: string | null }): { ok: false; error: ExamErrorKey; detail?: string } {
  // A published exam refuses changes with its own words.
  if (error.code === "42501" && error.message?.includes("unpublish")) return { ok: false, error: "published" };
  return { ok: false, error: (error.code && CODES[error.code]) || "generic", detail: error.details ?? undefined };
}
const invalid = (error: { issues: { message: string }[] }): { ok: false; error: ExamErrorKey } => ({ ok: false, error: (error.issues[0]?.message as ExamErrorKey) ?? "generic" });

/** A new draft from one of the four presets. Returns its id. */
export async function createExam(input: unknown): Promise<ExamResult<{ id: string }>> {
  const parsed = createExamSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const preset = EXAM_PRESETS.find((candidate) => candidate.key === parsed.data.preset)!;
  const exam = await ctx.supabase.from("exams").insert({ title: parsed.data.title, level: preset.level }).select("id").single();
  if (exam.error) return failure(exam.error);
  const sections = await ctx.supabase.from("exam_sections").insert(presetSections(preset).map((section) => ({ ...section, exam_id: exam.data.id })));
  if (sections.error) return failure(sections.error);
  refresh();
  return { ok: true, data: { id: exam.data.id } };
}

/** The title, the level, the play limit, the rate, the thresholds and both sections' numbers. */
export async function saveExamSettings(input: unknown): Promise<ExamResult> {
  const parsed = examSettingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { id, thresholds, listening_questions, listening_minutes, reading_questions, reading_minutes, ...exam } = parsed.data;
  // The exam and both sections in one go: all of it is saved, or none.
  const { error } = await ctx.supabase.rpc("save_exam_settings", {
    p_exam_id: id,
    p_title: exam.title,
    p_level: exam.level,
    p_audio_max_plays: exam.audio_max_plays,
    p_coins_per_correct: exam.coins_per_correct,
    p_thresholds: thresholds.length > 0 ? [...thresholds].sort((a, b) => a.level - b.level) : null,
    p_listening_questions: listening_questions,
    p_listening_seconds: listening_minutes * 60,
    p_reading_questions: reading_questions,
    p_reading_seconds: reading_minutes * 60,
  });
  if (error) return failure(error);
  refresh();
  return { ok: true };
}

type Ctx = NonNullable<Awaited<ReturnType<typeof session>>>;

/** Removes files of an exam's folder that nothing uses any more. A file that stays is only a file that stays. */
async function dropMedia(ctx: Ctx, examId: string, paths: Array<string | null | undefined>) {
  const gone = [...new Set(paths.filter((path): path is string => !!path && path.startsWith(`${examId}/`)))];
  if (gone.length > 0) await ctx.supabase.storage.from("exam-media").remove(gone);
}

/** After a save: the files the row no longer names go when it worked, the ones sent for it when it did not. */
async function settleMedia(ctx: Ctx, examId: string, saved: boolean, before: Array<string | null | undefined>, after: Array<string | null | undefined>) {
  await dropMedia(ctx, examId, saved ? before.filter((path) => !after.includes(path)) : after.filter((path) => !before.includes(path)));
}

/** The next free position in a section. */
async function nextPosition(ctx: Ctx, table: "exam_passages" | "exam_questions", sectionId: string): Promise<number> {
  const { data } = await ctx.supabase.from(table).select("position").eq("section_id", sectionId).order("position", { ascending: false }).limit(1);
  return (data?.[0]?.position ?? 0) + 1;
}

export async function savePassage(input: unknown): Promise<ExamResult> {
  const parsed = passageSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { id, exam_id, section_id, ...rest } = parsed.data;
  const values = { ...rest, text: rest.text || null, audio_path: rest.kind === "audio" ? rest.audio_path : null };
  const after = [values.image_path, values.audio_path];
  let before: Array<string | null> = [];
  let failed: ExamResult | null = null;
  if (id) {
    const old = await ctx.supabase.from("exam_passages").select("image_path, audio_path").eq("id", id).eq("exam_id", exam_id).maybeSingle();
    before = [old.data?.image_path ?? null, old.data?.audio_path ?? null];
    const { data, error } = await ctx.supabase.from("exam_passages").update(values).eq("id", id).eq("exam_id", exam_id).select("id");
    if (error) failed = failure(error);
    else if (data.length === 0) failed = { ok: false, error: "notFound" };
  } else {
    const { error } = await ctx.supabase.from("exam_passages").insert({ ...values, exam_id, section_id, position: await nextPosition(ctx, "exam_passages", section_id) });
    if (error) failed = failure(error);
  }
  await settleMedia(ctx, exam_id, !failed, before, after);
  if (failed) return failed;
  refresh();
  return { ok: true };
}

export async function saveExamQuestion(input: unknown): Promise<ExamResult> {
  const parsed = examQuestionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { id, exam_id, section_id, passage_id, prompt, options, correct, explanation } = parsed.data;
  const values = {
    passage_id,
    prompt,
    options: options.map((option, index) => ({ id: EXAM_OPTION_IDS[index], ...(option.text ? { text: option.text } : {}), ...(option.image_path ? { image_path: option.image_path } : {}) })),
    correct_option_id: correct,
    explanation: explanation || null,
  };
  const after = options.map((option) => option.image_path);
  let before: string[] = [];
  let failed: ExamResult | null = null;
  if (id) {
    const old = await ctx.supabase.from("exam_questions").select("options").eq("id", id).eq("section_id", section_id).maybeSingle();
    before = Array.isArray(old.data?.options) ? old.data.options.flatMap((option) => (option && typeof option === "object" && "image_path" in option && typeof option.image_path === "string" ? [option.image_path] : [])) : [];
    const { data, error } = await ctx.supabase.from("exam_questions").update(values).eq("id", id).eq("section_id", section_id).select("id");
    if (error) failed = failure(error);
    else if (data.length === 0) failed = { ok: false, error: "notFound" };
  } else {
    const { error } = await ctx.supabase.from("exam_questions").insert({ ...values, section_id, position: await nextPosition(ctx, "exam_questions", section_id) });
    if (error) failed = failure(error);
  }
  await settleMedia(ctx, exam_id, !failed, before, after);
  if (failed) return failed;
  refresh();
  return { ok: true };
}

const removeSchema = z.object({ kind: z.enum(["passage", "question"]), id: z.uuid() });

/** Takes a passage or a question out of a draft. A passage's questions stay, on their own. */
export async function removeExamItem(input: unknown): Promise<ExamResult> {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { data, error } = await ctx.supabase.from(parsed.data.kind === "passage" ? "exam_passages" : "exam_questions").delete().eq("id", parsed.data.id).select();
  if (error) return failure(error);
  // The files the removed row named go with it.
  for (const row of data) {
    const paths = "options" in row ? (Array.isArray(row.options) ? row.options.map((option) => (option && typeof option === "object" && "image_path" in option ? String(option.image_path ?? "") : "")) : []) : [row.image_path, row.audio_path];
    const examId = paths.find((path) => path)?.split("/")[0];
    if (examId) await dropMedia(ctx, examId, paths);
  }
  refresh();
  return { ok: true };
}

/** A form field that carries JSON; undefined when it is not JSON. */
function jsonField(form: FormData, name: string, empty: string): unknown {
  try {
    return JSON.parse(String(form.get(name) ?? empty));
  } catch {
    return undefined;
  }
}

const statusSchema = z.object({ id: z.uuid(), action: z.enum(["publish", "unpublish", "archive"]) });

/** Publish and unpublish: the owner and managers. Archive: the owner. */
export async function setExamStatus(input: unknown): Promise<ExamResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const ctx = await (parsed.data.action === "archive" ? session("owner") : session("owner", "manager"));
  if (!ctx) return { ok: false, error: "notAllowed" };
  if (parsed.data.action === "archive") {
    const { data, error } = await ctx.supabase.from("exams").update({ archived_at: new Date().toISOString() }).eq("id", parsed.data.id).is("archived_at", null).select("id");
    if (error) return failure(error);
    if (data.length === 0) return { ok: false, error: "notFound" };
  } else {
    const { error } = await ctx.supabase.rpc(parsed.data.action === "publish" ? "publish_exam" : "unpublish_exam", { p_exam_id: parsed.data.id });
    if (error) return failure(error);
  }
  refresh();
  return { ok: true };
}

export type ExamImportPreview = {
  fileName: string;
  rows: number;
  /** Questions ready to be saved, by section. */
  ready: Record<SectionKind, number>;
  passages: number;
  errors: ExamImportRowError[];
  /** Audio files that were chosen and that no row names. */
  unusedAudio: string[];
  /** The audio files the ready rows need: the ones to upload before saving. */
  audioNeeded: string[];
};

async function readSheet(form: FormData) {
  const file = form.get("file");
  const names = z.array(z.string().max(300)).max(400).safeParse(jsonField(form, "audio", "[]"));
  if (!(file instanceof File) || !names.success || !file.name.toLowerCase().endsWith(".xlsx")) return { ok: false as const, error: "fileInvalid" as ExamErrorKey };
  if (file.size === 0) return { ok: false as const, error: "empty" as ExamErrorKey };
  if (file.size > EXAM_IMPORT_MAX_BYTES) return { ok: false as const, error: "fileTooLarge" as ExamErrorKey };
  let rows: string[][] | null;
  try {
    rows = await xlsxRows(await file.arrayBuffer());
  } catch {
    return { ok: false as const, error: "fileInvalid" as ExamErrorKey };
  }
  if (!rows) return { ok: false as const, error: "empty" as ExamErrorKey };
  const report = readExamImport(rows, names.data);
  if (!report.ok) return { ok: false as const, error: report.error as ExamErrorKey };
  return { ok: true as const, file, report };
}

/** Reads the sheet against the audio files chosen with it and says what would happen. Nothing is saved. */
export async function previewExamImport(form: FormData): Promise<ExamResult<ExamImportPreview>> {
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const read = await readSheet(form);
  if (!read.ok) return read;
  const { report } = read;
  const count = (kind: SectionKind) => report.questions.filter((question) => question.section === kind).length;
  return {
    ok: true,
    data: {
      fileName: read.file.name,
      rows: report.rows,
      ready: { listening: count("listening"), reading: count("reading") },
      passages: report.passages.length,
      errors: report.errors,
      unusedAudio: report.unusedAudio,
      audioNeeded: report.passages.flatMap((passage) => (passage.audio ? [passage.audio] : [])),
    },
  };
}

/**
 * Adds the sheet's ready rows to a draft, after what it already has. The
 * audio files were uploaded by the browser first; `paths` says where each
 * went. The sheet is read again here: what is saved is what the server reads.
 */
export async function saveExamImport(form: FormData): Promise<ExamResult<{ questions: number }>> {
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const examId = z.uuid().safeParse(form.get("exam_id"));
  const paths = z.record(z.string(), z.string().max(300)).safeParse(jsonField(form, "paths", "{}"));
  if (!examId.success || !paths.success) return { ok: false, error: "fileInvalid" };
  const read = await readSheet(form);
  if (!read.ok) return read;
  const { report } = read;
  // Every file a row needs is in the exam's own folder.
  if (report.passages.some((passage) => passage.audio && !paths.data[passage.audio]?.startsWith(`${examId.data}/`))) return { ok: false, error: "uploadFailed" };

  // Every passage and question in one transaction: a failure leaves the draft as it was.
  const { data, error } = await ctx.supabase.rpc("import_exam", {
    p_exam_id: examId.data,
    p_passages: report.passages.map((passage) => ({ key: passage.key, section: passage.section, kind: passage.kind, text: passage.text, audio_path: passage.audio ? paths.data[passage.audio] : null })),
    p_questions: report.questions.map((question) => ({ section: question.section, passage: question.passage, prompt: question.prompt, options: question.options, correct_option_id: question.correct_option_id, explanation: question.explanation })),
  });
  if (error) {
    // The recordings sent for it are not needed any more.
    await dropMedia(ctx, examId.data, Object.values(paths.data));
    return failure(error);
  }
  refresh();
  return { ok: true, data: { questions: data } };
}
