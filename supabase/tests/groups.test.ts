/**
 * Groups: lesson generation, the first charge at enrolment, leaving,
 * transfers and attendance — the database functions behind Phase 6.
 * Same setup as permissions.test.ts; every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { proposeFirstCharge, type Discount } from "../../src/lib/domain/proration";
import {
  DB_URL,
  DENIED,
  MANAGER_ID,
  admin,
  as,
  connect,
  disconnect,
  groupId,
  studentId,
  teacherId,
  type Attempt,
  type Session,
} from "./helpers";

const BOTH = ["owner", "manager"] as const;
const code = (result: Attempt) => (result.ok ? `allowed (${result.rowCount})` : result.code);
const today = "public.tashkent_today()";
const monthStart = `date_trunc('month', ${today})::date`;
const isoDay = (value: unknown) => (value instanceof Date ? value.toLocaleDateString("sv-SE") : String(value));

/** A new group on the given weekdays, starting on the 1st of this month. Returns its id. */
async function newGroup(s: Session, days: number[], fee = 600_000): Promise<string> {
  const [{ id }] = await s.rows<{ id: string }>(
    `insert into groups (name, subject, teacher_id, monthly_fee, days, start_time, start_date, status)
     values ('Test MWF', 'Ingliz tili', $1, $2, $3, '18:00', ${monthStart}, 'active') returning id`,
    [teacherId(1), fee, days],
  );
  return id;
}

/** A student who is in no group. */
async function newStudent(s: Session): Promise<string> {
  const [{ id }] = await s.rows<{ id: string }>(
    `insert into students (full_name, phone) values ('Test Student', '+998900000077') returning id`,
  );
  return id;
}

