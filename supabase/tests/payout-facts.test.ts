/**
 * What stands behind a teacher's share, per group: students learning, how
 * many paid, how many learn with a discount, and the month's discounts.
 * Read-only, for the Salaries tab. Rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, as, connect, disconnect, teacherId, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);
const month = `date_trunc('month', public.tashkent_today())::date`;
let group = "";

const setup = async (s: Session) => {
  [{ id: group }] = await s.rows<{ id: string }>(
    `insert into groups (name, subject, teacher_id, monthly_fee, days, start_time, start_date) values ('Facts Group', 'Korean', $1, 600000, '{1,3,5}', '09:00', ${month}) returning id`,
    [teacherId(1)],
  );
  const students = await s.rows<{ id: string }>(
    `insert into students (full_name, phone) select 'Facts ' || n, '+99890888200' || n from generate_series(1, 5) n returning id`,
  );
  const ids = students.map((row) => row.id);
  // Four learn this month (one of them with a discount, one left mid-month); the fifth left before it began.
  await s.rows(`insert into enrollments (group_id, student_id, joined_on) values ($1, $2, ${month}), ($1, $3, ${month})`, [group, ids[0], ids[1]]);
  await s.rows(`insert into enrollments (group_id, student_id, joined_on, discount_kind, discount_value) values ($1, $2, ${month}, 'percent', 50)`, [group, ids[2]]);
  await s.rows(`insert into enrollments (group_id, student_id, joined_on, left_on, status) values ($1, $2, ${month} - 40, ${month} + 2, 'left')`, [group, ids[3]]);
  await s.rows(`insert into enrollments (group_id, student_id, joined_on, left_on, status) values ($1, $2, ${month} - 60, ${month} - 1, 'left')`, [group, ids[4]]);
  // Two paid this month (one of them twice); one payment is voided, one was last month, one is from someone who left earlier.
  const pay = (student: string, when: string, voided = false) =>
    s.rows(
      `insert into payments (student_id, group_id, amount, method, paid_at, voided_at, void_reason) values ($1, $2, 100000, 'cash', ${when}, ${voided ? "now()" : "null"}, ${voided ? "'Mistake'" : "null"})`,
      [student, group],
    );
  await pay(ids[0], "now()");
  await pay(ids[0], "now()");
  await pay(ids[2], "now()");
  await pay(ids[1], "now()", true);
  await pay(ids[1], `now() - interval '40 days'`);
  await pay(ids[4], "now()");
  // The month's charges carry 300,000 of discount; an archived charge and last month's do not count.
  const enrollment = (student: string) => `(select id from enrollments where group_id = '${group}' and student_id = '${student}')`;
  const charge = (student: string, when: string, discount: number, archived = false) =>
    s.rows(
      `insert into charges (student_id, enrollment_id, group_id, billing_month, type, base_amount, discount_amount, amount, archived_at)
       values ($1, ${enrollment(student)}, $2, ${when}, 'monthly_fee', 600000, $3::bigint, 600000 - $3::bigint, ${archived ? "now()" : "null"})`,
      [student, group, discount],
    );
  await charge(ids[2], month, 300000);
  // A grant given as a custom amount of 0: the full fee is the base, no discount is recorded, nothing is charged.
  await s.rows(
    `insert into charges (student_id, enrollment_id, group_id, billing_month, type, base_amount, discount_amount, amount, note)
     values ($1, ${enrollment(ids[1])}, $2, ${month}, 'monthly_fee', 600000, 0, 0, 'Grant')`,
    [ids[1], group],
  );
  await charge(ids[0], month, 0);
  await charge(ids[3], month, 200000, true);
  await charge(ids[3], `(${month} - interval '1 month')::date`, 100000);
};

describe.skipIf(!DB_URL)("Payout facts", () => {
  beforeAll(connect);
  afterAll(disconnect);

  it("counts who was learning in the month, who paid, who has a discount, and the month's discounts", async () => {
    await as("owner", async (s) => {
      expect(await s.rows(`select students, paid_students, discounted, discount_total from public.payout_group_facts(${month}) where group_id = $1`, [group])).toEqual([
        // Two learn below the full fee: one with a 50 % discount (300,000 off), one free of charge (600,000 off).
        { students: 4, paid_students: 2, discounted: 2, discount_total: "900000" },
      ]);
      // Last month: the two who had joined by then, the payment made then, and that month's discount.
      expect(await s.rows(`select students, paid_students, discounted, discount_total from public.payout_group_facts((${month} - interval '1 month')::date) where group_id = $1`, [group])).toEqual([
        // One of the two was charged 100,000 below the fee that month.
        { students: 2, paid_students: 0, discounted: 1, discount_total: "100000" },
      ]);
      expect(code(await s.attempt(`select * from public.payout_group_facts(${month} + 3)`))).toBe("22023");
    }, setup);
  });

  it("is the owner's: salaries are not shown to managers or teachers", async () => {
    for (const who of ["manager", "teacher", "anon"] as const) {
      await as(who, async (s) => {
        expect(code(await s.attempt(`select * from public.payout_group_facts(${month})`))).toBe(DENIED);
      });
    }
  });
});
