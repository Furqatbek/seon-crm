// Teacher payouts — docs/SPEC.md → "Business rules → Teacher salaries".
// Mirrored in SQL: calculate_teacher_payouts(). All amounts are whole soʻm.

import { rateOn, type PayRate, type PayType } from "./pay-rates";
import { monthInstants } from "./payments";
import { roundToThousand } from "./proration";

export type SalaryTeacher = { id: string; is_active: boolean; archived_at: string | null };
export type SalaryRate = PayRate & { teacher_id: string };
/** `teacher_id` is the group's own teacher. */
export type SalaryGroup = { id: string; name: string; teacher_id: string };
/** `teacher_id` is whoever taught the lesson: the group's teacher or a substitute. */
export type SalaryLesson = {
  group_id: string;
  teacher_id: string;
  /** "YYYY-MM-DD" */
  lesson_date: string;
  status: "scheduled" | "held" | "cancelled";
};
export type SalaryPayment = {
  group_id: string | null;
  amount: number;
  /** ISO instant */
  paid_at: string;
  voided_at: string | null;
};

/** One group's share of a payout. */
export type PayoutLine = {
  group_id: string;
  group_name: string;
  /** Held lessons the teacher taught in the group (0 for % of revenue). */
  lessons: number;
  /** Non-voided payments received for the group (0 unless % of revenue). */
  collected: number;
  /** Null for a fixed salary, which does not depend on the group. */
  amount: number | null;
};

export type Payout = {
  teacher_id: string;
  /** "YYYY-MM-01" */
  month: string;
  pay_type: PayType;
  /** Lessons taught, or soʻm collected for % of revenue. */
  basis: number;
  /** Soʻm, or the percent. */
  rate: number;
  calculated: number;
  bonus: number;
  deduction: number;
  final_amount: number;
  breakdown: PayoutLine[];
  status: "draft" | "paid";
};

const byGroup = (a: PayoutLine, b: PayoutLine) =>
  a.group_name < b.group_name ? -1 : a.group_name > b.group_name ? 1 : a.group_id < b.group_id ? -1 : 1;

/**
 * The payouts of a month ("YYYY-MM-01") after Calculate.
 *
 * One draft per active teacher, at the rate in effect on the 1st:
 * - fixed monthly: the fixed amount
 * - per lesson: amount × held lessons the teacher taught that month
 * - % of revenue: percent × non-voided payments received that month for
 *   groups where they are the teacher
 *
 * Each group's line is rounded to 1,000 soʻm and the payout is their sum.
 * An existing draft keeps its bonus and deduction; a paid payout is returned
 * exactly as it is. A teacher with no rate on the 1st gets no payout.
 */
export function calculateTeacherPayouts(
  month: string,
  data: {
    teachers: readonly SalaryTeacher[];
    rates: readonly SalaryRate[];
    groups: readonly SalaryGroup[];
    lessons: readonly SalaryLesson[];
    payments: readonly SalaryPayment[];
    existing?: readonly Payout[];
  },
): Payout[] {
  if (!/^\d{4}-\d{2}-01$/.test(month)) throw new RangeError(`A month is "YYYY-MM-01", got ${month}`);
  const prefix = month.slice(0, 7);
  const { start, end } = monthInstants(prefix);
  const from = Date.parse(start);
  const until = Date.parse(end);
  const groups = new Map(data.groups.map((group) => [group.id, group]));
  const existing = new Map(
    (data.existing ?? []).filter((payout) => payout.month === month).map((payout) => [payout.teacher_id, payout]),
  );

  const lessonsTaught = data.lessons.filter(
    (lesson) => lesson.status === "held" && lesson.lesson_date.slice(0, 7) === prefix,
  );
  const received = data.payments.filter((payment) => {
    const at = Date.parse(payment.paid_at);
    return payment.voided_at === null && payment.group_id !== null && at >= from && at < until;
  });

  // Payouts that stay whatever happens now: paid ones, and drafts of teachers
  // who are no longer calculated.
  const result = new Map<string, Payout>(existing);

  for (const teacher of data.teachers) {
    if (!teacher.is_active || teacher.archived_at !== null) continue;
    const before = existing.get(teacher.id);
    if (before?.status === "paid") continue;
    const rate = rateOn(
      data.rates.filter((candidate) => candidate.teacher_id === teacher.id),
      month,
    );
    if (!rate) continue;

    const lines = new Map<string, PayoutLine>();
    const line = (groupId: string) => {
      let entry = lines.get(groupId);
      if (!entry) {
        entry = {
          group_id: groupId,
          group_name: groups.get(groupId)?.name ?? "",
          lessons: 0,
          collected: 0,
          amount: null,
        };
        lines.set(groupId, entry);
      }
      return entry;
    };

    if (rate.pay_type === "percent_of_revenue") {
      for (const payment of received) {
        if (groups.get(payment.group_id!)?.teacher_id === teacher.id) {
          line(payment.group_id!).collected += payment.amount;
        }
      }
      // Percent has two decimals: 12.5 % of x = x × 1250 ÷ 10000.
      const share = Math.round((rate.percent ?? 0) * 100);
      for (const entry of lines.values()) entry.amount = roundToThousand(entry.collected * share, 10000);
    } else {
      for (const lesson of lessonsTaught) {
        if (lesson.teacher_id === teacher.id) line(lesson.group_id).lessons += 1;
      }
      if (rate.pay_type === "per_lesson") {
        for (const entry of lines.values()) entry.amount = roundToThousand((rate.amount ?? 0) * entry.lessons);
      }
    }

    const breakdown = [...lines.values()].sort(byGroup);
    const sum = (pick: (entry: PayoutLine) => number) => breakdown.reduce((total, entry) => total + pick(entry), 0);
    const calculated =
      rate.pay_type === "fixed_monthly" ? (rate.amount ?? 0) : sum((entry) => entry.amount ?? 0);
    const bonus = before?.bonus ?? 0;
    const deduction = before?.deduction ?? 0;

    result.set(teacher.id, {
      teacher_id: teacher.id,
      month,
      pay_type: rate.pay_type,
      basis: rate.pay_type === "percent_of_revenue" ? sum((entry) => entry.collected) : sum((entry) => entry.lessons),
      rate: rate.pay_type === "percent_of_revenue" ? (rate.percent ?? 0) : (rate.amount ?? 0),
      calculated,
      bonus,
      deduction,
      final_amount: calculated + bonus - deduction,
      breakdown,
      status: "draft",
    });
  }

  return [...result.values()].sort((a, b) => (a.teacher_id < b.teacher_id ? -1 : 1));
}
