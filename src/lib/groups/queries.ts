import "server-only";

import { sanitizeSearch } from "@/lib/domain/leads";
import { tashkentDate, tashkentMonth, tashkentWeek } from "@/lib/domain/time";
import { PAGE_SIZE } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import type { GroupsSearch } from "@/lib/validation/groups";

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

type Group = Tables<"groups">;
type Lesson = Tables<"lessons">;
export type AttendanceMark = Tables<"attendance">["status"];

export type TeacherOption = { id: string; full_name: string };

/** Active teachers, for the group form and for a substitute. */
export async function getTeacherOptions(): Promise<TeacherOption[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("teachers")
    .select("id, full_name")
    .is("archived_at", null)
    .eq("is_active", true)
    .order("full_name");
  if (error) throw new Error(error.message);
  return data;
}

async function activeCounts(groupIds: string[], onDay?: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (groupIds.length === 0) return counts;
  const supabase = await db();
  let query = supabase
    .from("enrollments")
    .select("group_id")
    .in("group_id", groupIds)
    .eq("status", "active");
  if (onDay) query = query.lte("joined_on", onDay);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  for (const row of data) counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
  return counts;
}

// ── Today ──

export type TodayLesson = Pick<Lesson, "id" | "start_time" | "status" | "cancel_reason"> & {
  group: Pick<Group, "id" | "name" | "room" | "duration_min" | "teacher_id">;
  teacher: TeacherOption;
  students: number;
};

/** Today's lessons by time. */
export async function getTodayLessons(now: Date): Promise<TodayLesson[]> {
  const supabase = await db();
  const today = tashkentDate(now);
  const { data, error } = await supabase
    .from("lessons")
    .select(
      "id, start_time, status, cancel_reason, group:groups!inner(id, name, room, duration_min, teacher_id, archived_at), teacher:teachers!inner(id, full_name)",
    )
    .eq("lesson_date", today)
    .is("group.archived_at", null)
    .order("start_time");
  if (error) throw new Error(error.message);

  const counts = await activeCounts([...new Set(data.map((lesson) => lesson.group.id))], today);
  return data.map((lesson) => ({ ...lesson, students: counts.get(lesson.group.id) ?? 0 }));
}

// ── All groups ──

export type GroupRow = Pick<
  Group,
  "id" | "name" | "subject" | "level" | "days" | "start_time" | "capacity" | "monthly_fee" | "status"
> & { teacher: TeacherOption | null; students: number };

export async function getGroups(search: GroupsSearch): Promise<{ rows: GroupRow[]; total: number }> {
  const supabase = await db();
  const from = (search.page - 1) * PAGE_SIZE;

  let query = supabase
    .from("groups")
    .select(
      "id, name, subject, level, days, start_time, capacity, monthly_fee, status, teacher:teachers(id, full_name)",
      { count: "exact" },
    )
    .is("archived_at", null)
    .order("name")
    .order("id")
    .range(from, from + PAGE_SIZE - 1);

  const text = sanitizeSearch(search.q);
  if (text) query = query.or(`name.ilike.%${text}%,subject.ilike.%${text}%`);
  if (search.status) query = query.eq("status", search.status);

  const { data, count, error } = await query;
  if (error && error.code !== "PGRST103") throw new Error(error.message);
  const rows = data ?? [];
  const counts = await activeCounts(rows.map((group) => group.id));
  return {
    total: count ?? rows.length,
    rows: rows.map((group) => ({ ...group, students: counts.get(group.id) ?? 0 })),
  };
}

/** Groups a student can be enrolled in, with how full they are. */
export type OpenGroup = Pick<Group, "id" | "name" | "monthly_fee" | "capacity"> & { students: number };

export async function getOpenGroups(): Promise<OpenGroup[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("groups")
    .select("id, name, monthly_fee, capacity")
    .is("archived_at", null)
    .in("status", ["forming", "active"])
    .order("name");
  if (error) throw new Error(error.message);
  const counts = await activeCounts(data.map((group) => group.id));
  return data.map((group) => ({ ...group, students: counts.get(group.id) ?? 0 }));
}

// ── One group ──

export type GroupDetail = Group & { teacher: TeacherOption | null; students: number };

export async function getGroup(id: string): Promise<GroupDetail | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("groups")
    .select("*, teacher:teachers(id, full_name)")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const counts = await activeCounts([id]);
  return { ...data, students: counts.get(id) ?? 0 };
}

export type GroupStudent = {
  enrollmentId: string;
  joinedOn: string;
  discountKind: string | null;
  discountValue: number | null;
  student: { id: string; full_name: string; phone: string; status: Tables<"students">["status"] };
  balance: number;
  oldestUnpaidMonth: string | null;
  /** This student's marks in this group, for the attendance rate. */
  marks: AttendanceMark[];
};

/** Students in the group now, with balance and their marks in this group. */
export async function getGroupStudents(groupId: string): Promise<GroupStudent[]> {
  const supabase = await db();
  const enrolments = await supabase
    .from("enrollments")
    .select(
      "id, joined_on, discount_kind, discount_value, student:students!inner(id, full_name, phone, status)",
    )
    .eq("group_id", groupId)
    .eq("status", "active");
  if (enrolments.error) throw new Error(enrolments.error.message);
  const ids = enrolments.data.map((row) => row.student.id);
  if (ids.length === 0) return [];

  const [balances, marks] = await Promise.all([
    supabase
      .from("student_balances")
      .select("student_id, balance, oldest_unpaid_month")
      .in("student_id", ids),
    supabase
      .from("attendance")
      .select("student_id, status, lesson:lessons!inner(group_id, status)")
      .eq("lesson.group_id", groupId)
      .neq("lesson.status", "cancelled")
      .in("student_id", ids),
  ]);
  if (balances.error) throw new Error(balances.error.message);
  if (marks.error) throw new Error(marks.error.message);

  return enrolments.data
    .map((row) => {
      const balance = balances.data.find((entry) => entry.student_id === row.student.id);
      return {
        enrollmentId: row.id,
        joinedOn: row.joined_on,
        discountKind: row.discount_kind,
        discountValue: row.discount_value,
        student: row.student,
        balance: balance?.balance ?? 0,
        oldestUnpaidMonth: balance?.oldest_unpaid_month ?? null,
        marks: marks.data.filter((mark) => mark.student_id === row.student.id).map((mark) => mark.status),
      };
    })
    .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name));
}

