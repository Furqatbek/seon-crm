"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { paymentInstant, suggestedPayment } from "@/lib/domain/payments";
import { tashkentDate } from "@/lib/domain/time";
import { createClient } from "@/lib/supabase/server";
import {
  creditSchema,
  paymentSchema,
  voidSchema,
  type FinanceErrorKey,
  type FinanceResult,
} from "@/lib/validation/finance";

const ERRORS: Record<string, FinanceErrorKey> = {
  "42501": "notAllowed",
  P0002: "notFound",
  EF001: "monthNotCurrent",
};

async function session() {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  return supabase && user ? { supabase, user } : null;
}

function firstIssue(error: z.ZodError): FinanceErrorKey {
  return (error.issues[0]?.message as FinanceErrorKey) ?? "generic";
}

function failure(error: { code?: string } | null): { ok: false; error: FinanceErrorKey } {
  return { ok: false, error: (error?.code && ERRORS[error.code]) || "generic" };
}

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

// ── Payments ──

export type PaymentContext = {
  student: { id: string; full_name: string; phone: string };
  /** The student's groups, current ones first. */
  groups: Array<{ id: string; name: string; active: boolean }>;
  /** Below zero is debt. */
  balance: number;
  /** The debt, when the student has one group it can only belong to; otherwise null. */
  suggestedAmount: number | null;
};

/** What the Take payment sheet needs once a student is chosen. */
export async function getPaymentContext(studentIdInput: unknown): Promise<PaymentContext | null> {
  const studentId = z.uuid().safeParse(studentIdInput);
  const ctx = await session();
  if (!studentId.success || !ctx) return null;

  const [student, enrolments] = await Promise.all([
    ctx.supabase
      .from("student_overview")
      .select("id, full_name, phone, balance")
      .eq("id", studentId.data)
      .is("archived_at", null)
      .maybeSingle(),
    ctx.supabase
      .from("enrollments")
      .select("status, joined_on, group:groups(id, name)")
      .eq("student_id", studentId.data)
      .order("joined_on", { ascending: false }),
  ]);
  if (!student.data?.id || enrolments.error) return null;

  const groups = new Map<string, PaymentContext["groups"][number]>();
  for (const enrolment of enrolments.data) {
    if (!enrolment.group) continue;
    const active = enrolment.status === "active" || groups.get(enrolment.group.id)?.active === true;
    groups.set(enrolment.group.id, { ...enrolment.group, active });
  }

  const balance = student.data.balance ?? 0;
  return {
    student: {
      id: student.data.id,
      full_name: student.data.full_name ?? "",
      phone: student.data.phone ?? "",
    },
    groups: [...groups.values()].sort((a, b) => Number(b.active) - Number(a.active)),
    balance,
    suggestedAmount: suggestedPayment(balance, groups.size),
  };
}

/** Take payment. The receipt number is given by the database. */
export async function takePayment(
  input: unknown,
): Promise<FinanceResult<{ id: string; receiptNo: number }>> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const paidAt = paymentInstant(parsed.data.paid_on, new Date());
  if (!paidAt) return { ok: false, error: "dateInFuture" };

  // The payment must be for one of the student's own groups.
  const enrolment = await ctx.supabase
    .from("enrollments")
    .select("id")
    .eq("student_id", parsed.data.student_id)
    .eq("group_id", parsed.data.group_id)
    .limit(1);
  if (enrolment.error) return failure(enrolment.error);
  if (enrolment.data.length === 0) return { ok: false, error: "groupRequired" };

  const { data, error } = await ctx.supabase
    .from("payments")
    .insert({
      student_id: parsed.data.student_id,
      group_id: parsed.data.group_id,
      amount: parsed.data.amount,
      method: parsed.data.method,
      paid_at: paidAt,
      note: parsed.data.note,
      received_by: ctx.user.id,
    })
    .select("id, receipt_no")
    .single();
  if (error) return failure(error);

  refresh();
  return { ok: true, data: { id: data.id, receiptNo: data.receipt_no } };
}

