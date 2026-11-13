import "server-only";

import { sanitizeSearch } from "@/lib/domain/leads";
import { tashkentMonth } from "@/lib/domain/time";
import { PAGE_SIZE } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import type { StudentsSearch } from "@/lib/validation/students";

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export type GroupOption = { id: string; name: string };

export type StudentRow = {
  id: string;
  full_name: string;
  phone: string;
  status: Tables<"students">["status"];
  telegramLinked: boolean;
  balance: number;
  oldestUnpaidMonth: string | null;
  groups: GroupOption[];
};

export type CentreBilling = { dueDay: number; botUsername: string | null };

export async function getCentreBilling(): Promise<CentreBilling> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("centre_settings")
    .select("due_day, telegram_bot_username")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { dueDay: data?.due_day ?? 5, botUsername: data?.telegram_bot_username ?? null };
}

/** Groups a student can be filtered by. */
export async function getGroupOptions(): Promise<GroupOption[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("groups")
    .select("id, name")
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return data;
}

export async function getStudents(
  search: StudentsSearch,
): Promise<{ rows: StudentRow[]; total: number }> {
  const supabase = await db();
  const from = (search.page - 1) * PAGE_SIZE;

  let query = supabase
    .from("student_overview")
    .select("id, full_name, phone, status, telegram_chat_id, balance, oldest_unpaid_month", {
      count: "exact",
    })
    .is("archived_at", null)
    .order("full_name")
    .order("id")
    .range(from, from + PAGE_SIZE - 1);

  const text = sanitizeSearch(search.q);
  if (text) {
    const digits = text.replace(/\D/g, "");
    const parts = [`full_name.ilike.%${text}%`, `parent_name.ilike.%${text}%`];
    if (digits.length >= 3) {
      parts.push(`phone.ilike.%${digits}%`, `parent_phone.ilike.%${digits}%`);
    }
    query = query.or(parts.join(","));
  }
  if (search.status) query = query.eq("status", search.status);
  if (search.debt) query = query.lt("balance", 0);
  if (search.group) {
    // A group has at most a few dozen students, so their ids fit in the filter.
    const members = await supabase
      .from("enrollments")
      .select("student_id")
      .eq("group_id", search.group)
      .eq("status", "active");
    if (members.error) throw new Error(members.error.message);
    const ids = members.data.map((row) => row.student_id);
    if (ids.length === 0) return { rows: [], total: 0 };
    query = query.in("id", ids);
  }

  const students = await query;
  if (students.error && students.error.code !== "PGRST103") {
    throw new Error(students.error.message);
  }
  const rows = students.data ?? [];
  const ids = rows.flatMap((row) => (row.id ? [row.id] : []));
  if (ids.length === 0) return { rows: [], total: students.count ?? 0 };

  const enrolments = await supabase
    .from("enrollments")
    .select("student_id, group:groups(id, name)")
    .in("student_id", ids)
    .eq("status", "active");
  if (enrolments.error) throw new Error(enrolments.error.message);

  return {
    total: students.count ?? rows.length,
    rows: rows.map((row) => ({
      // A view's columns are typed nullable; these come from students and are not.
      id: row.id!,
      full_name: row.full_name!,
      phone: row.phone!,
      status: row.status!,
      telegramLinked: row.telegram_chat_id !== null,
      balance: row.balance ?? 0,
      oldestUnpaidMonth: row.oldest_unpaid_month,
      groups: enrolments.data
        .filter((enrolment) => enrolment.student_id === row.id && enrolment.group)
        .map((enrolment) => enrolment.group!)
        .sort((a, b) => a.name.localeCompare(b.name)),
    })),
  };
}

export type StudentEnrolment = Pick<
  Tables<"enrollments">,
  "id" | "joined_on" | "left_on" | "status" | "discount_kind" | "discount_value" | "note"
> & {
  group: Pick<Tables<"groups">, "id" | "name" | "subject" | "monthly_fee" | "days" | "start_time"> | null;
};

export type StudentCharge = Pick<
  Tables<"charges">,
  | "id"
  | "created_at"
  | "billing_month"
  | "type"
  | "amount"
  | "is_prorated"
  | "lessons_counted"
  | "lessons_in_month"
  | "note"
> & { group: { name: string } | null };

export type StudentPayment = Pick<
  Tables<"payments">,
  "id" | "paid_at" | "amount" | "method" | "receipt_no" | "note" | "voided_at" | "void_reason"
