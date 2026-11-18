/**
 * The teacher login and coins — docs/SPEC.md → "Roles and permissions",
 * "Business rules → Coins". A teacher reaches only their own groups, through
 * functions that return students' names and nothing else about them.
 * Same setup as permissions.test.ts; every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DB_URL, DENIED, MANAGER_ID, OWNER_ID, TEACHER_USER_ID, as, connect, disconnect, teacherId,
  type Attempt, type Session,
} from "./helpers";

const code = (result: Attempt) => (result.ok ? `allowed (${result.rowCount})` : result.code);
const TEACHER = teacherId(2);

let own: { ielts: string; kids: string };
let other: string; // a group of another teacher
let ownStudent: string; // in IELTS 6.5
let otherStudent: string; // only in another teacher's group

const lessonOn = async (s: Session, group: string, where: string) =>
  (await s.rows<{ id: string }>(`select id from lessons where group_id = $1 and ${where} order by lesson_date desc limit 1`, [group]))[0]?.id;

describe.skipIf(!DB_URL)("Teacher login and coins", () => {
  beforeAll(async () => {
    await connect();
    await as("owner", async (s) => {
      const groups = await s.rows<{ id: string; name: string; teacher_id: string }>(`select id, name, teacher_id from groups where status = 'active'`);
      own = { ielts: groups.find((g) => g.name === "IELTS 6.5")!.id, kids: groups.find((g) => g.name === "English Kids")!.id };
      other = groups.find((g) => g.teacher_id !== TEACHER)!.id;
      ownStudent = (await s.rows<{ student_id: string }>(`select student_id from enrollments where group_id = $1 and status = 'active' order by student_id limit 1`, [own.ielts]))[0].student_id;
      otherStudent = (
        await s.rows<{ student_id: string }>(
          `select e.student_id from enrollments e where e.group_id = $1 and e.status = 'active'
             and not exists (select 1 from enrollments x join groups g on g.id = x.group_id
                             where x.student_id = e.student_id and g.teacher_id = $2)
           order by e.student_id limit 1`,
          [other, TEACHER],
        )
      )[0].student_id;
    });
  });
  afterAll(disconnect);

  describe("what a teacher cannot reach", () => {
    it("no table shows a teacher anything but their own profile", async () => {
      await as("teacher", async (s) => {
        for (const table of [
          "students", "leads", "lead_activities", "teachers", "teacher_rates", "groups", "enrollments", "lessons",
          "attendance", "charges", "payments", "expenses", "teacher_payouts", "messages", "message_templates",
          "centre_settings", "rooms", "coin_transactions", "student_balances", "student_overview",
        ]) {
          const result = await s.attempt(`select 1 from public.${table}`);
          expect(`${table}: ${result.ok ? result.rowCount : "denied"}`).toMatch(new RegExp(`^${table}: (0|denied)$`));
        }
        expect(await s.rows(`select id, role from profiles`)).toEqual([{ id: TEACHER_USER_ID, role: "teacher" }]);
      });
    });

    it("no staff function gives a teacher anything", async () => {
      await as("teacher", async (s) => {
        const month = `date_trunc('month', public.tashkent_today())::date`;
        for (const call of [
          `select * from public.finance_month_summary(${month})`,
          `select * from public.report_kpis(${month}, ${month})`,
          `select * from public.list_adjustments(${month}, 10, 0)`,
          `select public.generate_monthly_charges(${month})`,
          `select public.calculate_teacher_payouts(${month})`,
        ]) {
          expect(`${call}: ${code(await s.attempt(call))}`).toBe(`${call}: ${DENIED}`);
        }
        expect(code(await s.attempt(`select * from public.list_debtors()`))).toBe("allowed (0)");
        // Writing straight to the tables is refused or touches nothing.
        expect(code(await s.attempt(`update students set full_name = 'x'`))).toBe("allowed (0)");
        expect(code(await s.attempt(`update groups set name = 'x'`))).toBe("allowed (0)");
        expect(code(await s.attempt(`insert into payments (student_id, group_id, amount, method) values ($1, $2, 1000, 'cash')`, [ownStudent, own.ielts]))).toBe(DENIED);
        expect(code(await s.attempt(`insert into coin_transactions (student_id, group_id, amount) values ($1, $2, 5)`, [ownStudent, own.ielts]))).toBe(DENIED);
      });
    });

    it("another teacher's group, its lessons and its students are refused", async () => {
      await as("teacher", async (s) => {
        expect(code(await s.attempt(`select * from public.teacher_lessons($1)`, [other]))).toBe(DENIED);
        expect(code(await s.attempt(`select * from public.group_coins($1)`, [other]))).toBe(DENIED);
        expect(code(await s.attempt(`select public.add_coins($1, $2, 5)`, [otherStudent, other]))).toBe(DENIED);
      });
      const lesson = await as("owner", (s) => lessonOn(s, other, `lesson_date <= public.tashkent_today() and status <> 'cancelled'`));
      await as("teacher", async (s) => {
        expect(await s.rows(`select * from public.teacher_lesson($1)`, [lesson])).toEqual([]);
        expect(await s.rows(`select * from public.teacher_lesson_sheet($1)`, [lesson])).toEqual([]);
        expect(code(await s.attempt(`select public.teacher_save_attendance($1, $2::jsonb)`, [lesson, JSON.stringify([{ student_id: otherStudent, status: "present" }])]))).toBe(DENIED);
        // The staff function sees no lesson at all for a teacher.
        expect(code(await s.attempt(`select public.save_attendance($1, $2::jsonb)`, [lesson, JSON.stringify([{ student_id: otherStudent, status: "present" }])]))).toBe("P0002");
      });
    });

    it("a manager and an owner are not teachers: the teacher functions give them nothing", async () => {
      for (const who of ["manager", "owner"] as const) {
        await as(who, async (s) => {
          expect(await s.rows(`select * from public.teacher_groups()`)).toEqual([]);
          expect(code(await s.attempt(`select * from public.teacher_lessons($1)`, [own.ielts]))).toBe(DENIED);
        });
      }
      await as("anon", async (s) => {
        expect(code(await s.attempt(`select * from public.teacher_groups()`))).toBe(DENIED);
        expect(code(await s.attempt(`select public.add_coins($1, $2, 5)`, [ownStudent, own.ielts]))).toBe(DENIED);
      });
    });

    it("a deactivated teacher has nothing", async () => {
      await as(
        "teacher",
        async (s) => {
          expect(await s.rows(`select * from public.teacher_groups()`)).toEqual([]);
          expect(code(await s.attempt(`select * from public.group_coins($1)`, [own.ielts]))).toBe(DENIED);
          expect(code(await s.attempt(`select public.add_coins($1, $2, 5)`, [ownStudent, own.ielts]))).toBe(DENIED);
          expect(await s.count("profiles")).toBe(0);
        },
        async (a) => {
          await a.rows(`update profiles set is_active = false where id = $1`, [TEACHER_USER_ID]);
        },
      );
    });
  });

  describe("what a teacher sees", () => {
    it("their own groups, and only names of the students in them", async () => {
      await as("teacher", async (s) => {
        const groups = await s.rows<{ id: string; name: string; students: number }>(`select * from public.teacher_groups()`);
        expect(groups.map((g) => g.name)).toEqual(["English Kids", "IELTS 6.5"]);
        expect(groups.every((g) => g.students > 0)).toBe(true);
        // No fee, no teacher pay: only what the timetable needs.
        expect(Object.keys(groups[0]).sort()).toEqual(
          ["days", "duration_min", "id", "level", "name", "room_name", "room_number", "start_time", "status", "students", "subject"],
        );

        const students = await s.rows<Record<string, unknown>>(`select * from public.group_coins($1)`, [own.ielts]);
        expect(students.length).toBe(groups.find((g) => g.id === own.ielts)!.students);
        expect(Object.keys(students[0]).sort()).toEqual(["balance", "earned", "full_name", "rank", "student_id"]);
      });
    });

    it("a finished or archived group is no longer theirs", async () => {
      await as(
        "teacher",
        async (s) => {
          expect((await s.rows<{ name: string }>(`select name from public.teacher_groups()`)).map((g) => g.name)).toEqual(["English Kids"]);
          expect(code(await s.attempt(`select * from public.teacher_lessons($1)`, [own.ielts]))).toBe(DENIED);
        },
        async (a) => {
          await a.rows(`update groups set status = 'finished' where id = $1`, [own.ielts]);
        },
      );
    });

    it("lessons from 7 days back to 14 ahead", async () => {
      await as("teacher", async (s) => {
        const lessons = await s.rows<{ lesson_date: string; can_mark: boolean; future: boolean; old: boolean }>(
          `select lesson_date::text, can_mark, lesson_date > public.tashkent_today() as future,
                  lesson_date < public.tashkent_today() - 7 as old
           from public.teacher_lessons($1)`,
          [own.ielts],
        );
        expect(lessons.length).toBeGreaterThan(3);
        expect(lessons.some((l) => l.old)).toBe(false);
        expect(lessons.filter((l) => l.future).every((l) => !l.can_mark)).toBe(true);
      });
    });
  });

  describe("attendance", () => {
    it("a teacher marks a lesson of their own group, in their own name", async () => {
      const lesson = await as("owner", (s) =>
        lessonOn(s, own.ielts, `lesson_date between public.tashkent_today() - 7 and public.tashkent_today() and status <> 'cancelled'`),
      );
      expect(lesson).toBeTruthy();
      await as("teacher", async (s) => {
        const sheet = await s.rows<{ student_id: string; full_name: string }>(`select * from public.teacher_lesson_sheet($1)`, [lesson]);
        expect(sheet.length).toBeGreaterThan(0);
        expect(Object.keys(sheet[0]).sort()).toEqual(["full_name", "mark", "student_id"]);
        const marks = sheet.map((row, i) => ({ student_id: row.student_id, status: i === 0 ? "absent" : "present" }));
        expect(code(await s.attempt(`select public.teacher_save_attendance($1, $2::jsonb)`, [lesson, JSON.stringify(marks)]))).toBe("allowed (1)");
        const after = await s.rows<{ student_id: string; mark: string }>(`select student_id, mark from public.teacher_lesson_sheet($1)`, [lesson]);
        expect(after.find((row) => row.student_id === sheet[0].student_id)?.mark).toBe("absent");
        expect(after.filter((row) => row.mark === "present").length).toBe(sheet.length - 1);
        expect(await s.rows(`select status, can_mark from public.teacher_lesson($1)`, [lesson])).toEqual([{ status: "held", can_mark: true }]);
        // A student who is not in the group is refused.
        expect(code(await s.attempt(`select public.teacher_save_attendance($1, $2::jsonb)`, [lesson, JSON.stringify([{ student_id: otherStudent, status: "present" }])]))).toBe("EC005");
      });
      // Rolled back above; check the author inside one transaction.
      await as("owner", async (s) => {
        const [student] = await s.rows<{ student_id: string }>(
          `select e.student_id from enrollments e join lessons l on l.id = $1
           where e.group_id = l.group_id and e.joined_on <= l.lesson_date and (e.left_on is null or e.left_on >= l.lesson_date) limit 1`,
          [lesson],
        );
        await s.rows(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: TEACHER_USER_ID, role: "authenticated" })]);
        await s.rows(`select public.teacher_save_attendance($1, $2::jsonb)`, [lesson, JSON.stringify([{ student_id: student.student_id, status: "late" }])]);
        await s.rows(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: OWNER_ID, role: "authenticated" })]);
        expect(await s.rows(`select status, marked_by from attendance where lesson_id = $1 and student_id = $2`, [lesson, student.student_id])).toEqual([
          { status: "late", marked_by: TEACHER_USER_ID },
        ]);
      });
    });

    it("not a past lesson, a future one or a cancelled one", async () => {
      const ids = await as("owner", async (s) => ({
        old: await lessonOn(s, own.ielts, `lesson_date < public.tashkent_today() - 7`),
        yesterday: await lessonOn(s, own.ielts, `lesson_date < public.tashkent_today()`),
        future: await lessonOn(s, own.ielts, `lesson_date > public.tashkent_today()`),
      }));
      const marks = JSON.stringify([{ student_id: ownStudent, status: "present" }]);
      await as("teacher", async (s) => {
        expect(code(await s.attempt(`select public.teacher_save_attendance($1, $2::jsonb)`, [ids.old, marks]))).toBe("ET001");
        expect(await s.rows(`select * from public.teacher_lesson($1)`, [ids.old])).toEqual([]);
        // The most recent past lesson can be opened to read, not marked.
        expect(code(await s.attempt(`select public.teacher_save_attendance($1, $2::jsonb)`, [ids.yesterday, marks]))).toBe("ET001");
        expect(await s.rows(`select can_mark from public.teacher_lesson($1)`, [ids.yesterday])).toEqual([{ can_mark: false }]);
        expect(code(await s.attempt(`select public.teacher_save_attendance($1, $2::jsonb)`, [ids.future, marks]))).toBe("ET001");
      });
      // Today's lesson, once cancelled, cannot be marked either.
      await as(
        "teacher",
        async (s) => {
          const [{ id }] = await s.rows<{ id: string }>(`select id from public.teacher_lessons($1) where lesson_date = public.tashkent_today()`, [own.ielts]);
          expect(code(await s.attempt(`select public.teacher_save_attendance($1, $2::jsonb)`, [id, marks]))).toBe("EC003");
        },
        async (a) => {
          await a.rows(`update lessons set lesson_date = public.tashkent_today(), start_time = '23:58', status = 'cancelled', cancel_reason = 'Test'
                        where id = (select id from lessons where group_id = $1 and lesson_date > public.tashkent_today() order by lesson_date limit 1)`, [own.ielts]);
          await a.rows(`delete from lessons where group_id = $1 and lesson_date = public.tashkent_today() and start_time <> '23:58' and not exists (select 1 from attendance x where x.lesson_id = lessons.id)`, [own.ielts]);
        },
      );
    });

    it("a student taken out and put back the same day is listed once on the lesson", async () => {
      await as(
        "teacher",
        async (s) => {
          const [{ id }] = await s.rows<{ id: string }>(`select id from public.teacher_lessons($1) where lesson_date = public.tashkent_today() and start_time = '23:57'`, [own.ielts]);
          const sheet = await s.rows<{ student_id: string }>(`select student_id from public.teacher_lesson_sheet($1)`, [id]);
          expect(sheet.filter((row) => row.student_id === ownStudent)).toHaveLength(1);
          expect(new Set(sheet.map((row) => row.student_id)).size).toBe(sheet.length);
          const all = JSON.stringify(sheet.map((row) => ({ student_id: row.student_id, status: "present" })));
          expect(code(await s.attempt(`select public.teacher_save_attendance($1, $2::jsonb)`, [id, all]))).toMatch(/^allowed/);
        },
        async (a) => {
          await a.rows(`update lessons set lesson_date = public.tashkent_today(), start_time = '23:57', status = 'scheduled', cancel_reason = null
                        where id = (select id from lessons where group_id = $1 and lesson_date > public.tashkent_today() order by lesson_date desc limit 1)`, [own.ielts]);
          await a.rows(`update enrollments set status = 'left', left_on = public.tashkent_today() where group_id = $1 and student_id = $2 and status = 'active'`, [own.ielts, ownStudent]);
          await a.rows(`insert into enrollments (group_id, student_id, joined_on) values ($1, $2, public.tashkent_today())`, [own.ielts, ownStudent]);
        },
      );
    });
  });

  describe("coins", () => {
    it("a teacher gives 1 to 10 coins to a student of their own group", async () => {
      await as("teacher", async (s) => {
        expect(await s.rows(`select public.add_coins($1, $2, 5, ' Homework ') as balance`, [ownStudent, own.ielts])).toEqual([{ balance: "5" }]);
        expect(await s.rows(`select public.add_coins($1, $2, 10) as balance`, [ownStudent, own.ielts])).toEqual([{ balance: "15" }]);
        for (const amount of [0, -1, 11, null]) {
          expect(`${amount}: ${code(await s.attempt(`select public.add_coins($1, $2, $3)`, [ownStudent, own.ielts, amount]))}`).toBe(`${amount}: ET002`);
        }
        // Their own group, but the student is not in it.
        expect(code(await s.attempt(`select public.add_coins($1, $2, 5)`, [otherStudent, own.ielts]))).toBe("ET005");
        // No group named: refused.
        expect(code(await s.attempt(`select public.add_coins($1, null, 5)`, [ownStudent]))).toBe(DENIED);

        const [row] = await s.rows(`select earned::int, balance::int, rank from public.group_coins($1) where student_id = $2`, [own.ielts, ownStudent]);
        expect(row).toEqual({ earned: 15, balance: 15, rank: 1 });
      });
    });

    it("the ledger keeps who gave what, where and why", async () => {
      await as("owner", async (s) => {
        await s.rows(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: TEACHER_USER_ID, role: "authenticated" })]);
        await s.rows(`select public.add_coins($1, $2, 3, ' Homework ')`, [ownStudent, own.ielts]);
        await s.rows(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: OWNER_ID, role: "authenticated" })]);
        expect(await s.rows(`select student_id, group_id, amount, reason, created_by from coin_transactions`)).toEqual([
          { student_id: ownStudent, group_id: own.ielts, amount: 3, reason: "Homework", created_by: TEACHER_USER_ID },
        ]);
        // Nobody edits or removes a row, the owner included.
        expect(code(await s.attempt(`update coin_transactions set amount = 100`))).toBe(DENIED);
        expect(code(await s.attempt(`delete from coin_transactions`))).toBe(DENIED);
        expect(code(await s.attempt(`insert into coin_transactions (student_id, amount) values ($1, 5)`, [ownStudent]))).toBe(DENIED);
      });
    });

    it("staff give any amount and spend with a reason, never below zero", async () => {
      await as("manager", async (s) => {
        expect(await s.rows(`select public.add_coins($1, $2, 40) as balance`, [ownStudent, own.ielts])).toEqual([{ balance: "40" }]);
        expect(code(await s.attempt(`select public.add_coins($1, $2, -5)`, [ownStudent, own.ielts]))).toBe("ET003");
        expect(code(await s.attempt(`select public.add_coins($1, $2, -5, '  ')`, [ownStudent, own.ielts]))).toBe("ET003");
        expect(code(await s.attempt(`select public.add_coins($1, $2, -41, 'Prize')`, [ownStudent, own.ielts]))).toBe("ET004");
        expect(code(await s.attempt(`select public.add_coins($1, $2, 0)`, [ownStudent, own.ielts]))).toBe("ET002");
        expect(await s.rows(`select public.add_coins($1, $2, -15, 'Notebook') as balance`, [ownStudent, own.ielts])).toEqual([{ balance: "25" }]);
        // Spending does not belong to a group and does not lower what was earned.
        expect(await s.rows(`select group_id, amount, created_by from coin_transactions where amount < 0`)).toEqual([
          { group_id: null, amount: -15, created_by: MANAGER_ID },
        ]);
        const [row] = await s.rows(`select earned::int, balance::int, rank from public.group_coins($1) where student_id = $2`, [own.ielts, ownStudent]);
        expect(row).toEqual({ earned: 40, balance: 25, rank: 1 });
        // Giving needs a group the student is in.
        expect(code(await s.attempt(`select public.add_coins($1, $2, 5)`, [otherStudent, own.ielts]))).toBe("ET005");
        expect(code(await s.attempt(`select public.add_coins($1, null, 5)`, [ownStudent]))).toBe("ET005");
        expect(code(await s.attempt(`select public.add_coins(gen_random_uuid(), $1, 5)`, [own.ielts]))).toBe("P0002");
      });
    });

    it("the ranking is by coins earned in the group; equal counts share a place", async () => {
      await as("manager", async (s) => {
        const students = (await s.rows<{ student_id: string }>(`select student_id from public.group_coins($1)`, [own.ielts])).map((r) => r.student_id);
        expect(students.length).toBeGreaterThanOrEqual(4);
        const [a, b, c] = students;
        await s.rows(`select public.add_coins($1, $2, 30)`, [a, own.ielts]);
        await s.rows(`select public.add_coins($1, $2, 50)`, [b, own.ielts]);
        await s.rows(`select public.add_coins($1, $2, 30)`, [c, own.ielts]);
        // Spending does not move anyone down.
        await s.rows(`select public.add_coins($1, $2, -45, 'Prize')`, [b, own.ielts]);
        const top = await s.rows(`select student_id, earned::int, balance::int, rank from public.group_coins($1) limit 4`, [own.ielts]);
        expect(top[0]).toEqual({ student_id: b, earned: 50, balance: 5, rank: 1 });
        expect(top.slice(1, 3).map((r) => [r.earned, r.rank])).toEqual([[30, 2], [30, 2]]);
        expect(top[3]).toMatchObject({ earned: 0, rank: 4 });
      });
    });
  });

  describe("the teacher login", () => {
    it("a teacher changes their own name and language, and nothing else", async () => {
      await as("teacher", async (s) => {
        expect(code(await s.attempt(`update profiles set full_name = 'Nodira S.', language = 'ru' where id = $1`, [TEACHER_USER_ID]))).toBe("allowed (1)");
        expect(code(await s.attempt(`update profiles set role = 'owner', teacher_id = null where id = $1`, [TEACHER_USER_ID]))).toBe(DENIED);
        expect(code(await s.attempt(`update profiles set teacher_id = $2 where id = $1`, [TEACHER_USER_ID, teacherId(1)]))).toBe(DENIED);
        expect(code(await s.attempt(`update profiles set is_active = false where id = $1`, [TEACHER_USER_ID]))).toBe(DENIED);
        expect(code(await s.attempt(`update profiles set full_name = 'x' where id = $1`, [OWNER_ID]))).toBe("allowed (0)");
      });
    });

    it("a teacher role always has a teacher record, and a teacher has one login", async () => {
      await as("owner", async (s) => {
        expect(code(await s.attempt(`update profiles set role = 'teacher' where id = $1`, [MANAGER_ID]))).toBe("23514");
        expect(code(await s.attempt(`update profiles set teacher_id = $2 where id = $1`, [MANAGER_ID, teacherId(1)]))).toBe("23514");
        expect(code(await s.attempt(`update profiles set role = 'teacher', teacher_id = $2 where id = $1`, [MANAGER_ID, TEACHER]))).toBe("23505");
        expect(code(await s.attempt(`update profiles set role = 'teacher', teacher_id = $2 where id = $1`, [MANAGER_ID, teacherId(1)]))).toBe("allowed (1)");
      });
      await as("manager", async (s) => {
        expect(code(await s.attempt(`update profiles set role = 'teacher', teacher_id = $2 where id = $1`, [MANAGER_ID, teacherId(1)]))).toBe(DENIED);
      });
    });

    it("a manager turned into a teacher stops being staff at once", async () => {
      await as(
        "manager",
        async (s) => {
          expect(await s.count("students")).toBe(0);
          expect(await s.count("payments")).toBe(0);
          expect((await s.rows(`select name from public.teacher_groups()`)).length).toBeGreaterThan(0);
        },
        async (a) => {
          await a.rows(`update profiles set role = 'teacher', teacher_id = $2 where id = $1`, [MANAGER_ID, teacherId(1)]);
        },
      );
    });

    it("an invited teacher gets the role only with a teacher who has no login", async () => {
      const invite = (id: string, teacher: string | null) =>
        `insert into auth.users (instance_id, id, aud, role, email, invited_at, raw_app_meta_data, raw_user_meta_data)
         values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${id}@example.uz', now(),
                 '{}', '${JSON.stringify({ role: "teacher", full_name: "New Teacher", ...(teacher ? { teacher_id: teacher } : {}) })}')`;
      const ids = ["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002", "aaaaaaaa-0000-4000-8000-000000000003"];
      await as(
        "owner",
        async (s) => {
          expect(await s.rows(`select role, teacher_id, is_active from profiles where id = any($1) order by id`, [ids])).toEqual([
            { role: "teacher", teacher_id: teacherId(4), is_active: true },
            // Teacher 2 already has a login; no teacher named: left for the owner to sort out.
            { role: "manager", teacher_id: null, is_active: false },
            { role: "manager", teacher_id: null, is_active: false },
          ]);
        },
        async (a) => {
          await a.rows(invite(ids[0], teacherId(4)));
          await a.rows(invite(ids[1], TEACHER));
          await a.rows(invite(ids[2], null));
        },
      );
    });
  });
});
