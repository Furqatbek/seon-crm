/**
 * Draft salaries follow the money by themselves: once a month has been
 * calculated, a payment taken, voided or archived, or a lesson held or
 * cancelled, refreshes that month's drafts. Paid payouts stay locked, and a
 * month nobody calculated is left alone. Rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, OWNER_ID, admin, connect, disconnect, type Session } from "./helpers";

const month = `date_trunc('month', public.tashkent_today())::date`;

/** A teacher on 50 % of revenue with one group and one student, made for the test. */
const world = async (s: Session) => {
  const [{ id: teacher }] = await s.rows<{ id: string }>(`insert into teachers (full_name, phone) values ('Share Teacher', '+998908883001') returning id`);
  await s.rows(`insert into teacher_pay_rates (teacher_id, pay_type, percent, effective_from) values ($1, 'percent_of_revenue', 50, ${month})`, [teacher]);
  const [{ id: group }] = await s.rows<{ id: string }>(
    `insert into groups (name, subject, teacher_id, monthly_fee, days, start_time, start_date) values ('Share Group', 'Korean', $1, 450000, '{1,3,5}', '09:00', ${month}) returning id`,
    [teacher],
  );
  const [{ id: student }] = await s.rows<{ id: string }>(`insert into students (full_name, phone) values ('Share Student', '+998908883002') returning id`);
  const pay = async (amount: number) =>
    (await s.rows<{ id: string }>(`insert into payments (student_id, group_id, amount, method, received_by) values ($1, $2, $3, 'cash', $4) returning id`, [student, group, amount, OWNER_ID]))[0].id;
  const payout = async () =>
    (await s.rows<{ basis: string; calculated: string; status: string }>(`select basis, calculated, status from teacher_payouts where teacher_id = $1 and month = ${month} and archived_at is null`, [teacher]))[0];
  return { teacher, group, student, pay, payout };
};

describe.skipIf(!DB_URL)("Draft salaries follow payments and lessons", () => {
  beforeAll(connect);
  afterAll(disconnect);

  it("a voided payment leaves the teacher's share at once, without pressing Calculate", async () => {
    await admin(async (s) => {
      const { pay, payout } = await world(s);
      const [first, second] = [await pay(450_000), await pay(400_000)];
      await s.rows(`select public.calculate_teacher_payouts(${month})`);
      expect(await payout()).toEqual({ basis: "850000", calculated: "425000", status: "draft" });

      await s.rows(`update payments set voided_at = now(), void_reason = 'Taken twice', voided_by = $2 where id = $1`, [second, OWNER_ID]);
      expect(await payout()).toMatchObject({ basis: "450000", calculated: "225000" });
      // Archiving the voided payment changes nothing more; voiding the other leaves no share.
      await s.rows(`update payments set archived_at = now() where id = $1`, [second]);
      expect(await payout()).toMatchObject({ basis: "450000", calculated: "225000" });
      await s.rows(`update payments set voided_at = now(), void_reason = 'Mistake', voided_by = $2 where id = $1`, [first, OWNER_ID]);
      expect(await payout()).toMatchObject({ basis: "0", calculated: "0" });
    });
  });

  it("a payment taken after Calculate is added to the share, and a draft keeps its bonus and deduction", async () => {
    await admin(async (s) => {
      const { teacher, pay, payout } = await world(s);
      await pay(450_000);
      await s.rows(`select public.calculate_teacher_payouts(${month})`);
      await s.rows(`update teacher_payouts set bonus = 100000, deduction = 20000, note = 'Extra class; late twice', final_amount = calculated + 80000 where teacher_id = $1 and month = ${month}`, [teacher]);
      await pay(450_000);
      expect(await payout()).toMatchObject({ basis: "900000", calculated: "450000" });
      expect(await s.rows(`select bonus, deduction, final_amount from teacher_payouts where teacher_id = $1 and month = ${month}`, [teacher])).toEqual([
        { bonus: "100000", deduction: "20000", final_amount: "530000" },
      ]);
    });
  });

  it("a paid payout stays as it was paid", async () => {
    await admin(async (s) => {
      const { teacher, pay, payout } = await world(s);
      const id = await pay(450_000);
      await s.rows(`select public.calculate_teacher_payouts(${month})`);
      await s.rows(`update teacher_payouts set status = 'paid', paid_at = now(), paid_by = $2 where teacher_id = $1 and month = ${month}`, [teacher, OWNER_ID]);
      await s.rows(`update payments set voided_at = now(), void_reason = 'Late mistake', voided_by = $2 where id = $1`, [id, OWNER_ID]);
      await pay(300_000);
      expect(await payout()).toEqual({ basis: "450000", calculated: "225000", status: "paid" });
    });
  });

  it("a month nobody has calculated gets no payouts from a payment", async () => {
    await admin(async (s) => {
      await s.rows(`delete from teacher_payouts where month = ${month}`);
      const { teacher, pay } = await world(s);
      await pay(450_000);
      expect(await s.count("teacher_payouts", `teacher_id = '${teacher}'`)).toBe(0);
    });
  });

  it("a per-lesson draft follows lessons held and cancelled", async () => {
    await admin(async (s) => {
      const [{ id: teacher }] = await s.rows<{ id: string }>(`insert into teachers (full_name, phone) values ('Lesson Teacher', '+998908883003') returning id`);
      await s.rows(`insert into teacher_pay_rates (teacher_id, pay_type, amount, effective_from) values ($1, 'per_lesson', 80000, ${month})`, [teacher]);
      const [{ id: group }] = await s.rows<{ id: string }>(
        `insert into groups (name, subject, teacher_id, monthly_fee, days, start_time, start_date) values ('Lesson Group', 'Korean', $1, 450000, '{1,2,3,4,5,6,7}', '09:00', ${month}) returning id`,
        [teacher],
      );
      const lessons = await s.rows<{ id: string }>(`select id from lessons where group_id = $1 and lesson_date >= ${month} order by lesson_date limit 2`, [group]);
      expect(lessons.length).toBe(2);
      await s.rows(`select public.calculate_teacher_payouts(${month})`);
      const calculated = async () => (await s.rows<{ calculated: string }>(`select calculated from teacher_payouts where teacher_id = $1 and month = ${month}`, [teacher]))[0].calculated;
      expect(await calculated()).toBe("0");
      await s.rows(`update lessons set status = 'held' where id = any($1)`, [lessons.map((row) => row.id)]);
      expect(await calculated()).toBe("160000");
      await s.rows(`update lessons set status = 'cancelled', cancel_reason = 'Holiday' where id = $1`, [lessons[0].id]);
      expect(await calculated()).toBe("80000");
    });
  });
});

