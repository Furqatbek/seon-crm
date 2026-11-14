"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { sanitizeSearch } from "@/lib/domain/leads";
import { parseMoneyInput } from "@/lib/domain/pay-rates";
import { createClient } from "@/lib/supabase/server";
import {
  attendanceSchema,
  cancelLessonSchema,
  enrolSchema,
  groupFormSchema,
  leaveSchema,
  parseDiscount,
  proposalSchema,
  substituteSchema,
  transferSchema,
  type GroupErrorKey,
  type GroupResult,
} from "@/lib/validation/groups";

// Database error codes → messages. EC… are raised by the functions in
// supabase/migrations/20261113130000_groups.sql.
const ERRORS: Record<string, GroupErrorKey> = {
  "42501": "notAllowed",
  "23505": "alreadyEnrolled",
  P0002: "notFound",
  EC001: "groupClosed",
  EC002: "dateOutOfRange",
  EC003: "lessonCancelled",
  EC004: "lessonFuture",
  EC005: "notInGroup",
  EC006: "sameGroup",
};

async function session() {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  return supabase && user ? { supabase, user } : null;
}

function firstIssue(error: z.ZodError): GroupErrorKey {
  return (error.issues[0]?.message as GroupErrorKey) ?? "generic";
}

function failure(error: { code?: string } | null, denied: GroupErrorKey = "notAllowed") {
  const key = error?.code ? ERRORS[error.code] : undefined;
  return { ok: false as const, error: key === "notAllowed" ? denied : (key ?? "generic") };
}

// ── Groups ──

export async function createGroup(input: unknown): Promise<GroupResult<{ id: string }>> {
  const parsed = groupFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  // Creating the row also generates its lessons (database trigger).
  const { data, error } = await ctx.supabase.from("groups").insert(parsed.data).select("id").single();
  if (error) return failure(error);

  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function updateGroup(id: unknown, input: unknown): Promise<GroupResult> {
  const groupId = z.uuid().safeParse(id);
  const parsed = groupFormSchema.safeParse(input);
  if (!groupId.success) return { ok: false, error: "notFound" };
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  // A changed schedule rebuilds future lessons without attendance (database trigger).
  const { data, error } = await ctx.supabase
    .from("groups")
    .update(parsed.data)
    .eq("id", groupId.data)
    .is("archived_at", null)
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };

  refresh();
  return { ok: true };
}

/** Owner only: the database refuses anyone else. */
export async function archiveGroup(id: unknown): Promise<GroupResult> {
  const groupId = z.uuid().safeParse(id);
  if (!groupId.success) return { ok: false, error: "notFound" };
  const ctx = await session();
  if (!ctx || ctx.user.role !== "owner") return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase
    .from("groups")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", groupId.data);
  if (error) return failure(error);

  refresh();
  return { ok: true };
}

// ── Lessons ──

/** Saves the marks and marks the lesson held, in one database function. */
export async function saveAttendance(input: unknown): Promise<GroupResult> {
  const parsed = attendanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase.rpc("save_attendance", {
    p_lesson_id: parsed.data.lesson_id,
    p_marks: parsed.data.marks,
  });
  // For a manager "not allowed" here means the 7-day window has passed.
  if (error) return failure(error, "attendanceLocked");

  refresh();
  return { ok: true };
}

export async function cancelLesson(input: unknown): Promise<GroupResult> {
  const parsed = cancelLessonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase
    .from("lessons")
    .update({ status: "cancelled", cancel_reason: parsed.data.reason })
    .eq("id", parsed.data.lesson_id)
    .neq("status", "cancelled")
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };

  refresh();
  return { ok: true };
}

export async function restoreLesson(id: unknown): Promise<GroupResult> {
  const lessonId = z.uuid().safeParse(id);
  if (!lessonId.success) return { ok: false, error: "notFound" };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase.rpc("restore_lesson", { p_lesson_id: lessonId.data });
  if (error) return failure(error);

  refresh();
  return { ok: true };
}

/** A substitute for one lesson: per-lesson pay goes to whoever taught it. */
export async function setLessonTeacher(input: unknown): Promise<GroupResult> {
  const parsed = substituteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase
    .from("lessons")
    .update({ teacher_id: parsed.data.teacher_id })
    .eq("id", parsed.data.lesson_id)
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };

  refresh();
  return { ok: true };
}

// ── Enrol, leave, transfer ──

export type FirstChargeProposal = {
  billingMonth: string;
  baseAmount: number;
  discountAmount: number;
  fullAmount: number;
  lessonsInMonth: number;
  lessonsCounted: number;
  isProrated: boolean;
  amount: number;
};

