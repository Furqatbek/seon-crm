"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  payRateFormSchema,
  teacherFormSchema,
  type TeacherErrorKey,
  type TeacherResult,
} from "@/lib/validation/teachers";

const DENIED = "42501";
const UNIQUE = "23505";

// Teachers and their pay belong to the owner. The database enforces it too:
// a manager's insert or update is refused by row level security.
async function ownerSession() {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  return supabase && user?.role === "owner" ? { supabase, user } : null;
}

function firstIssue(error: z.ZodError): TeacherErrorKey {
  return (error.issues[0]?.message as TeacherErrorKey) ?? "generic";
}

function failure(error: { code?: string } | null): { ok: false; error: TeacherErrorKey } {
  return { ok: false, error: error?.code === DENIED ? "notAllowed" : "generic" };
}

export async function createTeacher(input: unknown): Promise<TeacherResult<{ id: string }>> {
  const parsed = teacherFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase
    .from("teachers")
    .insert(parsed.data)
    .select("id")
    .single();
  if (error) return failure(error);

  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function updateTeacher(id: unknown, input: unknown): Promise<TeacherResult> {
  const teacherId = z.uuid().safeParse(id);
  const parsed = teacherFormSchema.safeParse(input);
  if (!teacherId.success) return { ok: false, error: "notFound" };
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase
    .from("teachers")
    .update(parsed.data)
    .eq("id", teacherId.data)
    .is("archived_at", null)
    .select("id");
  if (error) return failure(error);
  if (data.length === 0) return { ok: false, error: "notFound" };

  refresh();
  return { ok: true };
}

export async function archiveTeacher(id: unknown): Promise<TeacherResult> {
  const teacherId = z.uuid().safeParse(id);
  if (!teacherId.success) return { ok: false, error: "notFound" };
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase
    .from("teachers")
    .update({ archived_at: new Date().toISOString(), is_active: false })
    .eq("id", teacherId.data);
  if (error) return failure(error);

  refresh();
  return { ok: true };
}

/** Set new rate: a new row in the history. Existing rates are never edited. */
export async function setPayRate(teacherIdInput: unknown, input: unknown): Promise<TeacherResult> {
  const teacherId = z.uuid().safeParse(teacherIdInput);
  const parsed = payRateFormSchema.safeParse(input);
  if (!teacherId.success) return { ok: false, error: "notFound" };
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const ctx = await ownerSession();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { error } = await ctx.supabase
    .from("teacher_pay_rates")
    .insert({ teacher_id: teacherId.data, ...parsed.data });
  if (error) {
    // One rate per teacher per start date.
    if (error.code === UNIQUE) return { ok: false, error: "rateDateTaken" };
    return failure(error);
  }

  refresh();
  return { ok: true };
}
