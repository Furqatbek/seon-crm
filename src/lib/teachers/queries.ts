import "server-only";

import { sanitizeSearch } from "@/lib/domain/leads";
import type { PayRate, PayType } from "@/lib/domain/pay-rates";
import { rateOn } from "@/lib/domain/pay-rates";
import { tashkentDate, tashkentMonth } from "@/lib/domain/time";
import { PAGE_SIZE } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type TeacherRow = Pick<
  Tables<"teachers">,
  "id" | "full_name" | "phone" | "subjects" | "is_active"
> & {
  groups: Array<{ id: string; name: string }>;
  lessonsThisMonth: number;
  /** Owner only; null for a manager and for a teacher without a rate yet. */
  payType: PayType | null;
};

export type TeacherGroup = Pick<
  Tables<"groups">,
  "id" | "name" | "subject" | "days" | "start_time" | "status"
>;

export type TeacherLesson = Pick<Tables<"lessons">, "id" | "lesson_date" | "start_time" | "status"> & {
  group: { id: string; name: string; teacher_id: string } | null;
};

export type TeacherRate = PayRate & { id: string };

export type TeacherPayout = Pick<
  Tables<"teacher_payouts">,
  "id" | "month" | "pay_type" | "calculated" | "bonus" | "deduction" | "final_amount" | "status"
>;

export type TeacherDetail = Tables<"teachers"> & {
  groups: TeacherGroup[];
  lessons: TeacherLesson[];
  /** Null for a manager: pay is the owner's. */
  pay: { rates: TeacherRate[]; payouts: TeacherPayout[] } | null;
};

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

/** Lessons that count for a teacher: everything that was not cancelled. */
const NOT_CANCELLED = ["scheduled", "held"] as const;

export async function getTeachers(
  filters: { q: string; page: number },
  options: { withPay: boolean; now: Date },
): Promise<{ rows: TeacherRow[]; total: number }> {
  const supabase = await db();
  const from = (filters.page - 1) * PAGE_SIZE;

  let query = supabase
    .from("teachers")
    .select("id, full_name, phone, subjects, is_active", { count: "exact" })
    .is("archived_at", null)
    .order("full_name")
    .range(from, from + PAGE_SIZE - 1);

  const text = sanitizeSearch(filters.q);
  if (text) {
    const digits = text.replace(/\D/g, "");
    const parts = [`full_name.ilike.%${text}%`];
    if (digits.length >= 3) parts.push(`phone.ilike.%${digits}%`);
    query = query.or(parts.join(","));
  }

  const teachers = await query;
  if (teachers.error && teachers.error.code !== "PGRST103") throw new Error(teachers.error.message);
  const rows = teachers.data ?? [];
  const ids = rows.map((teacher) => teacher.id);
  if (ids.length === 0) return { rows: [], total: teachers.count ?? 0 };

  const month = tashkentMonth(options.now);
  const [groups, lessons, rates] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name, teacher_id")
      .in("teacher_id", ids)
      .is("archived_at", null)
      .in("status", ["forming", "active"])
      .order("name"),
    supabase
      .from("lessons")
      .select("teacher_id")
      .in("teacher_id", ids)
      .in("status", [...NOT_CANCELLED])
      .gte("lesson_date", month.start)
      .lt("lesson_date", month.end),
    options.withPay
      ? supabase
          .from("teacher_pay_rates")
          .select("teacher_id, pay_type, effective_from")
          .in("teacher_id", ids)
      : null,
  ]);
  if (groups.error) throw new Error(groups.error.message);
  if (lessons.error) throw new Error(lessons.error.message);
  if (rates?.error) throw new Error(rates.error.message);

  const today = tashkentDate(options.now);
  return {
    total: teachers.count ?? rows.length,
    rows: rows.map((teacher) => ({
      ...teacher,
      groups: groups.data
        .filter((group) => group.teacher_id === teacher.id)
        .map(({ id, name }) => ({ id, name })),
      lessonsThisMonth: lessons.data.filter((lesson) => lesson.teacher_id === teacher.id).length,
      payType:
        rateOn(
          (rates?.data ?? []).filter((rate) => rate.teacher_id === teacher.id),
          today,
        )?.pay_type ?? null,
    })),
  };
}

export async function getTeacher(
  id: string,
  options: { withPay: boolean; now: Date },
): Promise<TeacherDetail | null> {
  const supabase = await db();
  const month = tashkentMonth(options.now);

  const [teacher, groups, lessons, rates, payouts] = await Promise.all([
    supabase.from("teachers").select("*").eq("id", id).is("archived_at", null).maybeSingle(),
    supabase
      .from("groups")
      .select("id, name, subject, days, start_time, status")
      .eq("teacher_id", id)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("lessons")
      .select("id, lesson_date, start_time, status, group:groups(id, name, teacher_id)")
      .eq("teacher_id", id)
      .gte("lesson_date", month.start)
      .lt("lesson_date", month.end)
      .order("lesson_date")
      .order("start_time"),
    options.withPay
      ? supabase
          .from("teacher_pay_rates")
          .select("id, pay_type, amount, percent, effective_from")
          .eq("teacher_id", id)
          .order("effective_from", { ascending: false })
      : null,
    options.withPay
      ? supabase
          .from("teacher_payouts")
          .select("id, month, pay_type, calculated, bonus, deduction, final_amount, status")
          .eq("teacher_id", id)
          .order("month", { ascending: false })
      : null,
  ]);
  if (teacher.error) throw new Error(teacher.error.message);
  if (groups.error) throw new Error(groups.error.message);
  if (lessons.error) throw new Error(lessons.error.message);
  if (rates?.error) throw new Error(rates.error.message);
  if (payouts?.error) throw new Error(payouts.error.message);
  if (!teacher.data) return null;

  return {
    ...teacher.data,
    groups: groups.data,
    lessons: lessons.data,
    pay: rates && payouts ? { rates: rates.data, payouts: payouts.data } : null,
  };
}