/** The proposed first charge for the enrol sheet, from propose_first_charge(). */
export async function proposeFirstCharge(input: unknown): Promise<FirstChargeProposal | null> {
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) return null;
  const discount = parseDiscount(parsed.data);
  if ("error" in discount) return null;
  const ctx = await session();
  if (!ctx) return null;

  const { data, error } = await ctx.supabase
    .rpc("propose_first_charge", {
      p_group_id: parsed.data.group_id,
      p_joined_on: parsed.data.joined_on,
      p_discount_kind: discount.kind ?? undefined,
      p_discount_value: discount.value ?? undefined,
    })
    .maybeSingle();
  if (error || !data) return null;

  return {
    billingMonth: data.billing_month,
    baseAmount: data.base_amount,
    discountAmount: data.discount_amount,
    fullAmount: data.full_amount,
    lessonsInMonth: data.lessons_in_month,
    lessonsCounted: data.lessons_counted,
    isProrated: data.is_prorated,
    amount: data.amount,
  };
}

function chargeArgs(input: { charge_mode: string; custom_amount: string; charge_note: string }) {
  const custom = input.charge_mode === "custom";
  return {
    p_charge_mode: input.charge_mode,
    p_custom_amount: custom ? (parseMoneyInput(input.custom_amount) ?? undefined) : undefined,
    p_charge_note: custom ? input.charge_note : undefined,
  };
}

function creditArgs(input: { credit_amount: string; credit_note: string }) {
  const amount = parseMoneyInput(input.credit_amount) ?? 0;
  return {
    p_credit_amount: amount > 0 ? amount : undefined,
    p_credit_note: amount > 0 ? input.credit_note : undefined,
  };
}

/** Enrols the student and creates the first charge, in one database function. */
export async function enrolStudent(input: unknown): Promise<GroupResult> {
  const parsed = enrolSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const discount = parseDiscount(parsed.data);
  if ("error" in discount) return { ok: false, error: discount.error };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase.rpc("enrol_student", {
    p_student_id: parsed.data.student_id,
    p_group_id: parsed.data.group_id,
    p_joined_on: parsed.data.joined_on,
    p_discount_kind: discount.kind ?? undefined,
    p_discount_value: discount.value ?? undefined,
    p_note: parsed.data.note || undefined,
    ...chargeArgs(parsed.data),
  });
  if (error) return failure(error);

  refresh();
  return { ok: true };
}

/** Leave group: sets left_on, with an optional credit (note required). */
export async function leaveGroup(input: unknown): Promise<GroupResult> {
  const parsed = leaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase.rpc("leave_group", {
    p_enrollment_id: parsed.data.enrollment_id,
    p_left_on: parsed.data.left_on,
    ...creditArgs(parsed.data),
  });
  if (error) return failure(error);

  refresh();
  return { ok: true };
}

/** Transfer: leaves group A and enrols in group B on the same date. */
export async function transferStudent(input: unknown): Promise<GroupResult> {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const discount = parseDiscount(parsed.data);
  if ("error" in discount) return { ok: false, error: discount.error };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase.rpc("transfer_student", {
    p_enrollment_id: parsed.data.enrollment_id,
    p_to_group_id: parsed.data.group_id,
    p_on: parsed.data.joined_on,
    ...creditArgs(parsed.data),
    p_discount_kind: discount.kind ?? undefined,
    p_discount_value: discount.value ?? undefined,
    ...chargeArgs(parsed.data),
  });
  if (error) return failure(error);

  refresh();
  return { ok: true };
}

export type StudentOption = { id: string; full_name: string; phone: string };

/** Students to enrol, by name or phone, leaving out those already in the group. */
export async function searchStudents(
  queryInput: unknown,
  excludeGroupId?: unknown,
): Promise<StudentOption[]> {
  const text = typeof queryInput === "string" ? sanitizeSearch(queryInput) : "";
  const groupId = z.uuid().safeParse(excludeGroupId);
  const ctx = await session();
  if (!ctx || text.length < 2) return [];

  const digits = text.replace(/\D/g, "");
  const parts = [`full_name.ilike.%${text}%`];
  if (digits.length >= 3) parts.push(`phone.ilike.%${digits}%`, `parent_phone.ilike.%${digits}%`);

  let query = ctx.supabase
    .from("students")
    .select("id, full_name, phone")
    .is("archived_at", null)
    .or(parts.join(","))
    .order("full_name")
    .limit(8);

  if (groupId.success) {
    const members = await ctx.supabase
      .from("enrollments")
      .select("student_id")
      .eq("group_id", groupId.data)
      .eq("status", "active");
    const ids = (members.data ?? []).map((row) => row.student_id);
    if (ids.length > 0) query = query.not("id", "in", `(${ids.join(",")})`);
  }

  const { data } = await query;
  return data ?? [];
}
