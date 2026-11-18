/**
 * The points engine — docs/SPEC.md → "Points and rewards add-on → Point rules".
 * The pure rules are tested in src/lib/domain/points.test.ts; this suite
 * proves the database follows them. Every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, OWNER_ID, admin, as, connect, disconnect, teacherId, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);
const TEACHER = teacherId(2);
const today = "public.tashkent_today()";
const thisMonth = `date_trunc('month', ${today})::date`;
const lastMonth = `(date_trunc('month', ${today}) - interval '1 month')::date`;

let ownGroup: string; // IELTS 6.5, taught by the teacher login
let otherGroup: string; // another teacher's
let otherStudent: string; // only in another teacher's group
let lesson: string; // a recent lesson of ownGroup
let lessonStudent: string; // enrolled on that lesson's day

const ledger = (s: Session, where: string, params: unknown[] = []) =>
  s.rows<{ delta: number; source: string; dedupe_key: string | null; reason: string | null }>(
    `select delta, source, dedupe_key, reason from points_ledger where ${where} order by created_at, id`,
    params,
  );
const sum = async (s: Session, where: string, params: unknown[] = []) =>
  (await s.rows<{ n: number }>(`select coalesce(sum(delta), 0)::int as n from points_ledger where ${where}`, params))[0].n;
const mark = (s: Session, status: string, student = lessonStudent) =>
  s.rows(`select public.save_attendance($1, $2::jsonb)`, [lesson, JSON.stringify([{ student_id: student, status }])]);
/** The lesson starts with no mark and no points for the student. */
const cleanLesson = async (s: Session) => {
  await s.rows(`update points_settings set enabled = false`);
  await s.rows(`delete from attendance where lesson_id = $1 and student_id = $2`, [lesson, lessonStudent]);
  await s.rows(`delete from points_ledger where lesson_id = $1 and student_id = $2`, [lesson, lessonStudent]);
  await s.rows(`update points_settings set enabled = true, started_at = now() - interval '6 months'`);
};
// Rows of one transaction share a timestamp: the key's counter gives the order they were posted in.
const attendanceRows = (s: Session) =>
  s.rows<{ delta: number; source: string; dedupe_key: string | null; reason: string | null }>(
    `select delta, source, dedupe_key, reason from points_ledger
     where source = 'attendance' and lesson_id = $1 and student_id = $2 and created_at >= now()
     order by length(dedupe_key), dedupe_key`,
    [lesson, lessonStudent],
  );
const posted = async (s: Session) => (await attendanceRows(s)).map((row) => row.delta);
/** A new student with no points, enrolled in the teacher's group. */
const newStudent = async (s: Session, name = "Points Test") => {
  const [{ id }] = await s.rows<{ id: string }>(
    `insert into students (full_name, phone) values ($1, '+998900000' || lpad((random() * 999)::int::text, 3, '0')) returning id`,
    [name],
  );
  await s.rows(`insert into enrollments (group_id, student_id, joined_on) values ($1, $2, ${today} - 30)`, [ownGroup, id]);
  return id;
};
const award = (s: Session, student: string, points: number | null, opts: { preset?: string; reason?: string; group?: string } = {}) =>
  s.attempt(`select * from public.award_points($1, $2, $3, $4, $5)`, [student, opts.group ?? ownGroup, points, opts.preset ?? null, opts.reason ?? null]);