export type MonthLesson = Pick<Lesson, "id" | "lesson_date" | "start_time" | "status" | "cancel_reason"> & {
  teacher: TeacherOption;
};

export type GroupMonth = {
  lessons: MonthLesson[];
  /** Everyone enrolled at some point in the month. */
  students: Array<{ id: string; full_name: string; joinedOn: string; leftOn: string | null }>;
  /** `${lessonId}:${studentId}` → mark */
  marks: Record<string, AttendanceMark>;
};

/** One month of a group's lessons with every mark: the attendance grid and the lessons list. */
export async function getGroupMonth(groupId: string, month: string): Promise<GroupMonth> {
  const supabase = await db();
  const { start, end } = tashkentMonth(new Date(`${month}-15T12:00:00+05:00`));

  const [lessons, enrolments] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, lesson_date, start_time, status, cancel_reason, teacher:teachers!inner(id, full_name)")
      .eq("group_id", groupId)
      .gte("lesson_date", start)
      .lt("lesson_date", end)
      .order("lesson_date")
      .order("start_time"),
    supabase
      .from("enrollments")
      .select("joined_on, left_on, student:students!inner(id, full_name)")
      .eq("group_id", groupId)
      .lt("joined_on", end)
      .or(`left_on.is.null,left_on.gte.${start}`),
  ]);
  if (lessons.error) throw new Error(lessons.error.message);
  if (enrolments.error) throw new Error(enrolments.error.message);

  const lessonIds = lessons.data.map((lesson) => lesson.id);
  const marks: Record<string, AttendanceMark> = {};
  if (lessonIds.length > 0) {
    const attendance = await supabase
      .from("attendance")
      .select("lesson_id, student_id, status")
      .in("lesson_id", lessonIds);
    if (attendance.error) throw new Error(attendance.error.message);
    for (const row of attendance.data) marks[`${row.lesson_id}:${row.student_id}`] = row.status;
  }

  // A student who left and came back in the same month appears once.
  const students = new Map<string, GroupMonth["students"][number]>();
  for (const row of enrolments.data) {
    const existing = students.get(row.student.id);
    students.set(row.student.id, {
      id: row.student.id,
      full_name: row.student.full_name,
      joinedOn: existing && existing.joinedOn < row.joined_on ? existing.joinedOn : row.joined_on,
      leftOn: row.left_on === null || existing?.leftOn === null ? null : row.left_on,
    });
  }

  return {
    lessons: lessons.data,
    students: [...students.values()].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    marks,
  };
}

export type TrialVisitor = Pick<
  Tables<"leads">,
  "id" | "full_name" | "phone" | "trial_date" | "status"
>;

/** This week's trial visitors (Monday to Sunday). */
export async function getGroupTrials(groupId: string, now: Date): Promise<TrialVisitor[]> {
  const supabase = await db();
  const week = tashkentWeek(now);
  const { data, error } = await supabase
    .from("leads")
    .select("id, full_name, phone, trial_date, status")
    .eq("trial_group_id", groupId)
    .is("archived_at", null)
    .gte("trial_date", week.start)
    .lt("trial_date", week.end)
    .order("trial_date");
  if (error) throw new Error(error.message);
  return data;
}

// ── Lesson sheet ──

export type LessonSheetData = Pick<Lesson, "id" | "lesson_date" | "start_time" | "status" | "cancel_reason"> & {
  group: Pick<Group, "id" | "name" | "teacher_id">;
  teacher: TeacherOption;
  /** Everyone in the group on the lesson's day, with their mark if there is one. */
  students: Array<{ id: string; full_name: string; mark: AttendanceMark | null }>;
};

export async function getLessonSheet(lessonId: string): Promise<LessonSheetData | null> {
  const supabase = await db();
  const lesson = await supabase
    .from("lessons")
    .select(
      "id, lesson_date, start_time, status, cancel_reason, group:groups!inner(id, name, teacher_id), teacher:teachers!inner(id, full_name)",
    )
    .eq("id", lessonId)
    .maybeSingle();
  if (lesson.error) throw new Error(lesson.error.message);
  if (!lesson.data) return null;
  const day = lesson.data.lesson_date;

  const [enrolments, marks] = await Promise.all([
    supabase
      .from("enrollments")
      .select("student:students!inner(id, full_name)")
      .eq("group_id", lesson.data.group.id)
      .lte("joined_on", day)
      .or(`left_on.is.null,left_on.gte.${day}`),
    supabase.from("attendance").select("student_id, status").eq("lesson_id", lessonId),
  ]);
  if (enrolments.error) throw new Error(enrolments.error.message);
  if (marks.error) throw new Error(marks.error.message);

  const markOf = new Map(marks.data.map((row) => [row.student_id, row.status]));
  const students = new Map(enrolments.data.map((row) => [row.student.id, row.student]));
  return {
    ...lesson.data,
    students: [...students.values()]
      .map((student) => ({ ...student, mark: markOf.get(student.id) ?? null }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
  };
}
