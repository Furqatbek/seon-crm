import "server-only";

import type { ExamLevel, SectionKind, Threshold } from "@/lib/domain/exams";
import { createClient } from "@/lib/supabase/server";

export type ExamSection = { id: string; kind: SectionKind; question_count: number; time_limit_sec: number; written: number };

export type ExamSummary = {
  id: string;
  title: string;
  level: ExamLevel;
  status: "draft" | "published";
  sections: ExamSection[];
  /** Finished attempts, the players who made them, and their average right answers. */
  attempts: number;
  players: number;
  average: number | null;
};

export type ExamOption = { id: string; text: string | null; image_path: string | null };
export type ExamPassage = { id: string; section_id: string; kind: "text" | "audio"; text: string | null; image_path: string | null; audio_path: string | null; position: number };
export type ExamQuestion = { id: string; section_id: string; passage_id: string | null; position: number; prompt: string; options: ExamOption[]; correct_option_id: string; explanation: string | null };

export type ExamDetail = {
  id: string;
  title: string;
  level: ExamLevel;
  status: "draft" | "published";
  audio_max_plays: number;
  coins_per_correct: number | null;
  thresholds: Threshold[];
  sections: ExamSection[];
  passages: ExamPassage[];
  questions: ExamQuestion[];
  /** Short-lived links to the exam's audio and pictures, by their path. */
  media: Record<string, string>;
};

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

const missing = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205";

const optionsOf = (value: unknown): ExamOption[] =>
  Array.isArray(value)
    ? value.flatMap((option) =>
        option && typeof option === "object" && "id" in option
          ? [{ id: String(option.id), text: "text" in option && option.text ? String(option.text) : null, image_path: "image_path" in option && option.image_path ? String(option.image_path) : null }]
          : [],
      )
    : [];

const thresholdsOf = (value: unknown): Threshold[] =>
  Array.isArray(value)
    ? value.flatMap((item) => (item && typeof item === "object" && "level" in item && "min_correct" in item ? [{ level: Number(item.level), min_correct: Number(item.min_correct) }] : []))
    : [];

/** Every exam that is not archived, the newest first, with what has been written and how it has been used. */
export async function getExams(): Promise<ExamSummary[]> {
  const supabase = await db();
  const [exams, sections, questions, stats] = await Promise.all([
    supabase.from("exams").select("id, title, level, status, created_at").is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("exam_sections").select("id, exam_id, kind, position, question_count, time_limit_sec").order("position"),
    supabase.from("exam_questions").select("section_id"),
    supabase.rpc("exam_stats"),
  ]);
  // The exams' migration is not applied yet: there is nothing to list.
  if (missing(exams.error)) return [];
  if (exams.error || sections.error || questions.error) throw new Error((exams.error ?? sections.error ?? questions.error)!.message);
  const written = new Map<string, number>();
  for (const row of questions.data) written.set(row.section_id, (written.get(row.section_id) ?? 0) + 1);
  const usage = new Map((stats.data ?? []).map((row) => [row.exam_id, row]));
  return exams.data.map((exam) => ({
    id: exam.id,
    title: exam.title,
    level: exam.level,
    status: exam.status,
    sections: sections.data.filter((section) => section.exam_id === exam.id).map((section) => ({ id: section.id, kind: section.kind, question_count: section.question_count, time_limit_sec: section.time_limit_sec, written: written.get(section.id) ?? 0 })),
    attempts: usage.get(exam.id)?.attempts ?? 0,
    players: usage.get(exam.id)?.players ?? 0,
    average: usage.get(exam.id)?.average_correct == null ? null : Number(usage.get(exam.id)!.average_correct),
  }));
}

/** One exam with everything in it, for the builder and the preview. */
export async function getExam(id: string): Promise<ExamDetail | null> {
  const supabase = await db();
  const exam = await supabase.from("exams").select("id, title, level, status, audio_max_plays, coins_per_correct, level_thresholds").eq("id", id).is("archived_at", null).maybeSingle();
  if (exam.error) {
    if (missing(exam.error)) return null;
    throw new Error(exam.error.message);
  }
  if (!exam.data) return null;
  const sections = await supabase.from("exam_sections").select("id, kind, position, question_count, time_limit_sec").eq("exam_id", id).order("position");
  if (sections.error) throw new Error(sections.error.message);
  const sectionIds = sections.data.map((section) => section.id);
  const [passages, questions] = await Promise.all([
    supabase.from("exam_passages").select("id, section_id, kind, text, image_path, audio_path, position").eq("exam_id", id).order("position"),
    supabase.from("exam_questions").select("id, section_id, passage_id, position, prompt, options, correct_option_id, explanation").in("section_id", sectionIds.length > 0 ? sectionIds : ["00000000-0000-0000-0000-000000000000"]).order("position"),
  ]);
  if (passages.error || questions.error) throw new Error((passages.error ?? questions.error)!.message);
  const parsed = questions.data.map((question) => ({ ...question, options: optionsOf(question.options) }));

  // The files live in a private bucket: links that work for an hour.
  const paths = [...new Set([...passages.data.flatMap((passage) => [passage.image_path, passage.audio_path]), ...parsed.flatMap((question) => question.options.map((option) => option.image_path))].filter((path): path is string => !!path))];
  const media: Record<string, string> = {};
  if (paths.length > 0) {
    const signed = await supabase.storage.from("exam-media").createSignedUrls(paths, 3600);
    for (const item of signed.data ?? []) if (item.path && item.signedUrl) media[item.path] = item.signedUrl;
  }
  return {
    id: exam.data.id,
    title: exam.data.title,
    level: exam.data.level,
    status: exam.data.status,
    audio_max_plays: exam.data.audio_max_plays,
    coins_per_correct: exam.data.coins_per_correct,
    thresholds: thresholdsOf(exam.data.level_thresholds),
    sections: sections.data.map((section) => ({ id: section.id, kind: section.kind, question_count: section.question_count, time_limit_sec: section.time_limit_sec, written: parsed.filter((question) => question.section_id === section.id).length })),
    passages: passages.data,
    questions: parsed,
    media,
  };
}