describe.skipIf(!DB_URL)("Points engine", () => {
  beforeAll(async () => {
    await connect();
    await admin(async (s) => {
      const groups = await s.rows<{ id: string; name: string; teacher_id: string }>(`select id, name, teacher_id from groups where status = 'active' and archived_at is null`);
      ownGroup = groups.find((g) => g.name === "IELTS 6.5")!.id;
      otherGroup = groups.find((g) => g.teacher_id !== TEACHER)!.id;
      otherStudent = (
        await s.rows<{ student_id: string }>(
          `select e.student_id from enrollments e where e.group_id = $1 and e.status = 'active'
             and not exists (select 1 from enrollments x join groups g on g.id = x.group_id where x.student_id = e.student_id and g.teacher_id = $2)
           order by e.student_id limit 1`,
          [otherGroup, TEACHER],
        )
      )[0].student_id;
      const [row] = await s.rows<{ id: string; student_id: string }>(
        `select l.id, e.student_id from lessons l
         join enrollments e on e.group_id = l.group_id and e.status = 'active' and e.joined_on <= l.lesson_date
         where l.group_id = $1 and l.status <> 'cancelled' and l.lesson_date between ${today} - 6 and ${today}
         order by l.lesson_date desc, e.student_id limit 1`,
        [ownGroup],
      );
      lesson = row.id;
      lessonStudent = row.student_id;
    });
  });
  afterAll(disconnect);

  describe("attendance", () => {
    it("Present posts +2 once; Present → Absent posts −2; Absent → Late posts +1", async () => {
      await as("owner", async (s) => {
        await mark(s, "present");
        expect(await attendanceRows(s)).toEqual([
          { delta: 2, source: "attendance", dedupe_key: `attendance:${lesson}:${lessonStudent}`, reason: null },
        ]);
        await mark(s, "present");
        expect(await posted(s)).toEqual([2]);
        await mark(s, "absent");
        expect(await posted(s)).toEqual([2, -2]);
        await mark(s, "late");
        expect(await posted(s)).toEqual([2, -2, 1]);
        await mark(s, "excused");
        expect(await posted(s)).toEqual([2, -2, 1, -1]);
      }, cleanLesson);
    });

    it("cancelling the lesson reverses its points, restoring it posts them again", async () => {
      await as("owner", async (s) => {
        await mark(s, "present");
        await s.rows(`update lessons set status = 'cancelled', cancel_reason = 'Test' where id = $1`, [lesson]);
        expect(await posted(s)).toEqual([2, -2]);
        await s.rows(`update lessons set status = 'held', cancel_reason = null where id = $1`, [lesson]);
        expect(await posted(s)).toEqual([2, -2, 2]);
      }, cleanLesson);
    });

    it("the programme switched off posts nothing", async () => {
      await as("owner", async (s) => {
        await mark(s, "present");
        expect(await posted(s)).toEqual([]);
      }, async (s) => {
        await cleanLesson(s);
        await s.rows(`update points_settings set enabled = false`);
      });
    });

    it("a changed value never touches rows already posted", async () => {
      await as("owner", async (s) => {
        await mark(s, "present");
        await s.rows(`update points_settings set present = 3`);
        expect(await posted(s)).toEqual([2]);
        // Saving the same mark again posts nothing either.
        await mark(s, "present");
        expect(await posted(s)).toEqual([2]);
        // The next change is measured against what was posted.
        await mark(s, "late");
        expect(await posted(s)).toEqual([2, -1]);
      }, cleanLesson);
    });
  });

  describe("perfect month", () => {
    const start = (s: Session) => s.rows(`update points_settings set enabled = true, started_at = now() - interval '6 months'`);
    const run = async (s: Session) => (await s.rows<{ n: number }>(`select public.points_post_perfect_month(${lastMonth}) as n`))[0].n;
    /** Student and group pairs that had a perfect last month, worked out apart from the function. */
    const expected = (s: Session, min = 4) =>
      s.rows<{ student_id: string; group_id: string; marks: number }>(
        `select a.student_id, l.group_id, count(*)::int as marks from attendance a
         join lessons l on l.id = a.lesson_id join students st on st.id = a.student_id and st.archived_at is null
         where l.status = 'held' and l.lesson_date >= ${lastMonth} and l.lesson_date < ${thisMonth}
         group by 1, 2 having count(*) >= ${min} and count(*) filter (where a.status = 'absent') = 0 order by 1, 2`,
      );

    it("posts +10 per student and group, and running it twice posts nothing new", async () => {
      await admin(async (s) => {
        await start(s);
        const pairs = await expected(s);
        expect(pairs.length).toBeGreaterThan(0);
        expect(await run(s)).toBe(pairs.length);
        const [first] = pairs;
        expect(await ledger(s, `source = 'perfect_month' and student_id = $1 and group_id = $2`, [first.student_id, first.group_id])).toEqual([
          { delta: 10, source: "perfect_month", dedupe_key: expect.stringMatching(new RegExp(`^perfect_month:${first.group_id}:${first.student_id}:\\d{4}-\\d{2}$`)), reason: null },
        ]);
        expect(await run(s)).toBe(0);
      });
    });

    it("needs at least 4 held lessons, allows Late and Excused, and one Absent loses it", async () => {
      await admin(async (s) => {
        await start(s);
        const [pair] = await expected(s);
        const marks = await s.rows<{ lesson_id: string }>(
          `select a.lesson_id from attendance a join lessons l on l.id = a.lesson_id
           where a.student_id = $1 and l.group_id = $2 and l.status = 'held' and l.lesson_date >= ${lastMonth} and l.lesson_date < ${thisMonth}
           order by l.lesson_date`,
          [pair.student_id, pair.group_id],
        );
        const set = (lessonId: string, status: string) =>
          s.rows(`update attendance set status = $3 where lesson_id = $1 and student_id = $2`, [lessonId, pair.student_id, status]);
        const mine = `source = 'perfect_month' and student_id = '${pair.student_id}' and group_id = '${pair.group_id}'`;

        // More lessons required than the student had: nothing.
        await s.rows(`update points_settings set perfect_month_min_lessons = $1`, [pair.marks + 1]);
        await run(s);
        expect(await sum(s, mine)).toBe(0);
        await s.rows(`update points_settings set perfect_month_min_lessons = 4`);

        // One Absent: nothing.
        await set(marks[0].lesson_id, "absent");
        await run(s);
        expect(await sum(s, mine)).toBe(0);

        // Late and Excused are fine.
        await set(marks[0].lesson_id, "late");
        await set(marks[1].lesson_id, "excused");
        await run(s);
        expect(await sum(s, mine)).toBe(10);
      });
    });

    it("a month from before the programme started earns nothing", async () => {
      await admin(async (s) => {
        await s.rows(`update points_settings set enabled = true, started_at = now()`);
        expect(await run(s)).toBe(0);
      });
    });
  });

  describe("fee paid on time", () => {
    it("a prorated first month paid by the due day earns +10 once; late or voided payments earn nothing", async () => {
      await admin(async (s) => {
        await s.rows(`update points_settings set enabled = true, started_at = now() - interval '6 months'`);
        await s.rows(`update centre_settings set billing_day = 1, due_day = 1`);
        // The due day (the 1st) is over on every day this test can run except the 1st itself.
        const [{ over }] = await s.rows<{ over: boolean }>(`select ${today} > ${thisMonth} as over`);
        const make = async (name: string, paidAt: string, voided = false) => {
          const [{ id }] = await s.rows<{ id: string }>(
            `insert into students (full_name, phone) values ($1, '+99890111' || lpad((random() * 9999)::int::text, 4, '0')) returning id`,
            [name],
          );
          const [{ id: enrolment }] = await s.rows<{ id: string }>(
            `insert into enrollments (group_id, student_id, joined_on) values ($1, $2, ${thisMonth}) returning id`,
            [ownGroup, id],
          );
          await s.rows(
            `insert into charges (student_id, enrollment_id, group_id, billing_month, type, base_amount, discount_amount, amount, is_prorated, lessons_counted, lessons_in_month, created_at)
             values ($1, $3, $2, ${thisMonth}, 'monthly_fee', 600000, 0, 350000, true, 7, 12, ${thisMonth}::timestamp at time zone 'Asia/Tashkent')`,
            [id, ownGroup, enrolment],
          );
          await s.rows(
            `insert into payments (student_id, group_id, amount, method, paid_at, received_by, voided_at, void_reason, voided_by)
             values ($1, $2, 350000, 'cash', ${paidAt}, $3, ${voided ? "now()" : "null"}, ${voided ? "'Test'" : "null"}, ${voided ? "$3" : "null"})`,
            [id, ownGroup, OWNER_ID],
          );
          return id;
        };
        const onTime = await make("On Time", `(${thisMonth}::timestamp at time zone 'Asia/Tashkent') + interval '10 hours'`);
        const late = await make("Too Late", `(${thisMonth}::timestamp at time zone 'Asia/Tashkent') + interval '30 hours'`);
        const voided = await make("Voided", `(${thisMonth}::timestamp at time zone 'Asia/Tashkent') + interval '10 hours'`, true);
        const mine = `source = 'on_time_payment' and student_id in ('${onTime}', '${late}', '${voided}')`;

        await s.rows(`select public.points_post_on_time(${thisMonth})`);
        if (!over) return expect(await sum(s, mine)).toBe(0);
        expect(await s.rows(`select student_id, delta from points_ledger where ${mine}`)).toEqual([{ student_id: onTime, delta: 10 }]);
        await s.rows(`select public.points_post_on_time(${thisMonth})`);
        expect(await sum(s, mine)).toBe(10);
      });
    });
  });

  describe("the daily job", () => {
    it("running it twice posts nothing new", async () => {
      await admin(async (s) => {
        await s.rows(`update points_settings set enabled = true, started_at = now() - interval '6 months'`);
        await s.rows(`select public.points_daily()`);
        const once = await s.count("points_ledger");
        await s.rows(`select public.points_daily()`);
        expect(await s.count("points_ledger")).toBe(once);
      });
    });
  });

  describe("a friend enrols", () => {
    it("the referrer gets +50 only when the friend's first non-voided payment is recorded, and only once", async () => {
      await admin(async (s) => {
        await s.rows(`update points_settings set enabled = true`);
        const referrer = lessonStudent;
        const [{ id: lead }] = await s.rows<{ id: string }>(
          `insert into leads (full_name, phone, source, referred_by_student_id) values ('Friend Lead', '+998902223344', 'referral', $1) returning id`,
          [referrer],
        );
        const [{ id: friend }] = await s.rows<{ id: string }>(
          `insert into students (full_name, phone, lead_id) values ('Friend Student', '+998902223344', $1) returning id`,
          [lead],
        );
        const mine = `source = 'referral' and student_id = '${referrer}' and dedupe_key = 'referral:${friend}'`;
        const pay = (voided: boolean) =>
          s.rows(
            `insert into payments (student_id, group_id, amount, method, received_by, voided_at, void_reason, voided_by)
             values ($1, $2, 100000, 'cash', $3, ${voided ? "now()" : "null"}, ${voided ? "'Test'" : "null"}, ${voided ? "$3" : "null"})`,
            [friend, ownGroup, OWNER_ID],
          );

        expect(await sum(s, mine)).toBe(0); // the lead alone earns nothing
        await pay(true);
        expect(await sum(s, mine)).toBe(0); // a voided payment does not count
        await pay(false);
        expect(await ledger(s, mine)).toEqual([{ delta: 50, source: "referral", dedupe_key: `referral:${friend}`, reason: "Friend Student" }]);
        await pay(false);
        expect(await sum(s, mine)).toBe(50);
      });
    });
  });

  describe("teacher awards", () => {
    let student: string;
    let presets: { award: string; deduction: string };
    const setup = async (s: Session) => {
      await s.rows(`update points_settings set enabled = true`);
      student = await newStudent(s);
      const rows = await s.rows<{ id: string; kind: "award" | "deduction" }>(`select id, kind from point_presets where points = 2 order by sort`);
      presets = { award: rows.find((r) => r.kind === "award")!.id, deduction: rows.find((r) => r.kind === "deduction")!.id };
    };

    it("a preset award posts its own points; a student outside the teacher's groups is refused", async () => {
      await as("teacher", async (s) => {
        const result = await award(s, student, null, { preset: presets.award });
        expect(result.ok && result.rows).toEqual([{ ledger_id: expect.any(String), applied: 2, balance: "2" }]);
        expect(code(await award(s, otherStudent, 2, { reason: "x", group: otherGroup }))).toBe(DENIED);
        // Their own group, but a student who is not in it.
        expect(code(await award(s, otherStudent, 2, { reason: "x" }))).toBe("EP005");
      }, setup);
    });

    it("1–5 per action, and a custom amount needs a reason", async () => {
      await as("teacher", async (s) => {
        expect(code(await award(s, student, 6, { reason: "Too many" }))).toBe("EP002");
        expect(code(await award(s, student, 0, { reason: "Zero" }))).toBe("EP002");
        expect(code(await award(s, student, 3))).toBe("EP003");
        expect(code(await award(s, student, -3, { reason: " " }))).toBe("EP003");
        expect(code(await award(s, student, 5, { reason: "Olympiad" }))).toBe("allowed");
      }, setup);
    });

    it("at most 10 points per student per day from one teacher", async () => {
      await as("teacher", async (s) => {
        expect(code(await award(s, student, 5, { reason: "One" }))).toBe("allowed");
        expect(code(await award(s, student, 4, { reason: "Two" }))).toBe("allowed");
        const over = await award(s, student, 2, { reason: "Three" });
        expect(over).toMatchObject({ ok: false, code: "EP004" });
        expect(code(await award(s, student, 1, { reason: "Last one" }))).toBe("allowed");
        expect(code(await award(s, student, 1, { reason: "Over" }))).toBe("EP004");
        // Deductions have their own allowance.
        expect(code(await award(s, student, -5, { reason: "Phone" }))).toBe("allowed");
      }, setup);
    });

    it("a deduction is reduced to the balance and never takes it below zero", async () => {
      await as("teacher", async (s) => {
        await award(s, student, 3, { reason: "Start" });
        const reduced = await award(s, student, -5, { reason: "Phone in class" });
        expect(reduced.ok && reduced.rows).toEqual([{ ledger_id: expect.any(String), applied: -3, balance: "0" }]);
        const nothing = await award(s, student, null, { preset: presets.deduction });
        expect(nothing.ok && nothing.rows).toEqual([{ ledger_id: null, applied: 0, balance: "0" }]);
      }, setup);
    });

    it("Undo posts a reversing row, once, and frees the daily allowance", async () => {
      await as("teacher", async (s) => {
        const given = await award(s, student, 5, { reason: "Mistake" });
        const id = given.ok ? (given.rows[0].ledger_id as string) : "";
        expect(await s.rows(`select public.undo_points($1) as balance`, [id])).toEqual([{ balance: "0" }]);
        expect(code(await s.attempt(`select public.undo_points($1)`, [id]))).toBe("EP006");
        // 5 given and undone: the full 10 are still available today.
        expect(code(await award(s, student, 5, { reason: "A" }))).toBe("allowed");
        expect(code(await award(s, student, 5, { reason: "B" }))).toBe("allowed");
        expect((await s.rows(`select * from public.teacher_points_history()`)).length).toBe(4);
      }, setup);
    });

    it("the programme switched off refuses awards", async () => {
      await as("teacher", async (s) => {
        expect(code(await award(s, student, 2, { reason: "x" }))).toBe("EP001");
      }, async (s) => {
        await setup(s);
        await s.rows(`update points_settings set enabled = false`);
      });
    });

    it("a teacher reads no ledger, and cannot change settings or presets", async () => {
      await as("teacher", async (s) => {
        const read = await s.attempt(`select 1 from points_ledger`);
        expect(read.ok ? read.rowCount : 0).toBe(0);
        const points = await s.attempt(`select 1 from student_points`);
        expect(points.ok ? points.rowCount : 0).toBe(0);
        expect((await s.attempt(`update points_settings set present = 100`)).ok && (await s.rows(`select present from points_settings`))).toEqual([{ present: 2 }]);
        expect((await s.attempt(`update point_presets set points = 100`)).ok && (await s.count("point_presets", "points = 100"))).toBe(0);
        expect(await s.count("point_presets")).toBe(7);
      }, setup);
    });
  });

  describe("staff", () => {
    it("the ledger is insert-only: nobody updates or deletes a row, or inserts one directly", async () => {
      await as("owner", async (s) => {
        expect(code(await s.attempt(`update points_ledger set delta = 1`))).toBe(DENIED);
        expect(code(await s.attempt(`delete from points_ledger`))).toBe(DENIED);
        expect(code(await s.attempt(`insert into points_ledger (student_id, delta, source) values ($1, 5, 'owner_adjustment')`, [lessonStudent]))).toBe(DENIED);
      });
    });

    it("the owner adjusts points with a reason, never below zero; a manager cannot", async () => {
      let student = "";
      await as("owner", async (s) => {
        expect(await s.rows(`select public.adjust_points($1, 20, 'Olympiad winner') as balance`, [student])).toEqual([{ balance: "20" }]);
        expect(code(await s.attempt(`select public.adjust_points($1, 5, ' ')`, [student]))).toBe("EP003");
        expect(await s.attempt(`select public.adjust_points($1, -21, 'Correction')`, [student])).toMatchObject({ ok: false, code: "EP007" });
        expect(await s.rows(`select balance::int, earned_this_month::int, earned_all_time::int from student_points where student_id = $1`, [student])).toEqual([
          { balance: 20, earned_this_month: 20, earned_all_time: 20 },
        ]);
        // Awarding as a teacher does is not open to staff.
        expect(code(await award(s, student, 2, { reason: "x" }))).toBe(DENIED);
      }, async (s) => {
        await s.rows(`update points_settings set enabled = true`);
        student = await newStudent(s);
      });
      await as("manager", async (s) => {
        expect(code(await s.attempt(`select public.adjust_points($1, 5, 'x')`, [lessonStudent]))).toBe(DENIED);
        expect(code(await s.attempt(`update points_settings set present = 9`))).toBe("allowed");
        expect(await s.rows(`select present from points_settings`)).toEqual([{ present: 2 }]);
      });
    });
  });
});

