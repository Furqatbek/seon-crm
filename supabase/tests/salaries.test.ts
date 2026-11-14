/**
 * Finance owner tools — calculate_teacher_payouts(), the payout rules,
 * list_adjustments() and expenses in the month summary.
 * docs/SPEC.md → "Business rules → Teacher salaries", "Roles and permissions".
 * Same setup as permissions.test.ts; every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  calculateTeacherPayouts,
  type Payout,
  type SalaryGroup,
  type SalaryLesson,
  type SalaryPayment,
  type SalaryRate,
  type SalaryTeacher,
} from "../../src/lib/domain/salary";
import {
  DB_URL,
  DENIED,
  OWNER_ID,
  as,
  connect,
  disconnect,
  groupId,
  studentId,
  teacherId,
  type Attempt,
  type Session,
} from "./helpers";

const code = (result: Attempt) => (result.ok ? `allowed (${result.rowCount})` : result.code);
const today = "public.tashkent_today()";
const month = `date_trunc('month', ${today})::date`;
const lastMonth = `(date_trunc('month', ${today}) - interval '1 month')::date`;
const nextMonth = `(date_trunc('month', ${today}) + interval '1 month')::date`;

// Seed: teacher 1 fixed 6,000,000 · teacher 2 percent 40 (35 before last
// month) · teacher 3 per lesson 120,000 · teacher 6 per lesson 90,000, and
// 100,000 from the 15th of last month.
const FIXED = teacherId(1);
const PERCENT = teacherId(2);
const PER_LESSON = teacherId(3);
const CHANGED_ON_15TH = teacherId(6);

const calculate = async (s: Session, forMonth = lastMonth) =>
  (await s.rows<{ n: number }>(`select public.calculate_teacher_payouts(${forMonth}) as n`))[0].n;

type Row = {
  teacher_id: string;
  month: string;
  pay_type: Payout["pay_type"];
  basis: number;
  rate: number;
  calculated: number;
  bonus: number;
  deduction: number;
  final_amount: number;
  breakdown: Payout["breakdown"];
  status: Payout["status"];
  note: string | null;
};

const payouts = (s: Session, forMonth = lastMonth) =>
  s.rows<Row>(
    `select teacher_id, month::text, pay_type, basis::float8 as basis, rate::float8 as rate,
            calculated::float8 as calculated, bonus::float8 as bonus, deduction::float8 as deduction,
            final_amount::float8 as final_amount, breakdown, status, note
     from teacher_payouts where month = ${forMonth} order by teacher_id`,
  );
const payout = async (s: Session, teacher: string, forMonth = lastMonth) => {
  const row = (await payouts(s, forMonth)).find((entry) => entry.teacher_id === teacher);
  if (!row) throw new Error(`no payout for ${teacher}`);
  return row;
};

/** What the TypeScript mirror makes of the same tables. */
async function mirror(s: Session, forMonth: string): Promise<Payout[]> {
  const [{ m }] = await s.rows<{ m: string }>(`select ${forMonth}::text as m`);
  const [teachers, rates, groups, lessons, payments] = await Promise.all([
    s.rows<SalaryTeacher>(`select id, is_active, archived_at::text from teachers`),
    s.rows<SalaryRate>(
      `select teacher_id, pay_type, amount::float8 as amount, percent::float8 as percent, effective_from::text from teacher_pay_rates`,
    ),
    s.rows<SalaryGroup>(`select id, name, teacher_id from groups`),
    s.rows<SalaryLesson>(`select group_id, teacher_id, lesson_date::text, status from lessons`),
    s.rows<SalaryPayment>(
      `select group_id, amount::float8 as amount,
              to_char(paid_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as paid_at, voided_at::text
       from payments`,
    ),
  ]);
  return calculateTeacherPayouts(m, { teachers, rates, groups, lessons, payments });
}

const byId = <T extends { group_id: string }>(lines: T[]) => [...lines].sort((a, b) => (a.group_id < b.group_id ? -1 : 1));