> & { group: { name: string } | null };

export type StudentLesson = {
  id: string;
  group_id: string;
  lesson_date: string;
  status: Tables<"lessons">["status"];
  /** This student's mark, if the lesson was marked. */
  mark: Tables<"attendance">["status"] | null;
};

export type StudentMessage = Pick<
  Tables<"messages">,
  "id" | "created_at" | "sent_at" | "channel" | "type" | "status" | "body" | "error"
>;

export type StudentDetail = Tables<"students"> & {
  balance: number;
  oldestUnpaidMonth: string | null;
  enrolments: StudentEnrolment[];
};

export async function getStudent(id: string): Promise<StudentDetail | null> {
  const supabase = await db();
  const [student, balance, enrolments] = await Promise.all([
    supabase.from("students").select("*").eq("id", id).is("archived_at", null).maybeSingle(),
    supabase
      .from("student_balances")
      .select("balance, oldest_unpaid_month")
      .eq("student_id", id)
      .maybeSingle(),
    supabase
      .from("enrollments")
      .select(
        "id, joined_on, left_on, status, discount_kind, discount_value, note, group:groups(id, name, subject, monthly_fee, days, start_time)",
      )
      .eq("student_id", id)
      .order("status")
      .order("joined_on", { ascending: false }),
  ]);
  if (student.error) throw new Error(student.error.message);
  if (balance.error) throw new Error(balance.error.message);
  if (enrolments.error) throw new Error(enrolments.error.message);
  if (!student.data) return null;

  return {
    ...student.data,
    balance: balance.data?.balance ?? 0,
    oldestUnpaidMonth: balance.data?.oldest_unpaid_month ?? null,
    enrolments: enrolments.data,
  };
}

/** Every charge and payment of the student, for the ledger. */
export async function getStudentLedger(
  id: string,
): Promise<{ charges: StudentCharge[]; payments: StudentPayment[] }> {
  const supabase = await db();
  const [charges, payments] = await Promise.all([
    supabase
      .from("charges")
      .select(
        "id, created_at, billing_month, type, amount, is_prorated, lessons_counted, lessons_in_month, note, group:groups(name)",
      )
      .eq("student_id", id),
    supabase
      .from("payments")
      .select("id, paid_at, amount, method, receipt_no, note, voided_at, void_reason, group:groups(name)")
      .eq("student_id", id),
  ]);
  if (charges.error) throw new Error(charges.error.message);
  if (payments.error) throw new Error(payments.error.message);
  return { charges: charges.data, payments: payments.data };
}

/**
 * One month of lessons in the student's groups, with the student's marks.
 * Only lessons while the student was enrolled are included.
 */
export async function getStudentAttendance(
  student: Pick<StudentDetail, "id" | "enrolments">,
  month: string,
): Promise<StudentLesson[]> {
  const supabase = await db();
  const { start, end } = tashkentMonth(new Date(`${month}-15T12:00:00+05:00`));
  const groupIds = [...new Set(student.enrolments.flatMap((e) => (e.group ? [e.group.id] : [])))];
  if (groupIds.length === 0) return [];

  const [lessons, marks] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, group_id, lesson_date, status")
      .in("group_id", groupIds)
      .gte("lesson_date", start)
      .lt("lesson_date", end)
      .order("lesson_date")
      .order("start_time"),
    supabase
      .from("attendance")
      .select("lesson_id, status, lesson:lessons!inner(lesson_date)")
      .eq("student_id", student.id)
      .gte("lesson.lesson_date", start)
      .lt("lesson.lesson_date", end),
  ]);
  if (lessons.error) throw new Error(lessons.error.message);
  if (marks.error) throw new Error(marks.error.message);

  const markOf = new Map(marks.data.map((row) => [row.lesson_id, row.status]));
  return lessons.data
    .filter((lesson) =>
      student.enrolments.some(
        (enrolment) =>
          enrolment.group?.id === lesson.group_id &&
          enrolment.joined_on <= lesson.lesson_date &&
          (enrolment.left_on === null || enrolment.left_on >= lesson.lesson_date),
      ),
    )
    .map((lesson) => ({ ...lesson, mark: markOf.get(lesson.id) ?? null }));
}

export async function getStudentMessages(id: string): Promise<StudentMessage[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("messages")
    .select("id, created_at, sent_at, channel, type, status, body, error")
    .eq("student_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data;
}