describe.skipIf(!DB_URL)("Groups", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("generate_lessons", () => {
    it.each(BOTH)("%s creates a group and its lessons appear from its weekdays and time", async (who) => {
      await as(who, async (s) => {
        const id = await newGroup(s, [1, 3, 5]);
        const [summary] = await s.rows<{ n: number; days: number[]; first: Date; last: Date; horizon: Date; expected: number }>(
          `select count(*)::int as n,
                  array_agg(distinct extract(isodow from lesson_date)::int order by extract(isodow from lesson_date)::int) as days,
                  min(lesson_date) as first, max(lesson_date) as last, public.lesson_horizon() as horizon,
                  (select count(*)::int from generate_series(${monthStart}::timestamp, public.lesson_horizon()::timestamp, '1 day') d
                   where extract(isodow from d) in (1, 3, 5)) as expected
           from lessons where group_id = $1`,
          [id],
        );
        expect(summary.days).toEqual([1, 3, 5]);
        expect(summary.n).toBe(summary.expected);
        expect(summary.n).toBeGreaterThan(20);
        // Never past the horizon: at least 30 days ahead and the whole of next month.
        expect(summary.last <= summary.horizon).toBe(true);
        expect(
          await s.rows(
            `select distinct start_time::text, status, teacher_id from lessons where group_id = $1`,
            [id],
          ),
        ).toEqual([{ start_time: "18:00:00", status: "scheduled", teacher_id: teacherId(1) }]);

        // Running it again adds nothing.
        expect(
          await s.rows(`select public.generate_lessons($1, ${monthStart}, public.lesson_horizon()) as made`, [id]),
        ).toEqual([{ made: 0 }]);
      });
    });

    it("the horizon is at least 30 days ahead and covers all of next month", async () => {
      const [row] = await admin((s) =>
        s.rows<{ ahead: boolean; next_month: boolean }>(
          `select public.lesson_horizon() >= ${today} + 30 as ahead,
                  public.lesson_horizon() >= (${monthStart} + interval '2 months' - interval '1 day')::date as next_month`,
        ),
      );
      expect(row).toEqual({ ahead: true, next_month: true });
    });

    it("a schedule change rebuilds future lessons that have no attendance", async () => {
      await as("manager", async (s) => {
        // Every day, so there is a lesson today to mark.
        const id = await newGroup(s, [1, 2, 3, 4, 5, 6, 7]);
        const student = await newStudent(s);
        await s.rows(`select public.enrol_student($1, $2, ${today})`, [student, id]);
        const [lesson] = await s.rows<{ id: string }>(
          `select id from lessons where group_id = $1 and lesson_date = ${today}`,
          [id],
        );
        await s.rows(`select public.save_attendance($1, $2)`, [
          lesson.id,
          JSON.stringify([{ student_id: student, status: "present" }]),
        ]);
        const before = await s.count("lessons", `group_id = '${id}' and lesson_date < ${today}`);

        // New days, new time and a new teacher.
        await s.rows(
          `update groups set days = array[(extract(isodow from ${today})::int % 7) + 1]::smallint[],
                             start_time = '09:30', teacher_id = $2 where id = $1`,
          [id, teacherId(2)],
        );

        // Past lessons and today's marked lesson are untouched.
        expect(await s.count("lessons", `group_id = '${id}' and lesson_date < ${today}`)).toBe(before);
        expect(
          await s.rows(`select status, start_time::text, teacher_id from lessons where id = $1`, [lesson.id]),
        ).toEqual([{ status: "held", start_time: "18:00:00", teacher_id: teacherId(1) }]);
        // Everything after today follows the new schedule.
        expect(
          await s.rows(
            `select distinct extract(isodow from lesson_date)::int = (extract(isodow from ${today})::int % 7) + 1 as new_day,
                    start_time::text, teacher_id, status
             from lessons where group_id = $1 and lesson_date > ${today}`,
            [id],
          ),
        ).toEqual([{ new_day: true, start_time: "09:30:00", teacher_id: teacherId(2), status: "scheduled" }]);
      });
    });

    it("a cancelled future lesson stays cancelled through a rebuild, and a finished group loses its future lessons", async () => {
      await as("manager", async (s) => {
        const id = await newGroup(s, [1, 2, 3, 4, 5, 6, 7]);
        await s.rows(
          `update lessons set status = 'cancelled', cancel_reason = 'Bayram' where group_id = $1 and lesson_date = ${today} + 3`,
          [id],
        );
        await s.rows(`update groups set start_time = '10:00' where id = $1`, [id]);
        expect(
          await s.rows(`select status, start_time::text from lessons where group_id = $1 and lesson_date = ${today} + 3`, [id]),
        ).toEqual([{ status: "cancelled", start_time: "18:00:00" }]);

        await s.rows(`update groups set status = 'finished' where id = $1`, [id]);
        expect(await s.count("lessons", `group_id = '${id}' and lesson_date >= ${today} and status = 'scheduled'`)).toBe(0);
      });
    });

    it("the daily job is scheduled for 00:10 Tashkent time", async () => {
      const jobs = await admin(async (s) => {
        const cron = await s.attempt(`select schedule, command from cron.job where jobname = 'generate-lessons-daily'`);
        // A plain Postgres without pg_cron (scripts/local-db.sh) has no cron schema.
        return cron.ok ? cron.rows : null;
      });
      if (jobs) expect(jobs).toEqual([{ schedule: "10 19 * * *", command: "select public.generate_all_lessons()" }]);
    });

    it("a manager cannot run the job for every group; the owner can", async () => {
      expect(code(await as("manager", (s) => s.attempt(`select public.generate_all_lessons()`)))).toBe(DENIED);
      expect((await as("owner", (s) => s.attempt(`select public.generate_all_lessons()`))).ok).toBe(true);
    });
  });

  describe("propose_first_charge mirrors src/lib/domain/proration.ts", () => {
    const discounts: Array<[string, Discount]> = [
      ["no discount", null],
      ["15%", { kind: "percent", value: 15 }],
      ["50,000 soʻm off", { kind: "amount", value: 50_000 }],
    ];

    it.each(discounts)("for every seeded group and every day of this month, with %s", async (_, discount) => {
      await as("manager", async (s) => {
        let compared = 0;
        let prorated = 0;
        for (let n = 1; n <= 9; n += 1) {
          const [{ fee }] = await s.rows<{ fee: string }>(`select monthly_fee as fee from groups where id = $1`, [groupId(n)]);
          const lessons = await s.rows<{ day: string }>(
            `select lesson_date::text as day from lessons
             where group_id = $1 and status <> 'cancelled'
               and lesson_date >= ${monthStart} and lesson_date < (${monthStart} + interval '1 month')::date`,
            [groupId(n)],
          );
          const rows = await s.rows<Record<string, unknown>>(
            `select d::date::text as joined_on, p.*
             from generate_series(${monthStart}::timestamp, (${monthStart} + interval '1 month' - interval '1 day')::timestamp, '1 day') d,
                  public.propose_first_charge($1, d::date, $2, $3) p`,
            [groupId(n), discount?.kind ?? null, discount?.value ?? null],
          );
          for (const row of rows) {
            const expected = proposeFirstCharge({
              monthlyFee: Number(fee),
              discount,
              joinedOn: row.joined_on as string,
              lessonDates: lessons.map((lesson) => lesson.day),
            });
            expect({
              billingMonth: isoDay(row.billing_month),
              baseAmount: Number(row.base_amount),
              discountAmount: Number(row.discount_amount),
              fullAmount: Number(row.full_amount),
              lessonsInMonth: row.lessons_in_month,
              lessonsCounted: row.lessons_counted,
              isProrated: row.is_prorated,
              amount: Number(row.amount),
            }).toEqual(expected);
            compared += 1;
            if (expected.isProrated) prorated += 1;
          }
        }
        expect(compared).toBeGreaterThan(250);
        expect(prorated).toBeGreaterThan(100);
      });
    });

    it("rounds like the TypeScript function", async () => {
      const rows = await admin((s) =>
        s.rows(
          `select public.round_to_thousand(600000 * 7, 12)::int as example,
                  public.round_to_thousand(450000 * 5, 12)::int as half_up,
                  public.round_to_thousand(1499)::int as down, public.round_to_thousand(1500)::int as up`,
        ),
      );
      expect(rows).toEqual([{ example: 350_000, half_up: 188_000, down: 1_000, up: 2_000 }]);
    });
  });

  describe("enrol_student", () => {
    const charges = (s: Session, student: string) =>
      s.rows<Record<string, unknown>>(
        `select type, base_amount::int as base, discount_amount::int as discount, amount::int as amount, is_prorated,
                lessons_counted, lessons_in_month, note, created_by, billing_month = ${monthStart} as this_month
         from charges where student_id = $1 order by created_at, id`,
        [student],
      );

    it.each(BOTH)("%s enrols a student: the proposed first charge is created with the enrolment", async (who) => {
      await as(who, async (s) => {
        const student = await newStudent(s);
        const [proposal] = await s.rows<Record<string, unknown>>(
          `select * from public.propose_first_charge($1, ${today}, 'percent', 15)`,
          [groupId(2)],
        );
        await s.rows(`select public.enrol_student($1, $2, ${today}, 'percent', 15, 'Aka-uka chegirmasi')`, [
          student,
          groupId(2),
        ]);

        expect(
          await s.rows(
            `select status, joined_on = ${today} as today, discount_kind, discount_value::int as discount_value, note
             from enrollments where student_id = $1`,
            [student],
          ),
        ).toEqual([{ status: "active", today: true, discount_kind: "percent", discount_value: 15, note: "Aka-uka chegirmasi" }]);

        const [charge] = await charges(s, student);
        expect(charge).toMatchObject({
          type: "monthly_fee",
          base: 600_000,
          discount: 90_000,
          amount: Number(proposal.amount),
          is_prorated: proposal.is_prorated,
          lessons_counted: proposal.lessons_counted,
          lessons_in_month: proposal.lessons_in_month,
          this_month: true,
        });
        expect(typeof charge.created_by).toBe("string");
      });
    });

    it("Full month charges the whole fee after discount; Custom charges what was typed and needs a note", async () => {
      await as("manager", async (s) => {
        const full = await newStudent(s);
        await s.rows(`select public.enrol_student($1, $2, ${today}, null, null, null, 'full')`, [full, groupId(2)]);
        expect(await charges(s, full)).toMatchObject([{ amount: 600_000, is_prorated: false }]);

        const [{ id: custom }] = await s.rows<{ id: string }>(
          `insert into students (full_name, phone) values ('Custom', '+998900000078') returning id`,
        );
        expect(
          code(await s.attempt(`select public.enrol_student($1, $2, ${today}, null, null, null, 'custom', 200000, '  ')`, [custom, groupId(2)])),
        ).toBe("23514");
        await s.rows(
          `select public.enrol_student($1, $2, ${today}, null, null, null, 'custom', 200000, 'Kelishilgan narx')`,
          [custom, groupId(2)],
        );
        expect(await charges(s, custom)).toMatchObject([
          { amount: 200_000, is_prorated: false, note: "Kelishilgan narx", created_by: MANAGER_ID },
        ]);
      });
    });

    it("joining with no lessons left writes a 0 soʻm charge, so the month is never billed twice", async () => {
      await as("manager", async (s) => {
        const id = await newGroup(s, [1, 3, 5]);
        // Cancel everything that is left this month.
        await s.rows(
          `update lessons set status = 'cancelled', cancel_reason = 'Test' where group_id = $1 and lesson_date >= ${today}
             and lesson_date < (${monthStart} + interval '1 month')::date`,
          [id],
        );
        const student = await newStudent(s);
        const [{ enrolment }] = await s.rows<{ enrolment: string }>(
          `select public.enrol_student($1, $2, ${today}) as enrolment`,
          [student, id],
        );
        expect(await charges(s, student)).toMatchObject([{ amount: 0, lessons_counted: 0, this_month: true }]);
        // A second monthly fee for the same enrolment and month is refused.
        expect(
          code(
            await s.attempt(
              `insert into charges (student_id, enrollment_id, group_id, billing_month, type, base_amount, amount, created_by)
               values ($1, $2, $3, ${monthStart}, 'monthly_fee', 600000, 600000, auth.uid())`,
              [student, enrolment, id],
            ),
          ),
        ).toBe("23505");
      });
    });

    it("refuses a second active enrolment, a closed group and a date outside the range", async () => {
      await as("manager", async (s) => {
        const student = await newStudent(s);
        await s.rows(`select public.enrol_student($1, $2, ${today})`, [student, groupId(2)]);
        expect(code(await s.attempt(`select public.enrol_student($1, $2, ${today})`, [student, groupId(2)]))).toBe("23505");
        expect(code(await s.attempt(`select public.enrol_student($1, $2, ${monthStart} - 1)`, [student, groupId(3)]))).toBe("EC002");
        expect(
          code(await s.attempt(`select public.enrol_student($1, $2, public.lesson_horizon() + 1)`, [student, groupId(3)])),
        ).toBe("EC002");

        const finished = await newGroup(s, [1, 3, 5]);
        await s.rows(`update groups set status = 'finished' where id = $1`, [finished]);
        expect(code(await s.attempt(`select public.enrol_student($1, $2, ${today})`, [student, finished]))).toBe("EC001");
      });
    });

    it("a student who had left becomes active again", async () => {
      await as("manager", async (s) => {
        await s.rows(`select public.enrol_student($1, $2, ${today})`, [studentId(79), groupId(2)]);
        expect(await s.rows(`select status from students where id = $1`, [studentId(79)])).toEqual([{ status: "active" }]);
      });
    });
  });

  describe("leave_group and transfer_student", () => {
    const enrolmentOf = async (s: Session, student: string) =>
      (await s.rows<{ id: string; group_id: string }>(
        `select id, group_id from enrollments where student_id = $1 and status = 'active' order by joined_on limit 1`,
        [student],
      ))[0];

    it.each(BOTH)("%s removes a student from a group, with a credit that needs a note", async (who) => {
      await as(who, async (s) => {
        const enrolment = await enrolmentOf(s, studentId(1));
        expect(code(await s.attempt(`select public.leave_group($1, ${today}, 100000, ' ')`, [enrolment.id]))).toBe("23514");
        expect(code(await s.attempt(`select public.leave_group($1, ${today} + 1)`, [enrolment.id]))).toBe("EC002");

        await s.rows(`select public.leave_group($1, ${today}, 100000, 'Qolgan darslar uchun')`, [enrolment.id]);
        expect(
          await s.rows(`select status, left_on = ${today} as today from enrollments where id = $1`, [enrolment.id]),
        ).toEqual([{ status: "left", today: true }]);
        expect(
          await s.rows(
            `select amount::int as amount, note, group_id from charges where enrollment_id = $1 and type = 'adjustment'`,
            [enrolment.id],
          ),
        ).toEqual([{ amount: -100_000, note: "Qolgan darslar uchun", group_id: enrolment.group_id }]);
        // The student is still a student of the centre.
        expect(await s.rows(`select status from students where id = $1`, [studentId(1)])).toEqual([{ status: "active" }]);
      });
    });

    it("leaving without a credit writes no charge", async () => {
      await as("manager", async (s) => {
        const enrolment = await enrolmentOf(s, studentId(2));
        const before = await s.count("charges", `student_id = '${studentId(2)}'`);
        await s.rows(`select public.leave_group($1, ${today})`, [enrolment.id]);
        expect(await s.count("charges", `student_id = '${studentId(2)}'`)).toBe(before);
      });
    });

    it.each(BOTH)("%s transfers a student: leaves A and joins B on the same date, credit and first charge together", async (who) => {
      await as(who, async (s) => {
        const from = await enrolmentOf(s, studentId(1));
        const to = from.group_id === groupId(9) ? groupId(8) : groupId(9);
        expect(code(await s.attempt(`select public.transfer_student($1, $2, ${today})`, [from.id, from.group_id]))).toBe("EC006");

        const [proposal] = await s.rows<{ amount: string }>(`select amount from public.propose_first_charge($1, ${today})`, [to]);
        await s.rows(`select public.transfer_student($1, $2, ${today}, 50000, 'Guruh almashdi')`, [from.id, to]);

        expect(
          await s.rows(
            `select group_id, status, coalesce(left_on, joined_on) = ${today} as today
             from enrollments where student_id = $1 and (id = $2 or group_id = $3) order by status`,
            [studentId(1), from.id, to],
          ),
        ).toEqual([
          { group_id: to, status: "active", today: true },
          { group_id: from.group_id, status: "left", today: true },
        ]);
        expect(
          await s.rows(
            `select type, amount::int as amount, group_id from charges
             where student_id = $1 and created_at = now() order by type`,
            [studentId(1)],
          ),
        ).toEqual([
          { type: "monthly_fee", amount: Number(proposal.amount), group_id: to },
          { type: "adjustment", amount: -50_000, group_id: from.group_id },
        ]);
      });
    });
  });

  describe("save_attendance", () => {
    const marks = (...entries: Array<[string, string]>) =>
      JSON.stringify(entries.map(([student_id, status]) => ({ student_id, status })));

    /** A group with a lesson today and one student enrolled from the 1st. */
    async function lessonToday(s: Session) {
      const group = await newGroup(s, [1, 2, 3, 4, 5, 6, 7]);
      const student = await newStudent(s);
      await s.rows(`select public.enrol_student($1, $2, ${monthStart})`, [student, group]);
      const [{ id }] = await s.rows<{ id: string }>(
        `select id from lessons where group_id = $1 and lesson_date = ${today}`,
        [group],
      );
      return { group, student, lesson: id };
    }

    it.each(BOTH)("%s saves the marks and the lesson becomes held; saving again changes them", async (who) => {
      await as(who, async (s) => {
        const { student, lesson } = await lessonToday(s);
        await s.rows(`select public.save_attendance($1, $2)`, [lesson, marks([student, "late"])]);
        expect(await s.rows(`select status from lessons where id = $1`, [lesson])).toEqual([{ status: "held" }]);
        expect(
          await s.rows(`select status, marked_by = auth.uid() as mine from attendance where lesson_id = $1`, [lesson]),
        ).toEqual([{ status: "late", mine: true }]);

        await s.rows(`select public.save_attendance($1, $2)`, [lesson, marks([student, "absent"])]);
        expect(await s.rows(`select status from attendance where lesson_id = $1`, [lesson])).toEqual([{ status: "absent" }]);
        // Attendance never changes charges.
        expect(await s.count("charges", `student_id = '${student}'`)).toBe(1);
      });
    });

    it("refuses a student who is not in the group, a future lesson and a cancelled lesson", async () => {
      await as("manager", async (s) => {
        const { group, student, lesson } = await lessonToday(s);
        expect(code(await s.attempt(`select public.save_attendance($1, $2)`, [lesson, marks([studentId(1), "present"])]))).toBe("EC005");
        expect(code(await s.attempt(`select public.save_attendance($1, '[]')`, [lesson]))).toBe("22023");

        const [future] = await s.rows<{ id: string }>(
          `select id from lessons where group_id = $1 and lesson_date = ${today} + 1`,
          [group],
        );
        expect(code(await s.attempt(`select public.save_attendance($1, $2)`, [future.id, marks([student, "present"])]))).toBe("EC004");

        await s.rows(`update lessons set status = 'cancelled', cancel_reason = 'Test' where id = $1`, [lesson]);
        expect(code(await s.attempt(`select public.save_attendance($1, $2)`, [lesson, marks([student, "present"])]))).toBe("EC003");
      });
    });

    it("a manager cannot mark a lesson more than 7 days old; the owner can", async () => {
      const old = `select l.id as lesson, a.student_id as student from lessons l join attendance a on a.lesson_id = l.id
                   where l.lesson_date < ${today} - 7 and l.status = 'held' order by l.lesson_date limit 1`;
      const save = async (s: Session) => {
        const [row] = await s.rows<{ lesson: string; student: string }>(old);
        return s.attempt(`select public.save_attendance($1, $2)`, [row.lesson, marks([row.student, "excused"])]);
      };
      expect(code(await as("manager", save))).toBe(DENIED);
      expect((await as("owner", save)).ok).toBe(true);
    });

    it("restoring a cancelled lesson makes it held if it was marked, scheduled if not", async () => {
      await as("manager", async (s) => {
        const { group, student, lesson } = await lessonToday(s);
        await s.rows(`select public.save_attendance($1, $2)`, [lesson, marks([student, "present"])]);
        const [other] = await s.rows<{ id: string }>(
          `select id from lessons where group_id = $1 and lesson_date = ${today} + 2`,
          [group],
        );
        await s.rows(`update lessons set status = 'cancelled', cancel_reason = 'Test' where id in ($1, $2)`, [lesson, other.id]);
        await s.rows(`select public.restore_lesson($1), public.restore_lesson($2)`, [lesson, other.id]);
        expect(
          await s.rows(`select id = $1 as marked, status, cancel_reason from lessons where id in ($1, $2) order by lesson_date`, [lesson, other.id]),
        ).toEqual([
          { marked: true, status: "held", cancel_reason: null },
          { marked: false, status: "scheduled", cancel_reason: null },
        ]);
        expect(code(await s.attempt(`select public.restore_lesson($1)`, [lesson]))).toBe("P0002");
      });
    });
  });

  it("a deactivated manager cannot generate or rebuild lessons", async () => {
    await as(
      "manager",
      async (s) => {
        expect(code(await s.attempt(`select public.generate_lessons($1, ${today}, ${today} + 7)`, [groupId(1)]))).toBe(DENIED);
        expect(code(await s.attempt(`select public.rebuild_future_lessons($1)`, [groupId(1)]))).toBe(DENIED);
      },
      (a) => a.rows(`update profiles set is_active = false where id = $1`, [MANAGER_ID]).then(() => {}),
    );
  });

  it("a visitor who is not signed in cannot call any of these functions", async () => {
    await as("anon", async (s) => {
      for (const call of [
        `public.generate_lessons('${groupId(1)}', current_date, current_date)`,
        `public.generate_all_lessons()`,
        `public.rebuild_future_lessons('${groupId(1)}')`,
        `public.enrol_student('${studentId(1)}', '${groupId(2)}', current_date)`,
        `public.leave_group('${groupId(1)}', current_date)`,
        `public.save_attendance('${groupId(1)}', '[]')`,
        `public.restore_lesson('${groupId(1)}')`,
      ]) {
        expect(code(await s.attempt(`select ${call}`)), call).toBe(DENIED);
      }
      expect(code(await s.attempt(`select * from public.propose_first_charge('${groupId(1)}', current_date)`))).toBe(DENIED);
    });
  });
});
