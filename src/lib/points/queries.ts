import "server-only";

import { DEFAULT_POINTS_SETTINGS, type PointsSettings } from "@/lib/domain/points";
import { createClient } from "@/lib/supabase/server";
import type { Enums, Tables } from "@/lib/supabase/types";

// Points — docs/SPEC.md → "Points and rewards add-on". Staff read the ledger
// directly; a teacher reads only through database functions that check the
// group is their own.

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

const SETTINGS =
  "enabled, present, late, perfect_month, perfect_month_min_lessons, on_time, referral, max_per_action, teacher_daily_cap";

export async function getPointsSettings(): Promise<PointsSettings> {
  const supabase = await db();
  const { data, error } = await supabase.from("points_settings").select(SETTINGS).single();
  // The table is missing while a deploy is ahead of its migration: the programme is simply off.
  if (error && (error.code === "PGRST205" || error.code === "42P01")) return { ...DEFAULT_POINTS_SETTINGS, enabled: false };
  if (error) throw new Error(error.message);
  return data;
}

export type PointPreset = Pick<
  Tables<"point_presets">,
  "id" | "kind" | "points" | "label_uz" | "label_ru" | "label_en" | "is_active"
>;

/**
 * Presets in their order, awards first. Teachers choose from the active ones;
 * History also needs the names of presets that were removed since.
 */
export async function getPointPresets(options: { activeOnly: boolean; withArchived?: boolean }): Promise<PointPreset[]> {
  const supabase = await db();
  let query = supabase
    .from("point_presets")
    .select("id, kind, points, label_uz, label_ru, label_en, is_active")
    .order("kind")
    .order("sort")
    .order("created_at");
  if (!options.withArchived) query = query.is("archived_at", null);
  if (options.activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

/** This month's points of each student in a group: student id → points. */
export async function getGroupMonthPoints(groupId: string): Promise<Record<string, number>> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("group_month_points", { p_group_id: groupId });
  if (error) throw new Error(error.message);
  return Object.fromEntries(data.map((row) => [row.student_id, row.points]));
}

export type HistoryRow = {
  id: string;
  at: string;
  studentName: string;
  groupName: string | null;
  delta: number;
  presetId: string | null;
  reason: string | null;
  isUndo: boolean;
};

/** Every point the signed-in teacher gave or took this month, newest first. */
export async function getTeacherPointsHistory(): Promise<HistoryRow[]> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("teacher_points_history");
  if (error) throw new Error(error.message);
  return data.map((row) => ({
    id: row.id,
    at: row.created_at,
    studentName: row.student_name,
    groupName: row.group_name,
    delta: row.delta,
    presetId: row.preset_id,
    reason: row.reason,
    isUndo: row.is_undo,
  }));
}

export type StudentPointsRow = {
  id: string;
  at: string;
  delta: number;
  source: Enums<"points_source">;
  reason: string | null;
  isUndo: boolean;
  group: string | null;
  preset: Pick<PointPreset, "label_uz" | "label_ru" | "label_en"> | null;
  by: string | null;
};

export type StudentPoints = {
  balance: number;
  earnedThisMonth: number;
  earnedAllTime: number;
  /** The latest rows, newest first. */
  rows: StudentPointsRow[];
};

/** The most rows shown on a student's Points tab. */
export const STUDENT_POINTS_ROWS = 200;

export async function getStudentPoints(studentId: string): Promise<StudentPoints> {
  const supabase = await db();
  const [totals, ledger] = await Promise.all([
    supabase.from("student_points").select("balance, earned_this_month, earned_all_time").eq("student_id", studentId).maybeSingle(),
    supabase
      .from("points_ledger")
      .select(
        "id, created_at, delta, source, reason, dedupe_key, group:groups(name), preset:point_presets(label_uz, label_ru, label_en), author:profiles(full_name)",
      )
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(STUDENT_POINTS_ROWS),
  ]);
  if (totals.error) throw new Error(totals.error.message);
  if (ledger.error) throw new Error(ledger.error.message);
  return {
    balance: totals.data?.balance ?? 0,
    earnedThisMonth: totals.data?.earned_this_month ?? 0,
    earnedAllTime: totals.data?.earned_all_time ?? 0,
    rows: ledger.data.map((row) => ({
      id: row.id,
      at: row.created_at,
      delta: row.delta,
      source: row.source,
      reason: row.reason,
      isUndo: row.dedupe_key?.startsWith("undo:") ?? false,
      group: row.group?.name ?? null,
      preset: row.preset,
      by: row.author?.full_name ?? null,
    })),
  };
}
