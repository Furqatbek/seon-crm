"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getSignedInUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  POINTS_ERRORS,
  adjustSchema,
  awardSchema,
  pointsSettingsSchema,
  presetSchema,
  type PointsErrorKey,
  type PointsResult,
} from "@/lib/validation/points";

// Points — docs/SPEC.md → "Points and rewards add-on → Point rules". The
// database functions decide what the caller may do; these actions only check
// the shape of the input and who is asking.

type DbError = { code?: string; details?: string | null };

function failure(error: DbError): { ok: false; error: PointsErrorKey; detail?: number } {
  const key = (error.code && POINTS_ERRORS[error.code]) || "generic";
  const detail = error.details != null && /^-?\d+$/.test(error.details) ? Number(error.details) : undefined;
  return { ok: false, error: key, detail };
}

const firstIssue = (error: { issues: { message: string }[] }) => (error.issues[0]?.message as PointsErrorKey) ?? "generic";

async function session(role: "teacher" | "owner") {
  const [user, supabase] = await Promise.all([getSignedInUser(), createClient()]);
  return user?.role === role && supabase ? { user, supabase } : null;
}

export type Awarded = {
  /** The new ledger row, for Undo; null when there was nothing to take. */
  ledgerId: string | null;
  /** Signed points that were posted: a deduction may be reduced to the balance. */
  applied: number;
};

/** A teacher gives or takes points in their own group. */
export async function awardPoints(input: unknown): Promise<PointsResult<Awarded>> {
  const parsed = awardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session("teacher");
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { student_id, group_id, lesson_id, preset_id, points, reason } = parsed.data;
  const { data, error } = await ctx.supabase
    .rpc("award_points", {
      p_student_id: student_id,
      p_group_id: group_id,
      p_points: preset_id ? 0 : (points ?? 0),
      p_preset_id: preset_id ?? undefined,
      p_reason: preset_id ? undefined : reason,
      p_lesson_id: lesson_id ?? undefined,
    })
    .single();
  if (error) return failure(error);

  refresh();
  return { ok: true, data: { ledgerId: data.ledger_id, applied: data.applied } };
}

/** Undo, within seconds of an award or deduction: posts a reversing row. */
export async function undoPoints(ledgerId: unknown): Promise<PointsResult> {
  const id = z.uuid().safeParse(ledgerId);
  if (!id.success) return { ok: false, error: "notFound" };
  const ctx = await session("teacher");
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase.rpc("undo_points", { p_ledger_id: id.data });
  if (error) return failure(error);

  refresh();
  return { ok: true };
}

/** Owner adjustment: any amount, with a reason. */
export async function adjustPoints(input: unknown): Promise<PointsResult> {
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session("owner");
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { student_id, kind, amount, reason } = parsed.data;
  const { error } = await ctx.supabase.rpc("adjust_points", {
    p_student_id: student_id,
    p_delta: kind === "add" ? amount : -amount,
    p_reason: reason,
  });
  if (error) return failure(error);

  refresh();
  return { ok: true };
}

/** Settings → Points: the programme switch, values and limits. Owner only. */
export async function savePointsSettings(input: unknown): Promise<PointsResult> {
  const parsed = pointsSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session("owner");
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase.from("points_settings").update(parsed.data).eq("singleton", true).select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notAllowed" };

  refresh();
  return { ok: true };
}

/** Add or change a preset. Owner only. */
export async function savePreset(input: unknown): Promise<PointsResult> {
  const parsed = presetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session("owner");
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { id, ...values } = parsed.data;
  if (id) {
    const { data, error } = await ctx.supabase.from("point_presets").update(values).eq("id", id).is("archived_at", null).select("id");
    if (error) return failure(error);
    if (data.length === 0) return { ok: false, error: "notFound" };
  } else {
    // New presets go to the end of their list.
    const { error } = await ctx.supabase.from("point_presets").insert({ ...values, sort: Math.floor(Date.now() / 1000) });
    if (error) return failure(error);
  }

  refresh();
  return { ok: true };
}

/** Remove a preset from the lists. Points already given with it keep its name. Owner only. */
export async function archivePreset(presetId: unknown): Promise<PointsResult> {
  const id = z.uuid().safeParse(presetId);
  if (!id.success) return { ok: false, error: "notFound" };
  const ctx = await session("owner");
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase
    .from("point_presets")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id.data)
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };

  refresh();
  return { ok: true };
}