// ── Fixes from the review of Phases 13–18 ──
describe.skipIf(!DB_URL)("Points engine: corrections and edge cases", () => {
  beforeAll(connect);
  afterAll(disconnect);

  it("while the programme is off nothing new is given, but a cancelled lesson and a changed mark still take points back", async () => {
    await as("owner", async (s) => {
      await mark(s, "present");
      expect(await posted(s)).toEqual([2]);
      await s.rows(`update points_settings set enabled = false`);
      // Absent → nothing new; Present again → nothing new either.
      await mark(s, "absent");
      expect(await posted(s)).toEqual([2, -2]);
      await mark(s, "present");
      expect(await posted(s)).toEqual([2, -2]);
    }, cleanLesson);
    await as("owner", async (s) => {
      await mark(s, "present");
      await s.rows(`update points_settings set enabled = false`);
      await s.rows(`update lessons set status = 'cancelled', cancel_reason = 'Test' where id = $1`, [lesson]);
      expect(await posted(s)).toEqual([2, -2]);
      // Restoring the lesson while off gives nothing back.
      await s.rows(`update lessons set status = 'held', cancel_reason = null where id = $1`, [lesson]);
      expect(await posted(s)).toEqual([2, -2]);
    }, cleanLesson);
  });

  it("the daily job also settles last month's fee on time, for a due day that ends as the next month starts", async () => {
    await admin(async (s) => {
      const source = (await s.rows<{ src: string }>(`select prosrc as src from pg_proc where proname = 'points_daily'`))[0].src;
      expect(source).toMatch(/points_post_on_time\(\(this_month - interval '1 month'\)::date\)/);
      // And it still runs twice without posting anything new.
      await s.rows(`update points_settings set enabled = true, started_at = now() - interval '6 months'`);
      await s.rows(`select public.points_daily()`);
      const once = await s.count("points_ledger");
      await s.rows(`select public.points_daily()`);
      expect(await s.count("points_ledger")).toBe(once);
    });
  });

  it("a teacher sees how many lessons they taught this month, and nobody else's", async () => {
    await as("teacher", async (s) => {
      const [{ n }] = await s.rows<{ n: number }>(`select public.teacher_lessons_this_month() as n`);
      expect(n).toBeGreaterThan(0);
    }, async (s) => {
      await s.rows(`update lessons set status = 'held' where id = $1`, [lesson]);
    });
    await admin(async (s) => {
      const [{ expected }] = await s.rows<{ expected: number }>(
        `select count(*)::int as expected from lessons where teacher_id = $1 and status = 'held'
           and lesson_date >= date_trunc('month', ${today})::date and lesson_date < (date_trunc('month', ${today}) + interval '1 month')::date`,
        [TEACHER],
      );
      expect(expected).toBeGreaterThanOrEqual(0);
    });
    await as("manager", async (s) => {
      expect(await s.rows(`select public.teacher_lessons_this_month() as n`)).toEqual([{ n: 0 }]);
    });
  });
});
