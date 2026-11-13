"use server";

import { refresh } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { canMoveLead, nextContactTimestamp, normalizePhone } from "@/lib/domain/leads";
import { createClient } from "@/lib/supabase/server";
import {
  leadActivitySchema,
  leadFormSchema,
  moveLeadSchema,
  type LeadErrorKey,
  type LeadResult,
} from "@/lib/validation/leads";
import { z } from "zod";

const DENIED = "42501";

async function session() {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  return supabase && user ? { supabase, user } : null;
}

function firstIssue(error: z.ZodError): LeadErrorKey {
  return (error.issues[0]?.message as LeadErrorKey) ?? "generic";
}

function failure(error: { code?: string } | null): { ok: false; error: LeadErrorKey } {
  return { ok: false, error: error?.code === DENIED ? "notAllowed" : "generic" };
}

export async function createLead(input: unknown): Promise<LeadResult<{ id: string }>> {
  const parsed = leadFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { next_contact, ...fields } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("leads")
    .insert({
      ...fields,
      next_contact_at: next_contact ? nextContactTimestamp(next_contact) : null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) return failure(error);

  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function updateLead(id: unknown, input: unknown): Promise<LeadResult> {
  const leadId = z.uuid().safeParse(id);
  const parsed = leadFormSchema.safeParse(input);
  if (!leadId.success) return { ok: false, error: "notFound" };
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { next_contact, ...fields } = parsed.data;
  // A won lead is read-only: the filter leaves it untouched.
  const { data, error } = await ctx.supabase
    .from("leads")
    .update({
      ...fields,
      next_contact_at: next_contact ? nextContactTimestamp(next_contact) : null,
    })
    .eq("id", leadId.data)
    .neq("status", "won")
    .is("archived_at", null)
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };

  refresh();
  return { ok: true };
}

/**
 * Moves a lead to another stage. Lost needs a reason; Trial needs a group and
 * a date (Book trial). The timeline row is written by a database trigger, so
 * it cannot be skipped.
 */
export async function moveLead(input: unknown): Promise<LeadResult> {
  const parsed = moveLeadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { id, to, lostReason, trialGroupId, trialDate } = parsed.data;

  const current = await ctx.supabase
    .from("leads")
    .select("status")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (current.error) return failure(current.error);
  if (!current.data) return { ok: false, error: "notFound" };
  if (!canMoveLead(current.data.status, to)) return { ok: false, error: "moveNotAllowed" };

  const { data, error } = await ctx.supabase
    .from("leads")
    .update({
      status: to,
      lost_reason: to === "lost" ? lostReason : null,
      ...(to === "trial" ? { trial_group_id: trialGroupId, trial_date: trialDate } : {}),
    })
    .eq("id", id)
    // Only if nobody moved it in the meantime.
    .eq("status", current.data.status)
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "moveNotAllowed" };

  refresh();
  return { ok: true };
}

/** Log call and Add note. */
export async function addLeadActivity(input: unknown): Promise<LeadResult> {
  const parsed = leadActivitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase.from("lead_activities").insert({
    lead_id: parsed.data.leadId,
    kind: parsed.data.kind,
    body: parsed.data.body || null,
    created_by: ctx.user.id,
  });
  if (error) return failure(error);

  refresh();
  return { ok: true };
}

/** Owner only: the database refuses anyone else. */
export async function archiveLead(id: unknown): Promise<LeadResult> {
  const leadId = z.uuid().safeParse(id);
  if (!leadId.success) return { ok: false, error: "notFound" };
  const ctx = await session();
  if (!ctx || ctx.user.role !== "owner") return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase
    .from("leads")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", leadId.data);
  if (error) return failure(error);

  refresh();
  return { ok: true };
}

export type PhoneMatch = { kind: "lead" | "student"; id: string; full_name: string };

/** Leads and students that already use this phone number (also as a parent's). */
export async function findPhoneMatches(
  phoneInput: unknown,
  exclude: { leadId?: string | null; studentId?: string | null } = {},
): Promise<PhoneMatch[]> {
  const phone = typeof phoneInput === "string" ? normalizePhone(phoneInput) : null;
  const excludeLead = z.uuid().safeParse(exclude?.leadId);
  const excludeStudent = z.uuid().safeParse(exclude?.studentId);
  const ctx = await session();
  if (!phone || !ctx) return [];

  let leads = ctx.supabase
    .from("leads")
    .select("id, full_name")
    .eq("phone", phone)
    .is("archived_at", null)
    // A won lead is already a student, who is listed below.
    .neq("status", "won")
    .limit(3);
  if (excludeLead.success) leads = leads.neq("id", excludeLead.data);

  let students = ctx.supabase
    .from("students")
    .select("id, full_name")
    .or(`phone.eq.${phone},parent_phone.eq.${phone}`)
    .is("archived_at", null)
    .limit(3);
  if (excludeStudent.success) students = students.neq("id", excludeStudent.data);

  const [leadMatches, studentMatches] = await Promise.all([leads, students]);

  return [
    ...(leadMatches.data ?? []).map((row) => ({ kind: "lead" as const, ...row })),
    ...(studentMatches.data ?? []).map((row) => ({ kind: "student" as const, ...row })),
  ];
}
