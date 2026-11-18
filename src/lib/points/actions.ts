"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getSignedInUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  POINTS_ERRORS,
  TV_LANGUAGES,
  handleRedemptionSchema,
  requestRewardSchema,
  rewardSchema,
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
    const last = await ctx.supabase.from("point_presets").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
    const { error } = await ctx.supabase.from("point_presets").insert({ ...values, sort: (last.data?.sort ?? 0) + 1 });
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

/** A new TV link: every old one stops working. Owner only. */
export async function regenerateTvToken(): Promise<PointsResult<{ token: string }>> {
  const ctx = await session("owner");
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { data, error } = await ctx.supabase.rpc("regenerate_tv_token");
  if (error) return failure(error);
  refresh();
  return { ok: true, data: { token: data } };
}

/** The language of the TV screen. Owner only. */
export async function saveTvLanguage(language: unknown): Promise<PointsResult> {
  const parsed = z.enum(TV_LANGUAGES).safeParse(language);
  if (!parsed.success) return { ok: false, error: "generic" };
  const ctx = await session("owner");
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { data, error } = await ctx.supabase.from("points_settings").update({ tv_language: parsed.data }).eq("singleton", true).select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notAllowed" };
  refresh();
  return { ok: true };
}

/** Hide a student from the TV and the bot's top lists, or show them again. Owner and manager. */
export async function setLeaderboardHidden(studentId: unknown, hidden: unknown): Promise<PointsResult> {
  const id = z.uuid().safeParse(studentId);
  const value = z.boolean().safeParse(hidden);
  if (!id.success || !value.success) return { ok: false, error: "notFound" };
  const [user, supabase] = await Promise.all([getSignedInUser(), createClient()]);
  if (!supabase || !user || user.role === "teacher") return { ok: false, error: "notAllowed" };
  const { data, error } = await supabase
    .from("students")
    .update({ leaderboard_hidden: value.data })
    .eq("id", id.data)
    .is("archived_at", null)
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

// ── Rewards — docs/SPEC.md → "Defaults to confirm → Redeeming" ──

async function staffSession() {
  const [user, supabase] = await Promise.all([getSignedInUser(), createClient()]);
  return supabase && user && user.role !== "teacher" ? { user, supabase } : null;
}

/** Stores a reward's photo and returns its name in the bucket. Owner only: the bucket refuses anyone else. */
export async function uploadRewardPhoto(form: FormData): Promise<PointsResult<{ path: string }>> {
  const file = form.get("photo");
  if (!(file instanceof File) || !(file.type in PHOTO_TYPES) || file.size === 0 || file.size > PHOTO_MAX_BYTES) {
    return { ok: false, error: "photoInvalid" };
  }
  const ctx = await session("owner");
  if (!ctx) return { ok: false, error: "notAllowed" };

  const path = `${crypto.randomUUID()}.${PHOTO_TYPES[file.type as keyof typeof PHOTO_TYPES]}`;
  const { error } = await ctx.supabase.storage.from("reward-photos").upload(path, file, { contentType: file.type });
  if (error) return { ok: false, error: "photoInvalid" };
  return { ok: true, data: { path } };
}

/** Add or change a reward. Owner only. */
export async function saveReward(input: unknown): Promise<PointsResult> {
  const parsed = rewardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session("owner");
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { id, stock_loaded: loaded, ...values } = parsed.data;
  if (id) {
    // Requests take and return units while the form is open: the stock is
    // written only when the owner typed a different number.
    const { stock, ...rest } = values;
    const changed = loaded === undefined || loaded.trim() !== (stock === null ? "" : String(stock));
    const { data, error } = await ctx.supabase
      .from("rewards")
      .update(changed ? values : rest)
      .eq("id", id)
      .is("archived_at", null)
      .select("id");
    if (error) return failure(error);
    if (data.length === 0) return { ok: false, error: "notFound" };
  } else {
    const { error } = await ctx.supabase.from("rewards").insert(values);
    if (error) return failure(error);
  }

  refresh();
  return { ok: true };
}

/** Take a reward out of the catalogue. Requests already made keep it. Owner only. */
export async function archiveReward(rewardId: unknown): Promise<PointsResult> {
  const id = z.uuid().safeParse(rewardId);
  if (!id.success) return { ok: false, error: "notFound" };
  const ctx = await session("owner");
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase.from("rewards").update({ archived_at: new Date().toISOString() }).eq("id", id.data).select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };

  refresh();
  return { ok: true };
}

/** A desk request: the points and one unit of stock are held at once. Owner and manager. */
export async function requestReward(input: unknown): Promise<PointsResult> {
  const parsed = requestRewardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const ctx = await staffSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase.rpc("request_reward", {
    p_student_id: parsed.data.student_id,
    p_reward_id: parsed.data.reward_id,
  });
  if (error) return failure(error);

  refresh();
  return { ok: true };
}

/** Give (final), or reject / cancel with a reason: the points and the stock return. Owner and manager. */
export async function handleRedemption(input: unknown): Promise<PointsResult> {
  const parsed = handleRedemptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await staffSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase.rpc("handle_redemption", {
    p_id: parsed.data.id,
    p_action: parsed.data.action,
    p_note: parsed.data.note || undefined,
  });
  if (error) return failure(error);

  refresh();
  return { ok: true };
}
