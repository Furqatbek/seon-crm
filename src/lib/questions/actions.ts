"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getSignedInUser } from "@/lib/auth";
import { OPTION_IDS, type ImportQuestion } from "@/lib/domain/questions";
import { createClient } from "@/lib/supabase/server";
import { IMAGE_MAX_BYTES, IMAGE_TYPES, questionSchema, type ImportRowError, type QuestionErrorKey, type QuestionResult } from "@/lib/validation/questions";

import { reportOf } from "./file";

// Question banks. Everything is written as the signed-in user: Row Level
// Security and the guard trigger decide who may write which question, switch
// it on or off, or archive it.

async function session(...roles: Array<"owner" | "manager" | "teacher">) {
  const [user, supabase] = await Promise.all([getSignedInUser(), createClient()]);
  return user && supabase && roles.includes(user.role) ? { user, supabase } : null;
}

const failure = (error: { code?: string }): { ok: false; error: QuestionErrorKey } => ({ ok: false, error: error.code === "42501" ? "notAllowed" : "generic" });

/** A teacher writes or changes a question of one of their subjects. */
export async function saveQuestion(input: unknown): Promise<QuestionResult> {
  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: (parsed.error.issues[0]?.message as QuestionErrorKey) ?? "generic" };
  const ctx = await session("teacher");
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { id, options, correct, ...rest } = parsed.data;
  const values = { ...rest, options: options.map((option, index) => ({ id: OPTION_IDS[index], text: option.text })), correct_option_id: correct };
  if (id) {
    const { data, error } = await ctx.supabase.from("questions").update(values).eq("id", id).is("archived_at", null).select("id");
    if (error) return failure(error);
    if (data.length === 0) return { ok: false, error: "notFound" };
  } else {
    const { error } = await ctx.supabase.from("questions").insert(values);
    if (error) return failure(error);
  }
  refresh();
  return { ok: true };
}

/** A picture for a question. Teachers, with their questions. */
export async function uploadQuestionImage(form: FormData): Promise<QuestionResult<{ path: string }>> {
  const file = form.get("image");
  if (!(file instanceof File) || !(file.type in IMAGE_TYPES) || file.size === 0 || file.size > IMAGE_MAX_BYTES) return { ok: false, error: "imageInvalid" };
  const ctx = await session("teacher");
  if (!ctx) return { ok: false, error: "notAllowed" };
  const path = `${crypto.randomUUID()}.${IMAGE_TYPES[file.type as keyof typeof IMAGE_TYPES]}`;
  const { error } = await ctx.supabase.storage.from("question-images").upload(path, file, { contentType: file.type });
  if (error) return { ok: false, error: "imageInvalid" };
  return { ok: true, data: { path } };
}

const toggleSchema = z.object({ id: z.uuid(), active: z.boolean() });

/** On or off: an off question is not drawn. Owner and managers. */
export async function setQuestionActive(input: unknown): Promise<QuestionResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const ctx = await session("owner", "manager");
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { data, error } = await ctx.supabase.from("questions").update({ is_active: parsed.data.active }).eq("id", parsed.data.id).is("archived_at", null).select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

/** Out of the bank for good; matches already played keep it. Owner only. */
export async function archiveQuestion(input: unknown): Promise<QuestionResult> {
  const id = z.uuid().safeParse(input);
  if (!id.success) return { ok: false, error: "notFound" };
  const ctx = await session("owner");
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { data, error } = await ctx.supabase.from("questions").update({ archived_at: new Date().toISOString(), is_active: false }).eq("id", id.data).is("archived_at", null).select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

export type ImportPreview = {
  fileName: string;
  /** Rows in the file, the header not counted. */
  rows: number;
  /** How many are ready to be saved. */
  ready: number;
  /** Ready questions per bank. */
  banks: Array<{ subject: string; level: string; count: number }>;
  errors: ImportRowError[];
};

type Ctx = NonNullable<Awaited<ReturnType<typeof session>>>;

async function read(ctx: Ctx, form: FormData): Promise<{ ok: false; error: QuestionErrorKey } | { ok: true; file: File; rows: number; questions: ImportQuestion[]; errors: ImportRowError[] }> {
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "fileInvalid" };
  const [banks, existing] = await Promise.all([ctx.supabase.rpc("game_banks"), ctx.supabase.from("questions").select("subject, level, text").is("archived_at", null).limit(20000)]);
  if (banks.error || existing.error) return failure(banks.error ?? existing.error ?? {});
  const report = await reportOf(file, banks.data, existing.data);
  if (!report.ok) return { ok: false, error: report.error };
  return { ok: true, file, rows: report.rows, questions: report.questions, errors: report.errors };
}

/** Reads the file and says what would happen. Nothing is saved. Owner and managers. */
export async function previewImport(form: FormData): Promise<QuestionResult<ImportPreview>> {
  const ctx = await session("owner", "manager");
  if (!ctx) return { ok: false, error: "notAllowed" };
  const report = await read(ctx, form);
  if (!report.ok) return report;
  const counts = new Map<string, { subject: string; level: string; count: number }>();
  for (const question of report.questions) {
    const key = `${question.subject}\u0001${question.level}`;
    counts.set(key, { subject: question.subject, level: question.level, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  return { ok: true, data: { fileName: report.file.name, rows: report.rows, ready: report.questions.length, banks: [...counts.values()], errors: report.errors } };
}

/**
 * Saves the rows that are ready and writes down what the import did. The file
 * is read again here: what is saved is what the server reads, not what the
 * browser was shown.
 */
export async function saveImport(form: FormData): Promise<QuestionResult<{ created: number }>> {
  const ctx = await session("owner", "manager");
  if (!ctx) return { ok: false, error: "notAllowed" };
  const report = await read(ctx, form);
  if (!report.ok) return report;

  let created = 0;
  for (let from = 0; from < report.questions.length; from += 200) {
    const batch = report.questions.slice(from, from + 200);
    const { error } = await ctx.supabase.from("questions").insert(batch);
    if (error) {
      // What was saved before this batch stays, and is written down.
      await ctx.supabase.from("question_imports").insert({ file_name: report.file.name.slice(0, 200), rows: report.rows, created, errors: report.errors.slice(0, 500), imported_by: ctx.user.id });
      refresh();
      return failure(error);
    }
    created += batch.length;
  }
  const { error } = await ctx.supabase.from("question_imports").insert({ file_name: report.file.name.slice(0, 200), rows: report.rows, created, errors: report.errors.slice(0, 500), imported_by: ctx.user.id });
  if (error) return failure(error);
  refresh();
  return { ok: true, data: { created } };
}
