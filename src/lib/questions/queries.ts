import "server-only";

import { questionFlag, type QuestionFlag } from "@/lib/domain/questions";
import { createClient } from "@/lib/supabase/server";
import { QUESTIONS_PAGE_SIZE, bankKey, type QuestionsSearch } from "@/lib/validation/questions";

export type BankOption = { subject: string; level: string; activeQuestions: number };

export type QuestionRow = {
  id: string;
  subject: string;
  level: string;
  language: string;
  text: string;
  /** A short-lived link to the picture, when there is one. */
  imageUrl: string | null;
  image_path: string | null;
  options: Array<{ id: string; text: string }>;
  correct_option_id: string;
  explanation: string | null;
  difficulty: number;
  is_active: boolean;
  times_used: number;
  times_correct: number;
  /** Too hard (under 15% right) or too easy (over 95%), once enough players have seen it. */
  flag: QuestionFlag | null;
};

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

/** The banks the caller works with: every bank for staff, their own subjects' for a teacher. */
export async function getBanks(): Promise<BankOption[]> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("game_banks");
  // The game's migration is not applied yet: there are no banks to show.
  if (error) return [];
  return data.map((row) => ({ subject: row.subject, level: row.level, activeQuestions: row.active_questions }));
}

const COLUMNS = "id, subject, level, language, text, image_path, options, correct_option_id, explanation, difficulty, is_active, times_used, times_correct" as const;
/** More than a centre writes; the flags are worked out here, so the list is read whole. */
const LIST_LIMIT = 5000;

const optionsOf = (value: unknown): Array<{ id: string; text: string }> =>
  Array.isArray(value) ? value.flatMap((option) => (option && typeof option === "object" && "id" in option && "text" in option ? [{ id: String(option.id), text: String(option.text) }] : [])) : [];

/**
 * Questions, the newest first, 50 a page. Row Level Security decides which:
 * all of them for staff, their subjects' for a teacher.
 */
export async function getQuestions(search: QuestionsSearch): Promise<{ rows: QuestionRow[]; total: number; flagged: number }> {
  const supabase = await db();
  let query = supabase.from("questions").select(COLUMNS).is("archived_at", null).order("created_at", { ascending: false }).order("id").limit(LIST_LIMIT);
  if (search.bank.includes("|")) {
    const [subject, ...rest] = search.bank.split("|");
    query = query.eq("subject", subject).eq("level", rest.join("|"));
  }
  if (search.state !== "all") query = query.eq("is_active", search.state === "on");
  // The words are looked for as written: % and _ are not wildcards, and a comma is not a separator.
  const words = search.q.replace(/[%_\\,()]/g, " ").trim();
  if (words) query = query.ilike("text", `%${words}%`);

  const { data, error } = await query;
  if (error) {
    // The game's migration is not applied yet.
    if (error.code === "42P01" || error.code === "PGRST205") return { rows: [], total: 0, flagged: 0 };
    throw new Error(error.message);
  }
  const all = data.map((row) => ({ ...row, options: optionsOf(row.options), flag: questionFlag(row.times_used, row.times_correct) }));
  const flagged = all.filter((row) => row.flag !== null).length;
  const matching = search.flag === "any" ? all : all.filter((row) => row.flag === search.flag);
  const page = matching.slice((search.page - 1) * QUESTIONS_PAGE_SIZE, search.page * QUESTIONS_PAGE_SIZE);

  // Pictures live in a private bucket: links that work for an hour.
  const paths = page.flatMap((row) => (row.image_path ? [row.image_path] : []));
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const signed = await supabase.storage.from("question-images").createSignedUrls(paths, 3600);
    for (const item of signed.data ?? []) if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return { rows: page.map((row) => ({ ...row, imageUrl: row.image_path ? (urls.get(row.image_path) ?? null) : null })), total: matching.length, flagged };
}

export { bankKey };
