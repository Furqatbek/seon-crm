"use server";

import { refresh } from "next/cache";

import { getTeacherUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { attendanceSchema, type GroupErrorKey } from "@/lib/validation/groups";

export type TeacherResult = { ok: true } | { ok: false; error: GroupErrorKey };

// teacher_save_attendance() error codes → messages under groups.errors.
const ERRORS: Record<string, GroupErrorKey> = {
  "42501": "notAllowed",
  P0002: "notFound",
  EC003: "lessonCancelled",
  EC004: "lessonFuture",
  EC005: "notInGroup",
  ET001: "attendanceLocked",
};

/**
 * A teacher marks a lesson of their own group. The database function checks
 * the group is theirs and the lesson is not older than 7 days.
 */
export async function saveMyAttendance(input: unknown): Promise<TeacherResult> {
  const parsed = attendanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: (parsed.error.issues[0]?.message as GroupErrorKey) ?? "generic" };
  const [supabase, user] = await Promise.all([createClient(), getTeacherUser()]);
  if (!supabase || !user) return { ok: false, error: "notAllowed" };

  const { error } = await supabase.rpc("teacher_save_attendance", {
    p_lesson_id: parsed.data.lesson_id,
    p_marks: parsed.data.marks,
  });
  if (error) return { ok: false, error: (error.code && ERRORS[error.code]) || "generic" };
  refresh();
  return { ok: true };
}