describe.skipIf(!DB_URL)("Teacher payouts and owner finance tools", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("calculate_teacher_payouts", () => {
    it.each([
      ["last month", lastMonth],
      ["this month", month],
    ])("agrees with calculateTeacherPayouts() for %s", async (_name, forMonth) => {
      await as("owner", async (s) => {
        const created = await calculate(s, forMonth);
        const expected = await mirror(s, forMonth);
        const actual = await payouts(s, forMonth);
        expect(created).toBe(expected.length);
        expect(actual.length).toBeGreaterThanOrEqual(6);
        expect(
          actual.map((row) => ({ ...row, note: undefined, breakdown: byId(row.breakdown) })),
        ).toEqual(expected.map((entry) => ({ ...entry, note: undefined, breakdown: byId(entry.breakdown) })));
      });
    });

    it("pays one teacher of each pay type by its own formula", async () => {
      await as("owner", async (s) => {
        await calculate(s);

        const fixed = await payout(s, FIXED);
        expect(fixed).toMatchObject({ pay_type: "fixed_monthly", rate: 6_000_000, calculated: 6_000_000, final_amount: 6_000_000, status: "draft" });
        expect(fixed.breakdown.every((line) => line.amount === null)).toBe(true);

        const perLesson = await payout(s, PER_LESSON);
        const [{ held }] = await s.rows<{ held: number }>(
          `select count(*)::int as held from lessons
           where teacher_id = $1 and status = 'held' and lesson_date >= ${lastMonth} and lesson_date < ${month}`,
          [PER_LESSON],
        );
        expect(held).toBeGreaterThan(0);
        expect(perLesson).toMatchObject({ pay_type: "per_lesson", basis: held, rate: 120_000, calculated: 120_000 * held });

        const percent = await payout(s, PERCENT);
        const [{ collected }] = await s.rows<{ collected: number }>(
          `select coalesce(sum(p.amount), 0)::float8 as collected
           from payments p join groups g on g.id = p.group_id
           where g.teacher_id = $1 and p.voided_at is null
             and p.paid_at >= (${lastMonth}::timestamp at time zone 'Asia/Tashkent')
             and p.paid_at < (${month}::timestamp at time zone 'Asia/Tashkent')`,
          [PERCENT],
        );
        expect(collected).toBeGreaterThan(0);
        expect(percent).toMatchObject({ pay_type: "percent_of_revenue", basis: collected, rate: 40 });
        expect(percent.calculated).toBe(percent.breakdown.reduce((sum, line) => sum + (line.amount ?? 0), 0));
        expect(percent.calculated % 1000).toBe(0);
        // Rounding each group's line keeps the total within 1,000 per group of the plain percent.
        expect(Math.abs(percent.calculated - collected * 0.4)).toBeLessThanOrEqual(500 * percent.breakdown.length);
      });
    });

    it("a substitute lesson pays the substitute", async () => {
      await as("owner", async (s) => {
        await calculate(s);
        const before = await payout(s, PER_LESSON);
        const beforeFixed = await payout(s, FIXED);
        // One of the fixed-salary teacher's held lessons was taught by the per-lesson teacher.
        const [lesson] = await s.rows<{ id: string; group_id: string }>(
          `update lessons set teacher_id = $2
           where id = (select id from lessons where teacher_id = $1 and status = 'held'
                       and lesson_date >= ${lastMonth} and lesson_date < ${month} limit 1)
           returning id, group_id`,
          [FIXED, PER_LESSON],
        );
        await calculate(s);
        const after = await payout(s, PER_LESSON);
        expect(after.basis).toBe(before.basis + 1);
        expect(after.calculated).toBe(before.calculated + 120_000);
        expect(after.breakdown.find((line) => line.group_id === lesson.group_id)).toMatchObject({ lessons: 1, amount: 120_000 });
        expect((await payout(s, FIXED)).basis).toBe(beforeFixed.basis - 1);
      });
    });

    it("voided payments are excluded from % pay", async () => {
      await as("owner", async (s) => {
        await calculate(s);
        const before = await payout(s, PERCENT);
        const [voided] = await s.rows<{ amount: number }>(
          `update payments set voided_at = now(), voided_by = auth.uid(), void_reason = 'Test'
           where id = (select p.id from payments p join groups g on g.id = p.group_id
                       where g.teacher_id = $1 and p.voided_at is null
                         and p.paid_at >= (${lastMonth}::timestamp at time zone 'Asia/Tashkent')
                         and p.paid_at < (${month}::timestamp at time zone 'Asia/Tashkent')
                       order by p.amount desc limit 1)
           returning amount::float8 as amount`,
          [PERCENT],
        );
        await calculate(s);
        const after = await payout(s, PERCENT);
        expect(after.basis).toBe(before.basis - voided.amount);
        expect(after.calculated).toBeLessThan(before.calculated);
      });
    });

    it("a rate change on the 15th applies from the next month", async () => {
      await as("owner", async (s) => {
        // Seeded: 90,000 per lesson, 100,000 from the 15th of last month.
        expect(
          await s.rows(
            `select amount::int as amount, (effective_from - ${lastMonth})::int as day
             from teacher_pay_rates where teacher_id = $1 order by effective_from desc limit 1`,
            [CHANGED_ON_15TH],
          ),
        ).toEqual([{ amount: 100_000, day: 14 }]);
        await calculate(s, lastMonth);
        await calculate(s, month);
        const last = await payout(s, CHANGED_ON_15TH, lastMonth);
        expect(last.rate).toBe(90_000);
        expect(last.basis).toBeGreaterThan(0);
        // Every lesson of last month at the old rate, also those after the 15th.
        expect(last.calculated).toBe(90_000 * last.basis);
        expect((await payout(s, CHANGED_ON_15TH, month)).rate).toBe(100_000);
      });
    });

    it("a paid payout is never recalculated", async () => {
      await as("owner", async (s) => {
        const all = await calculate(s);
        const before = await payout(s, PER_LESSON);
        expect(
          code(await s.attempt(
            `update teacher_payouts set status = 'paid', paid_at = now(), paid_by = auth.uid()
             where teacher_id = $1 and month = ${lastMonth}`,
            [PER_LESSON],
          )),
        ).toBe("allowed (1)");

        // More of last month's lessons turn out to be theirs afterwards.
        await s.rows(
          `update lessons set teacher_id = $2
           where teacher_id = $1 and status = 'held' and lesson_date >= ${lastMonth} and lesson_date < ${month}`,
          [FIXED, PER_LESSON],
        );
        // The paid one is skipped; every draft is refreshed.
        expect(await calculate(s)).toBe(all - 1);
        expect(await payout(s, PER_LESSON)).toEqual({ ...before, status: "paid" });

        // And nobody can change it by hand.
        expect(code(await s.attempt(`update teacher_payouts set bonus = 1, note = 'x' where teacher_id = $1`, [PER_LESSON]))).toBe(DENIED);
        expect(code(await s.attempt(`update teacher_payouts set status = 'draft', paid_at = null, paid_by = null where teacher_id = $1`, [PER_LESSON]))).toBe(DENIED);
        expect(code(await s.attempt(`delete from teacher_payouts where teacher_id = $1`, [PER_LESSON]))).toBe(DENIED);
      });
    });

    it("running it twice changes nothing, and a draft keeps its bonus, deduction and note", async () => {
      await as("owner", async (s) => {
        const first = await calculate(s);
        const before = await payouts(s);
        expect(await calculate(s)).toBe(first);
        expect(await payouts(s)).toEqual(before);

        await s.rows(
          `update teacher_payouts set bonus = 200000, deduction = 50000, note = 'Olimpiada'
           where teacher_id = $1 and month = ${lastMonth}`,
          [PER_LESSON],
        );
        const adjusted = await payout(s, PER_LESSON);
        // The amount to pay follows from its parts without being written.
        expect(adjusted.final_amount).toBe(adjusted.calculated + 150_000);
        await s.rows(
          `update lessons set status = 'scheduled'
           where id = (select id from lessons where teacher_id = $1 and status = 'held'
                       and lesson_date >= ${lastMonth} and lesson_date < ${month} limit 1)`,
          [PER_LESSON],
        );
        await calculate(s);
        expect(await payout(s, PER_LESSON)).toMatchObject({
          calculated: adjusted.calculated - 120_000,
          bonus: 200_000,
          deduction: 50_000,
          note: "Olimpiada",
          final_amount: adjusted.final_amount - 120_000,
        });
      });
    });

    it("an inactive or archived teacher gets no payout; a teacher with no rate on the 1st gets none", async () => {
      await as(
        "owner",
        async (s) => {
          await calculate(s);
          const teachers = (await payouts(s)).map((row) => row.teacher_id);
          expect(teachers).not.toContain(FIXED);
          expect(teachers).not.toContain(PERCENT);
          expect(teachers).not.toContain(PER_LESSON);
          expect(teachers).toContain(CHANGED_ON_15TH);
        },
        async (a) => {
          await a.rows(`update teachers set is_active = false where id = $1`, [FIXED]);
          await a.rows(`update teachers set archived_at = now() where id = $1`, [PERCENT]);
          await a.rows(`update teacher_pay_rates set effective_from = ${lastMonth} + 1 where teacher_id = $1`, [PER_LESSON]);
        },
      );
    });

    it("refuses a month that has not started and a day that is not the 1st", async () => {
      await as("owner", async (s) => {
        expect(code(await s.attempt(`select public.calculate_teacher_payouts(${nextMonth})`))).toBe("ES001");
        expect(code(await s.attempt(`select public.calculate_teacher_payouts(${lastMonth} + 1)`))).toBe("22023");
        expect(code(await s.attempt(`select public.calculate_teacher_payouts(null)`))).toBe("22023");
      });
    });
  });

  describe("bonus, deduction and Mark paid", () => {
    it("a bonus or a deduction needs a note", async () => {
      await as("owner", async (s) => {
        await calculate(s);
        const where = `teacher_id = '${FIXED}' and month = ${lastMonth}`;
        expect(code(await s.attempt(`update teacher_payouts set bonus = 100000 where ${where}`))).toBe("23514");
        expect(code(await s.attempt(`update teacher_payouts set deduction = 100000, note = '  ' where ${where}`))).toBe("23514");
        expect(code(await s.attempt(`update teacher_payouts set deduction = 100000, note = 'Kechikish' where ${where}`))).toBe("allowed (1)");
        expect((await payout(s, FIXED)).final_amount).toBe(5_900_000);
      });
    });

    it("a deduction cannot be larger than the payout", async () => {
      await as("owner", async (s) => {
        await calculate(s);
        const where = `teacher_id = '${FIXED}' and month = ${lastMonth}`;
        expect(code(await s.attempt(`update teacher_payouts set deduction = 6000001, note = 'x' where ${where}`))).toBe("ES002");
        expect(code(await s.attempt(`update teacher_payouts set deduction = 6000000, note = 'x' where ${where}`))).toBe("allowed (1)");
        expect((await payout(s, FIXED)).final_amount).toBe(0);
      });
    });

    it("a payout a recalculation left below zero cannot be marked paid", async () => {
      await as("owner", async (s) => {
        await calculate(s);
        const before = await payout(s, PER_LESSON);
        const where = `teacher_id = '${PER_LESSON}' and month = ${lastMonth}`;
        await s.rows(`update teacher_payouts set deduction = $1, note = 'x' where ${where}`, [before.calculated]);
        await s.rows(
          `update lessons set status = 'scheduled'
           where teacher_id = $1 and status = 'held' and lesson_date >= ${lastMonth} and lesson_date < ${month}`,
          [PER_LESSON],
        );
        await calculate(s);
        expect((await payout(s, PER_LESSON)).final_amount).toBe(-before.calculated);
        expect(
          code(await s.attempt(`update teacher_payouts set status = 'paid', paid_at = now(), paid_by = auth.uid() where ${where}`)),
        ).toBe("ES002");
      });
    });
  });

  describe("as manager nothing from this phase is visible", () => {
    it("the tables return no rows and nothing can be written", async () => {
      await as(
        "manager",
        async (s) => {
          expect(await s.count("teacher_payouts")).toBe(0);
          expect(await s.count("expenses")).toBe(0);
          expect(await s.count("teacher_pay_rates")).toBe(0);
          expect(
            code(await s.attempt(`insert into expenses (category, amount, spent_on, created_by) values ('rent', 1000, ${today}, auth.uid())`)),
          ).toBe(DENIED);
          expect(code(await s.attempt(`update expenses set amount = 1`))).toBe("allowed (0)");
          expect(code(await s.attempt(`update teacher_payouts set bonus = 1, note = 'x'`))).toBe("allowed (0)");
          expect(code(await s.attempt(`update teacher_payouts set status = 'paid', paid_at = now(), paid_by = auth.uid()`))).toBe("allowed (0)");
        },
        // Payouts exist, so "no rows" is the policy and not an empty table.
        async (a) => {
          await a.rows(`select public.calculate_teacher_payouts(${lastMonth})`);
          expect(await a.count("teacher_payouts")).toBeGreaterThan(0);
        },
      );
    });

    it("the functions refuse a manager and a visitor", async () => {
      for (const who of ["manager", "anon"] as const) {
        await as(who, async (s) => {
          expect(code(await s.attempt(`select public.calculate_teacher_payouts(${lastMonth})`))).toBe(DENIED);
          expect(code(await s.attempt(`select * from public.list_adjustments(${month})`))).toBe(DENIED);
          expect(code(await s.attempt(`select * from public.finance_month_summary(${month})`))).toBe(DENIED);
        });
      }
    });
  });

  describe("list_adjustments", () => {
    type Adjustment = {
      kind: string;
      student_id: string;
      group_name: string | null;
      amount: number;
      receipt_no: string | null;
      by_name: string | null;
      reason: string;
      total: number;
    };
    const list = (s: Session, forMonth = month, limit = 1000, offset = 0) =>
      s.rows<Adjustment>(
        `select kind, student_id, group_name, amount::float8 as amount, receipt_no, by_name, reason, total::int as total
         from public.list_adjustments(${forMonth}, $1, $2)`,
        [limit, offset],
      );

    it("lists every credit and every voided payment with who and why", async () => {
      // A manager gives a credit, then the owner voids a payment.
      await as(
        "owner",
        async (s) => {
          const before = await list(s);
          const [payment] = await s.rows<{ id: string; receipt_no: string; amount: number; student_id: string }>(
            `select id, receipt_no, amount::float8 as amount, student_id from payments where voided_at is null order by paid_at desc limit 1`,
          );
          await s.rows(`update payments set voided_at = now(), voided_by = auth.uid(), void_reason = 'Xato kiritilgan' where id = $1`, [payment.id]);
          const after = await list(s);
          expect(after.length).toBe(before.length + 1);
          expect(after.every((row) => row.total === after.length)).toBe(true);
          // Newest first.
          expect(after[0]).toMatchObject({
            kind: "void",
            student_id: payment.student_id,
            amount: payment.amount,
            receipt_no: payment.receipt_no,
            by_name: "Jasur Karimov",
            reason: "Xato kiritilgan",
          });
          expect(after.find((row) => row.kind === "credit" && row.reason === "Aka-uka chegirmasi")).toMatchObject({
            student_id: studentId(5),
            amount: 100_000,
            receipt_no: null,
            group_name: "English B1",
          });
          expect(after.find((row) => row.reason === "Aka-uka chegirmasi")?.by_name).not.toBe("Jasur Karimov");

          // Agrees with the tables.
          const [{ credits, voids }] = await s.rows<{ credits: number; voids: number }>(
            `select
               (select count(*)::int from charges where type = 'adjustment' and amount < 0
                  and created_at >= (${month}::timestamp at time zone 'Asia/Tashkent')) as credits,
               (select count(*)::int from payments
                  where voided_at >= (${month}::timestamp at time zone 'Asia/Tashkent')) as voids`,
          );
          expect(after.filter((row) => row.kind === "credit").length).toBe(credits);
          expect(after.filter((row) => row.kind === "void").length).toBe(voids);

          // Pages keep the full count.
          const page = await list(s, month, 1, 1);
          expect(page).toEqual([after[1]]);
        },
        async (a) => {
          await a.rows(
            `insert into charges (student_id, group_id, billing_month, type, amount, note, created_by, created_at)
             select $1, $2, ${month}, 'adjustment', -100000, 'Aka-uka chegirmasi', id, now() - interval '1 second'
             from profiles where role = 'manager' limit 1`,
            [studentId(5), groupId(2)],
          );
        },
      );
    });

    it("a void belongs to the month it was voided in", async () => {
      await as("owner", async (s) => {
        // Seeded: two payments of last month, voided the day after.
        const last = await list(s, lastMonth);
        expect(last.filter((row) => row.kind === "void" && row.reason === "Ikki marta kiritilgan").length).toBe(2);
        expect(last.every((row) => row.by_name !== null)).toBe(true);
      });
    });
  });

  describe("finance_month_summary", () => {
    it("totals the month's expenses, without archived ones", async () => {
      await as("owner", async (s) => {
        const expenses = async () =>
          (await s.rows<{ expenses: number }>(`select expenses::float8 as expenses from public.finance_month_summary(${lastMonth})`))[0].expenses;
        const [{ total }] = await s.rows<{ total: number }>(
          `select sum(amount)::float8 as total from expenses where spent_on >= ${lastMonth} and spent_on < ${month}`,
        );
        expect(total).toBeGreaterThan(0);
        expect(await expenses()).toBe(total);

        await s.rows(
          `insert into expenses (category, amount, spent_on, note, created_by) values ('supplies', 90000, ${lastMonth} + 3, 'Marker', $1)`,
          [OWNER_ID],
        );
        expect(await expenses()).toBe(total + 90_000);
        await s.rows(`update expenses set archived_at = now() where note = 'Marker'`);
        expect(await expenses()).toBe(total);
        // Another month's expense does not count.
        await s.rows(`insert into expenses (category, amount, spent_on, created_by) values ('rent', 1000000, ${month}, $1)`, [OWNER_ID]);
        expect(await expenses()).toBe(total);
      });
    });
  });
});
