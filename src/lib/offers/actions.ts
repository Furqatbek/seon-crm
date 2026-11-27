"use server";

import { refresh } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { parseDiscount } from "@/lib/validation/groups";
import { createClient } from "@/lib/supabase/server";
import { markSchema, slotSchema, voucherProposalSchema, voucherSettingsSchema, type OfferErrorKey, type OfferResult, type VoucherType } from "@/lib/validation/offers";
import { z } from "zod";

// Vouchers and open lessons in the CRM. Everything is written as the
// signed-in user: Row Level Security and the functions decide who may.

async function session(...roles: Array<"owner" | "manager">) {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const allowed = roles.length > 0 ? roles : (["owner", "manager"] as const);
  return user && supabase && (allowed as readonly string[]).includes(user.role) ? { user, supabase } : null;
}

const CODES: Record<string, OfferErrorKey> = { "42501": "notAllowed", P0002: "notFound", "23514": "valueRange" };
const failure = (error: { code?: string }): { ok: false; error: OfferErrorKey } => ({ ok: false, error: (error.code && CODES[error.code]) || "generic" });
const invalid = (error: { issues: { message: string }[] }): { ok: false; error: OfferErrorKey } => ({ ok: false, error: (error.issues[0]?.message as OfferErrorKey) ?? "generic" });

/** Settings → Vouchers. The owner's. */
export async function saveVoucherSettings(input: unknown): Promise<OfferResult> {
  const parsed = voucherSettingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await session("owner");
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { data, error } = await ctx.supabase.from("voucher_settings").update(parsed.data).eq("id", true).select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notAllowed" };
  refresh();
  return { ok: true };
}

/** A new weekly slot, or changes to one. */
export async function saveSlot(input: unknown): Promise<OfferResult> {
  const parsed = slotSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { id, ...slot } = parsed.data;
  const values = { ...slot, korean_level: slot.korean_level === "any" ? null : slot.korean_level, room: slot.room || null, teacher_id: slot.teacher_id || null };
  if (id) {
    const { data, error } = await ctx.supabase.from("open_lesson_slots").update(values).eq("id", id).is("archived_at", null).select("id");
    if (error) return failure(error);
    if (data.length === 0) return { ok: false, error: "notFound" };
  } else {
    const { error } = await ctx.supabase.from("open_lesson_slots").insert(values);
    if (error) return failure(error);
  }
  refresh();
  return { ok: true };
}

/** Archives a slot: it leaves the editor and the app; its past sessions stay on the leads. The owner's. */
export async function archiveSlot(input: unknown): Promise<OfferResult> {
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const ctx = await session("owner");
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { data, error } = await ctx.supabase.from("open_lesson_slots").update({ archived_at: new Date().toISOString(), is_active: false }).eq("id", parsed.data.id).is("archived_at", null).select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}

/** Came or No-show for one booking; "booked" takes the mark back. */
export async function markOpenLesson(input: unknown): Promise<OfferResult> {
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "notFound" };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { error } = await ctx.supabase.rpc("mark_open_lesson", { p_booking_id: parsed.data.booking_id, p_status: parsed.data.status });
  if (error) return failure(error);
  refresh();
  return { ok: true };
}

export type VoucherOffer = {
  /** Why the code cannot be used, or null. */
  problem: "unknown" | "redeemed" | "expired" | null;
  code: string | null;
  type: VoucherType | null;
  value: number | null;
  beforeVoucher: number;
  voucherDiscount: number;
  amount: number;
  lessonsCounted: number;
  /** A trial: the first day that is paid for. */
  paidFrom: string | null;
  /** A trial that runs into the next month: that month and its fee from the first paid day (null when its lessons are not on the timetable yet). */
  nextMonth: string | null;
  nextAmount: number | null;
};

/** What a voucher code would do to the first charge, from propose_voucher_charge(). Null when it cannot be worked out. */
export async function proposeVoucherCharge(input: unknown): Promise<VoucherOffer | null> {
  const parsed = voucherProposalSchema.safeParse(input);
  if (!parsed.success) return null;
  const discount = parseDiscount(parsed.data);
  if ("error" in discount) return null;
  const ctx = await session();
  if (!ctx) return null;
  const { data, error } = await ctx.supabase
    .rpc("propose_voucher_charge", {
      p_group_id: parsed.data.group_id,
      p_joined_on: parsed.data.joined_on,
      p_discount_kind: discount.kind ?? undefined,
      p_discount_value: discount.value ?? undefined,
      p_code: parsed.data.code,
      p_charge_mode: parsed.data.charge_mode,
    })
    .maybeSingle();
  if (error || !data) return null;
  return {
    problem: data.problem === "unknown" || data.problem === "redeemed" || data.problem === "expired" ? data.problem : null,
    code: data.code,
    type: data.type,
    value: data.value,
    beforeVoucher: data.before_voucher,
    voucherDiscount: data.voucher_discount,
    amount: data.amount,
    lessonsCounted: data.lessons_counted,
    paidFrom: data.paid_from,
    nextMonth: data.next_month,
    nextAmount: data.next_amount,
  };
}
