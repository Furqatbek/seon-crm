import "server-only";

import type { UserRole } from "@/lib/auth";
import { EARNED_SOURCES as POINTS_SOURCES, type EarnedSource as PointsSource } from "@/lib/domain/points";
import { createClient } from "@/lib/supabase/server";

// Every figure comes from one SQL function per chart (supabase/migrations/
// …_reports.sql), which use the same rules as Finance. Nothing is added up here.

export type ReportKpis = {
  /** Money figures are null for a manager. */
  collected: number | null;
  costs: number | null;
  profit: number | null;
  totalDebt: number | null;
  activeStudents: number;
  newLeads: number;
  leadConversion: number | null;
  attendanceRate: number | null;
};

export type MonthMoney = { month: string; collected: number; expenses: number; salaries: number; costs: number };
export type RevenueRow = { dimension: "group" | "subject"; name: string; collected: number };
export type FunnelRow = { dimension: "stage" | "source"; key: string; leads: number; won: number };
export type StudentsRow = { month: string; active: number; joined: number; left: number };
export type AttendanceRow = {
  groupId: string;
  groupName: string;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number | null;
};
export type DebtAgeRow = { bucket: "0_30" | "31_60" | "over_60"; amount: number; students: number };

export type Report = {
  kpis: ReportKpis;
  funnel: FunnelRow[];
  students: StudentsRow[];
  attendance: AttendanceRow[];
  /** Owner only: null for a manager, who never asks the database for them. */
  money: { months: MonthMoney[]; revenue: RevenueRow[]; debtAge: DebtAgeRow[] } | null;
};

function rows<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

/** The whole report for a period of months ("YYYY-MM", both included). */
export async function getReport(period: { from: string; to: string }, role: UserRole): Promise<Report> {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const args = { p_from: `${period.from}-01`, p_to: `${period.to}-01` };
  const owner = role === "owner";

  const [kpis, funnel, students, attendance, months, revenue, debtAge] = await Promise.all([
    supabase.rpc("report_kpis", args).single(),
    supabase.rpc("report_lead_funnel", args),
    supabase.rpc("report_students", args),
    supabase.rpc("report_attendance", args),
    owner ? supabase.rpc("report_collected_vs_expenses", args) : null,
    owner ? supabase.rpc("report_revenue", args) : null,
    owner ? supabase.rpc("report_debt_age") : null,
  ]);
  if (kpis.error) throw new Error(kpis.error.message);

  return {
    kpis: {
      collected: kpis.data.collected,
      costs: kpis.data.costs,
      profit: kpis.data.profit,
      totalDebt: kpis.data.total_debt,
      activeStudents: kpis.data.active_students,
      newLeads: kpis.data.new_leads,
      leadConversion: kpis.data.lead_conversion,
      attendanceRate: kpis.data.attendance_rate,
    },
    funnel: rows(funnel).map((row) => ({
      dimension: row.dimension === "source" ? "source" : "stage",
      key: row.key,
      leads: row.leads,
      won: row.won,
    })),
    students: rows(students).map((row) => ({
      month: row.month.slice(0, 7),
      active: row.active,
      joined: row.joined,
      left: row.left_count,
    })),
    attendance: rows(attendance).map((row) => ({
      groupId: row.group_id,
      groupName: row.group_name,
      present: row.present,
      late: row.late,
      absent: row.absent,
      excused: row.excused,
      rate: row.rate,
    })),
    money:
      months && revenue && debtAge
        ? {
            months: rows(months).map((row) => ({ ...row, month: row.month.slice(0, 7) })),
            revenue: rows(revenue).map((row) => ({
              dimension: row.dimension === "subject" ? "subject" : "group",
              name: row.name,
              collected: row.collected,
            })),
            debtAge: rows(debtAge).map((row) => ({
              bucket: row.bucket as DebtAgeRow["bucket"],
              amount: row.amount,
              students: row.students,
            })),
          }
        : null,
  };
}

// ── Points — supabase/migrations/20261124100000_points_reports.sql ──


export type PointsReport = {
  kpis: {
    earned: number;
    deducted: number;
    spent: number;
    unspent: number;
    rewardsGiven: number;
    studentsWithoutPoints: number;
  };
  /** One row per month, with the points earned from each source. */
  bySource: Array<{ month: string } & Record<PointsSource, number>>;
  byTeacher: Array<{ name: string; awards: number; deductions: number }>;
  topStudents: Array<{ name: string; points: number }>;
  rewards: Array<{ name: string; given: number; points: number }>;
  byGroup: Array<{ name: string; students: number; points: number; average: number }>;
};

/**
 * The points report for a period of months ("YYYY-MM", both included). The
 * database narrows it to a teacher's own groups; nothing is added up here.
 */
export async function getPointsReport(period: { from: string; to: string }): Promise<PointsReport> {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const args = { p_from: `${period.from}-01`, p_to: `${period.to}-01` };

  const [kpis, sources, teachers, top, rewards, groups] = await Promise.all([
    supabase.rpc("report_points_kpis", args).single(),
    supabase.rpc("report_points_by_source", args),
    supabase.rpc("report_points_by_teacher", args),
    supabase.rpc("report_points_top_students", args),
    supabase.rpc("report_rewards_given", args),
    supabase.rpc("report_points_by_group", args),
  ]);
  if (kpis.error) throw new Error(kpis.error.message);

  const months = new Map<string, { month: string } & Record<PointsSource, number>>();
  for (const row of rows(sources)) {
    const month = row.month.slice(0, 7);
    if (!months.has(month)) {
      months.set(month, { month, attendance: 0, perfect_month: 0, on_time_payment: 0, referral: 0, teacher_award: 0, owner_adjustment: 0 });
    }
    if ((POINTS_SOURCES as readonly string[]).includes(row.source)) months.get(month)![row.source as PointsSource] = row.points;
  }

  return {
    kpis: {
      earned: kpis.data.earned,
      deducted: kpis.data.deducted,
      spent: kpis.data.spent,
      unspent: kpis.data.unspent,
      rewardsGiven: kpis.data.rewards_given,
      studentsWithoutPoints: kpis.data.students_without_points,
    },
    bySource: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    byTeacher: rows(teachers).map((row) => ({ name: row.teacher_name, awards: row.awards, deductions: row.deductions })),
    topStudents: rows(top).map((row) => ({ name: row.student_name, points: row.points })),
    rewards: rows(rewards).map((row) => ({ name: row.reward_name, given: row.given, points: row.points })),
    byGroup: rows(groups).map((row) => ({ name: row.group_name, students: row.students, points: row.points, average: Number(row.average) })),
  };
}