/** Void payment: owner only, reason required. A voided payment drops out of every total. */
export async function voidPayment(input: unknown): Promise<FinanceResult> {
  const parsed = voidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session();
  if (!ctx || ctx.user.role !== "owner") return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase
    .from("payments")
    .update({
      voided_at: new Date().toISOString(),
      void_reason: parsed.data.reason,
      voided_by: ctx.user.id,
    })
    .eq("id", parsed.data.payment_id)
    // A void is final: an already voided payment is left as it is.
    .is("voided_at", null)
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "alreadyVoided" };

  refresh();
  return { ok: true };
}

/** Add credit: a negative charge with a required note, for the current month. */
export async function addCredit(input: unknown): Promise<FinanceResult> {
  const parsed = creditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  // A credit for a group must be for one of the student's own groups.
  if (parsed.data.group_id) {
    const enrolment = await ctx.supabase
      .from("enrollments")
      .select("id")
      .eq("student_id", parsed.data.student_id)
      .eq("group_id", parsed.data.group_id)
      .limit(1);
    if (enrolment.error) return failure(enrolment.error);
    if (enrolment.data.length === 0) return { ok: false, error: "groupRequired" };
  }

  const { error } = await ctx.supabase.from("charges").insert({
    student_id: parsed.data.student_id,
    group_id: parsed.data.group_id,
    billing_month: `${tashkentDate(new Date()).slice(0, 7)}-01`,
    type: "adjustment",
    amount: -parsed.data.amount,
    note: parsed.data.note,
    created_by: ctx.user.id,
  });
  if (error) return failure(error);

  refresh();
  return { ok: true };
}

// ── Monthly charges ──

export type ChargePreview = {
  rows: Array<{
    enrollmentId: string;
    studentName: string;
    groupName: string;
    baseAmount: number;
    discountAmount: number;
    amount: number;
  }>;
  /** How many fees would be created, which can be more than the rows listed. */
  count: number;
  total: number;
};

/** The preview lists at most this many fees; the count and total cover all of them. */
const PREVIEW_ROWS = 200;

/** The fees that would be created for a month. Owner only. */
export async function previewMonthlyCharges(monthInput: unknown): Promise<FinanceResult<ChargePreview>> {
  const month = monthSchema.safeParse(monthInput);
  if (!month.success) return { ok: false, error: "dateInvalid" };
  const ctx = await session();
  if (!ctx || ctx.user.role !== "owner") return { ok: false, error: "notAllowed" };

  const p_month = `${month.data}-01`;
  const [list, summary] = await Promise.all([
    ctx.supabase.rpc("preview_monthly_charges", { p_month }).limit(PREVIEW_ROWS),
    ctx.supabase.rpc("preview_monthly_charges_summary", { p_month }).single(),
  ]);
  if (list.error) return failure(list.error);
  if (summary.error) return failure(summary.error);
  const data = list.data;

  return {
    ok: true,
    data: {
      rows: data.map((row) => ({
        enrollmentId: row.enrollment_id,
        studentName: row.student_name,
        groupName: row.group_name,
        baseAmount: row.base_amount,
        discountAmount: row.discount_amount,
        amount: row.amount,
      })),
      // Counted and summed in the database, over every fee, not only the rows listed.
      count: summary.data.charges,
      total: summary.data.total,
    },
  };
}

/** Generate charges for a month. Owner only; running it twice creates nothing new. */
export async function generateMonthlyCharges(
  monthInput: unknown,
): Promise<FinanceResult<{ created: number }>> {
  const month = monthSchema.safeParse(monthInput);
  if (!month.success) return { ok: false, error: "dateInvalid" };
  const ctx = await session();
  if (!ctx || ctx.user.role !== "owner") return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase.rpc("generate_monthly_charges", {
    p_month: `${month.data}-01`,
  });
  if (error) return failure(error);

  refresh();
  return { ok: true, data: { created: data } };
}
