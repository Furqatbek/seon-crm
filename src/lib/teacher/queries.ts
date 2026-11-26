import "server-only";

import type { AttendanceStatus } from "@/lib/domain/attendance";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/types";

// What a teacher can read — docs/SPEC.md → "Screens → My groups".
// Every function here is a database function that checks the group is the
// caller's own and returns students' names only.

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export type MyGroup = {
  id: string;
  name: string;
  subject: string;
  level: string | null;
  days: number[];
  start_time: string;
  duration_min: number;
  status: Enums<"group_status">;
  room: { number: string; name: string | null } | null;
  students: number;
};

export async function getMyGroups(): Promise<MyGroup[]> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("teacher_groups");
  if (error) throw new Error(error.message);
  return data.map(({ room_number, room_name, ...group }) => ({
    ...group,
    room: room_number ? { number: room_number, name: room_name } : null,
  }));
}

export type MyLesson = {
  id: string;
  lesson_date: string;
  start_time: string;
  status: Enums<"lesson_status">;
  /** How many students have a mark. */
  marked: number;
  /** Not cancelled and not in the future. */
  can_mark: boolean;
};

/** The last 7 days and the next 14. Null when the group is not the teacher's. */
export async function getMyLessons(groupId: string): Promise<MyLesson[] | null> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("teacher_lessons", { p_group_id: groupId });
  if (error) {
    if (error.code === "42501") return null;
    throw new Error(error.message);
  }
  return data;
}

export type MyLessonSheet = {
  id: string;
  groupId: string;
  lesson_date: string;
  start_time: string;
  status: Enums<"lesson_status">;
  can_mark: boolean;
  students: Array<{ id: string; full_name: string; mark: AttendanceStatus | null }>;
};

/** One lesson's attendance sheet, or null when it is not the teacher's to open. */
export async function getMyLessonSheet(lessonId: string): Promise<MyLessonSheet | null> {
  const supabase = await db();
  const [lesson, sheet] = await Promise.all([
    supabase.rpc("teacher_lesson", { p_lesson_id: lessonId }).maybeSingle(),
    supabase.rpc("teacher_lesson_sheet", { p_lesson_id: lessonId }),
  ]);
  if (lesson.error || sheet.error || !lesson.data) return null;
  return {
    id: lessonId,
    groupId: lesson.data.group_id,
    lesson_date: lesson.data.lesson_date,
    start_time: lesson.data.start_time,
    status: lesson.data.status,
    can_mark: lesson.data.can_mark,
    students: sheet.data.map((row) => ({ id: row.student_id, full_name: row.full_name, mark: row.mark })),
  };
}

/** Held lessons the signed-in teacher taught this month, substitutions included. */
export async function getMyLessonsThisMonth(): Promise<number> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("teacher_lessons_this_month");
  // 0 while a deploy is ahead of its migration.
  return error ? 0 : data;
}
