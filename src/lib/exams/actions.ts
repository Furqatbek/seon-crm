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

const CODES: Record<string, ExamErrorKey> = { "42501": "notAllowed", EX001: "sectionIncomplete", EX002: "audioMissingFile", P0002: "notFound" };

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
  const updated = await ctx.supabase.from("exams").update({ ...exam, level_thresholds: thresholds.length > 0 ? [...thresholds].sort((a, b) => a.level - b.level) : null }).eq("id", id).is("archived_at", null).select("id");
  if (updated.error) return failure(updated.error);
  if (updated.data.length === 0) return { ok: false, error: "notFound" };
  for (const [kind, question_count, minutes] of [["listening", listening_questions, listening_minutes], ["reading", reading_questions, reading_minutes]] as const) {
    const { error } = await ctx.supabase.from("exam_sections").update({ question_count, time_limit_sec: minutes * 60 }).eq("exam_id", id).eq("kind", kind);
    if (error) return failure(error);
  }
  refresh();
  return { ok: true };
}

/** The next free position in a section. */
async function nextPosition(ctx: NonNullable<Awaited<ReturnType<typeof session>>>, table: "exam_passages" | "exam_questions", sectionId: string): Promise<number> {
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
  if (id) {
    const { data, error } = await ctx.supabase.from("exam_passages").update(values).eq("id", id).eq("exam_id", exam_id).select("id");
    if (error) return failure(error);
    if (data.length === 0) return { ok: false, error: "notFound" };
  } else {
    const { error } = await ctx.supabase.from("exam_passages").insert({ ...values, exam_id, section_id, position: await nextPosition(ctx, "exam_passages", section_id) });
    if (error) return failure(error);
  }
  refresh();
  return { ok: true };
}

export async function saveExamQuestion(input: unknown): Promise<ExamResult> {
  const parsed = examQuestionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { id, section_id, passage_id, prompt, options, correct, explanation } = parsed.data;
  const values = {
    passage_id,
    prompt,
    options: options.map((option, index) => ({ id: EXAM_OPTION_IDS[index], ...(option.text ? { text: option.text } : {}), ...(option.image_path ? { image_path: option.image_path } : {}) })),
    correct_option_id: correct,
    explanation: explanation || null,
  };
  if (id) {
    const { data, error } = await ctx.supabase.from("exam_questions").update(values).eq("id", id).eq("section_id", section_id).select("id");
    if (error) return failure(error);
    if (data.length === 0) return { ok: false, error: "notFound" };
  } else {
    const { error } = await ctx.supabase.from("exam_questions").insert({ ...values, section_id, position: await nextPosition(ctx, "exam_questions", section_id) });
    if (error) return failure(error);
  }
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
  const { error } = await ctx.supabase.from(parsed.data.kind === "passage" ? "exam_passages" : "exam_questions").delete().eq("id", parsed.data.id);
  if (error) return failure(error);
  refresh();
  return { ok: true };
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
  const names = z.array(z.string().max(300)).max(400).safeParse(JSON.parse(String(form.get("audio") ?? "[]")));
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
  const paths = z.record(z.string(), z.string().max(300)).safeParse(JSON.parse(String(form.get("paths") ?? "{}")));
  if (!examId.success || !paths.success) return { ok: false, error: "fileInvalid" };
  const read = await readSheet(form);
  if (!read.ok) return read;
  const { report } = read;
  // Every file a row needs is in the exam's own folder.
  if (report.passages.some((passage) => passage.audio && !paths.data[passage.audio]?.startsWith(`${examId.data}/`))) return { ok: false, error: "uploadFailed" };

  const sections = await ctx.supabase.from("exam_sections").select("id, kind").eq("exam_id", examId.data);
  if (sections.error) return failure(sections.error);
  const sectionOf = Object.fromEntries(sections.data.map((section) => [section.kind, section.id])) as Record<SectionKind, string | undefined>;
  if (!sectionOf.listening || !sectionOf.reading) return { ok: false, error: "notFound" };

  const passageIds = new Map<string, string>();
  const position = { passage: { listening: 0, reading: 0 }, question: { listening: 0, reading: 0 } };
  for (const kind of ["listening", "reading"] as const) {
    position.passage[kind] = await nextPosition(ctx, "exam_passages", sectionOf[kind]!);
    position.question[kind] = await nextPosition(ctx, "exam_questions", sectionOf[kind]!);
  }
  for (const passage of report.passages) {
    const { data, error } = await ctx.supabase
      .from("exam_passages")
      .insert({ exam_id: examId.data, section_id: sectionOf[passage.section]!, kind: passage.kind, text: passage.text, audio_path: passage.audio ? paths.data[passage.audio] : null, position: position.passage[passage.section]++ })
      .select("id")
      .single();
    if (error) return failure(error);
    passageIds.set(passage.key, data.id);
  }
  const rows = report.questions.map((question) => ({
    section_id: sectionOf[question.section]!,
    passage_id: question.passage ? (passageIds.get(question.passage) ?? null) : null,
    position: position.question[question.section]++,
    prompt: question.prompt,
    options: question.options,
    correct_option_id: question.correct_option_id,
    explanation: question.explanation,
  }));
  for (let from = 0; from < rows.length; from += 100) {
    const { error } = await ctx.supabase.from("exam_questions").insert(rows.slice(from, from + 100));
    if (error) return failure(error);
  }
  refresh();
  return { ok: true, data: { questions: rows.length } };
}
