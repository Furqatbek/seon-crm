/**
 * Vouchers and free open lessons — docs/STUDENT_APP_SPEC.md → "Rules →
 * Vouchers" and "Rules → Free open lessons". Same setup as permissions.test.ts;
 * every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, MANAGER_ID, OWNER_ID, TEACHER_USER_ID, as, connect, disconnect, teacherId, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);
const APP_USER = "00000000-0000-4000-8000-00000000b101";
const OTHER = "00000000-0000-4000-8000-00000000b102";
const STUDENT = "00000000-0000-4000-8000-00000000b103";
const today = "public.tashkent_today()";
const monthStart = `date_trunc('month', ${today})::date`;

async function actAs(s: Session, userId: string) {
  await s.rows(`reset role`);
  await s.rows(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
  await s.rows(`set local role authenticated`);
}
const asDb = async <T>(s: Session, fn: () => Promise<T>): Promise<T> => {
  await s.rows(`reset role`);
  try {
    return await fn();
  } finally {
    await s.rows(`set local role authenticated`);
  }
};
async function call<T>(s: Session, user: string, sql: string, params: unknown[] = []): Promise<T> {
  await actAs(s, user);
  return (await s.rows<{ r: T }>(`select ${sql} as r`, params))[0].r;
}
async function refused(s: Session, user: string, sql: string, params: unknown[] = []): Promise<string> {
  await actAs(s, user);
  return code(await s.attempt(`select ${sql}`, params));
}

let student = "";

/** Two App users (each with a lead) and one linked student. */
const people = async (s: Session) => {
  student = (await s.rows<{ id: string }>(`select s.id from students s where s.archived_at is null order by s.id limit 1`))[0].id;
  await s.rows(`update students set phone = '+998770005003' where id = $1`, [student]);
  const user = `insert into auth.users (id, aud, role, phone, phone_confirmed_at, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', $2, now(), $3)`;
  await s.rows(user, [APP_USER, "998770005001", '{"full_name":"Bekzod Aliyev","korean_level":"topik1"}']);
  await s.rows(user, [OTHER, "998770005002", '{"full_name":"Sardor Murodov","korean_level":"beginner"}']);
  await s.rows(user, [STUDENT, "998770005003", '{"full_name":"Linked Student","korean_level":"topik1"}']);
};
const voucherOf = (s: Session, profile: string) =>
  asDb(s, async () => (await s.rows<Record<string, unknown>>(`select id, code, type, value::int as value, status, lead_id, round(extract(epoch from expires_at - issued_at) / 86400)::int as days from vouchers where profile_id = $1`, [profile]))[0]);
/** A voucher of a given type for the first App user, as the database owner. */
const give = (s: Session, type: "percent" | "fixed" | "trial_week", value: number, codeText = "KOR-7F3K9") =>
  asDb(s, () =>
    s.rows(`insert into vouchers (code, profile_id, lead_id, type, value, expires_at) select $1, p.id, p.lead_id, $2, $3, now() + interval '14 days' from profiles p where p.id = $4`, [codeText, type, value, APP_USER]),
  );

/**
 * A group of 700 000 soʻm with lessons on the 1st, 5th, 9th, 13th, 17th, 21st
 * and 25th of this month and the 5th, 9th, 13th and 17th of the next.
 */
function lessonGroup(s: Session): Promise<string> {
  return asDb(s, async () => {
    const [{ id }] = await s.rows<{ id: string }>(
      `insert into groups (name, subject, teacher_id, monthly_fee, days, start_time, start_date, status)
       values ('Voucher group', 'Koreys tili', $1, 700000, '{1}', '18:00', ${monthStart}, 'active') returning id`,
      [teacherId(1)],
    );
    // Only the lessons below: whatever the timetable made for the group goes.
    await s.rows(`delete from lessons where group_id = $1`, [id]);
    await s.rows(
      `insert into lessons (group_id, teacher_id, lesson_date, start_time)
       select $1::uuid, $2::uuid, ${monthStart} + d, '18:00'::time from unnest(array[0, 4, 8, 12, 16, 20, 24]) d
       union all
       select $1::uuid, $2::uuid, (${monthStart} + interval '1 month')::date + d, '18:00'::time from unnest(array[4, 8, 12, 16]) d`,
      [id, teacherId(1)],
    );
    return id;
  });
}
const newStudent = async (s: Session) => (await s.rows<{ id: string }>(`insert into students (full_name, phone) values ('Voucher Student', '+998900000078') returning id`))[0].id;
const day = (n: number) => `(${monthStart} + ${n - 1})`;
const charges = (s: Session, who: string) =>
  s.rows<Record<string, unknown>>(
    `select amount::int as amount, is_prorated, lessons_counted, note, billing_month = ${monthStart} as this_month from charges where student_id = $1 order by billing_month`,
    [who],
  );

/** A slot on the weekday three days from now at 18:00, with 2 seats; returns its id and that day. */
async function slot(s: Session, seats = 2): Promise<{ id: string; day: string }> {
  const [row] = await s.rows<{ id: string; day: string }>(
    `insert into open_lesson_slots (title, korean_level, weekday, start_time, duration_min, room, teacher_id, seats)
     values ('Ochiq dars', 'topik1', extract(isodow from ${today} + 3)::int, '18:00', 60, '2-xona', $1, $2)
     returning id, to_char(${today} + 3, 'YYYY-MM-DD') as day`,
    [teacherId(1), seats],
  );
  return row;
}
type Lessons = { sessions: Array<{ slot_id: string; session_date: string; seats: number; seats_left: number; title: string }>; booking: null | { id: string; session_date: string; cancel_until: string } };

describe.skipIf(!DB_URL)("Vouchers and open lessons", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("the draw", () => {
    it("10 000 draws with equal weights give each type about a third", async () => {
      await as("owner", async (s) => {
        await s.rows(`reset role`);
        const rows = await s.rows<{ type: string; n: number }>(`select t as type, count(*)::int as n from (select public.draw_voucher_type() as t from generate_series(1, 10000)) d group by t`);
        expect(rows.map((row) => row.type).sort()).toEqual(["fixed", "percent", "trial_week"]);
        // A third each: 3 333, give or take 200 (over four standard deviations).
        for (const row of rows) expect(Math.abs(row.n - 3333)).toBeLessThan(200);
      });
    });

    it("weights and switches are followed: 1 to 3 with the trial off", async () => {
      await as("owner", async (s) => {
        await s.rows(`update voucher_settings set percent_weight = 1, fixed_weight = 3, trial_enabled = false`);
        await s.rows(`reset role`);
        const rows = await s.rows<{ type: string; n: number }>(`select t as type, count(*)::int as n from (select public.draw_voucher_type() as t from generate_series(1, 10000)) d group by t`);
        const count = Object.fromEntries(rows.map((row) => [row.type, row.n]));
        expect(count.trial_week).toBeUndefined();
        expect(Math.abs(count.percent - 2500)).toBeLessThan(200);
        expect(Math.abs(count.fixed - 7500)).toBeLessThan(200);
        // Nothing enabled: nothing to draw, and no voucher is issued.
        await s.rows(`update voucher_settings set percent_enabled = false, fixed_enabled = false`);
        expect((await s.rows(`select public.draw_voucher_type() as t`))[0].t).toBeNull();
      });
    });

    it("only the owner changes the settings; managers read them; nobody else does", async () => {
      await as("manager", async (s) => {
        expect((await s.rows(`select valid_days from voucher_settings`))[0].valid_days).toBe(14);
        expect(code(await s.attempt(`update voucher_settings set valid_days = 30 returning valid_days`))).toBe("allowed");
        expect((await s.rows(`select valid_days from voucher_settings`))[0].valid_days).toBe(14);
        await actAs(s, TEACHER_USER_ID);
        expect(await s.rows(`select * from voucher_settings`)).toEqual([]);
        await actAs(s, OWNER_ID);
        await s.rows(`update voucher_settings set valid_days = 30`);
        expect((await s.rows(`select valid_days from voucher_settings`))[0].valid_days).toBe(30);
        expect(code(await s.attempt(`update voucher_settings set percent_value = 0`))).toBe("23514");
      }, people);
    });
  });

  describe("issuing", () => {
    /** An exam with one question in each section, and an attempt of it that has just been finished. */
    async function finishExam(s: Session, profile: string) {
      await asDb(s, async () => {
        const [{ id }] = await s.rows<{ id: string }>(`insert into exams (title, level, status, published_at) values ('Voucher exam', 'topik1', 'published', now()) returning id`);
        const [attempt] = await s.rows<{ id: string }>(
          `insert into exam_attempts (exam_id, profile_id, current_section, section_deadlines, first_attempt) values ($1, $2, 'listening', '{}', true) returning id`,
          [id, profile],
        );
        await s.rows(`update exam_attempts set status = 'submitted', current_section = null, submitted_at = now() where id = $1`, [attempt.id]);
      });
    }

    it("an App user's first finished exam gives one voucher: a code without confusable characters, valid 14 days, on the lead's timeline", async () => {
      await as({ userId: APP_USER }, async (s) => {
        expect(await voucherOf(s, APP_USER)).toBeUndefined();
        await finishExam(s, APP_USER);
        const voucher = await voucherOf(s, APP_USER);
        expect(voucher.code).toMatch(/^KOR-[2-9A-HJ-NP-Z]{5}$/);
        expect(voucher).toMatchObject({ status: "issued", days: 14 });
        expect(voucher.lead_id).not.toBeNull();
        expect({ percent: 20, fixed: 100000, trial_week: 7 }[voucher.type as "percent"]).toBe(voucher.value);
        expect(await asDb(s, () => s.rows(`select kind, body from lead_activities where lead_id = $1 and kind = 'voucher_issued'`, [voucher.lead_id]))).toEqual([{ kind: "voucher_issued", body: voucher.code }]);

        // The person reads their own voucher, and only theirs; nobody writes one.
        await actAs(s, APP_USER);
        expect((await s.rows(`select code from vouchers`)).map((row) => row.code)).toEqual([voucher.code]);
        expect(code(await s.attempt(`update vouchers set value = 100 where id = $1`, [voucher.id]))).toBe(DENIED);
        expect(code(await s.attempt(`select public.issue_voucher($1)`, [APP_USER]))).toBe(DENIED);
        await actAs(s, OTHER);
        expect(await s.rows(`select code from vouchers`)).toEqual([]);
      }, people);
    });

    it("one voucher per person, ever: not for a second exam, not after it was used or expired, not for a new account of the same lead", async () => {
      await as({ userId: APP_USER }, async (s) => {
        await finishExam(s, APP_USER);
        const first = await voucherOf(s, APP_USER);
        await finishExam(s, APP_USER);
        await asDb(s, () => s.rows(`update vouchers set status = 'expired' where id = $1`, [first.id]));
        await finishExam(s, APP_USER);
        expect((await asDb(s, () => s.rows(`select count(*)::int as n from vouchers`)))[0].n).toBe(1);
        expect(await asDb(s, async () => (await s.rows(`select public.issue_voucher($1) as id`, [APP_USER]))[0].id)).toBeNull();
        // The account is deleted and the person signs up again: the voucher stays with the lead.
        await asDb(s, () => s.rows(`update profiles set lead_id = $1 where id = $2`, [first.lead_id, OTHER]));
        await asDb(s, () => s.rows(`update vouchers set profile_id = null where id = $1`, [first.id]));
        await finishExam(s, OTHER);
        expect(await voucherOf(s, OTHER)).toBeUndefined();
      }, people);
    });

    it("a linked student gets none; with every type switched off nobody does", async () => {
      await as({ userId: APP_USER }, async (s) => {
        await finishExam(s, STUDENT);
        expect(await voucherOf(s, STUDENT)).toBeUndefined();
        await asDb(s, () => s.rows(`update voucher_settings set percent_enabled = false, fixed_enabled = false, trial_enabled = false`));
        await finishExam(s, APP_USER);
        expect(await voucherOf(s, APP_USER)).toBeUndefined();
      }, people);
    });

    it("the values and the validity come from the settings", async () => {
      await as({ userId: APP_USER }, async (s) => {
        await asDb(s, () => s.rows(`update voucher_settings set percent_value = 30, fixed_enabled = false, trial_enabled = false, valid_days = 10`));
        await finishExam(s, APP_USER);
        expect(await voucherOf(s, APP_USER)).toMatchObject({ type: "percent", value: 30, days: 10 });
      }, people);
    });

    it("the hourly job expires vouchers past their date", async () => {
      await as({ userId: APP_USER }, async (s) => {
        await give(s, "percent", 20);
        expect(await asDb(s, async () => (await s.rows(`select public.expire_vouchers() as n`))[0].n)).toBe(0);
        await asDb(s, () => s.rows(`update vouchers set issued_at = now() - interval '15 days', expires_at = now() - interval '1 day'`));
        expect(await asDb(s, async () => (await s.rows(`select public.expire_vouchers() as n`))[0].n)).toBe(1);
        expect(await voucherOf(s, APP_USER)).toMatchObject({ status: "expired" });
        expect(await refused(s, APP_USER, `public.expire_vouchers()`)).toBe(DENIED);
      }, people);
    });
  });

  describe("the enrol sheet", () => {
    it("a percent voucher takes its share off the first charge after proration", async () => {
      await as("manager", async (s) => {
        const group = await lessonGroup(s);
        const who = await newStudent(s);
        await give(s, "percent", 20);
        // Joined on the 10th: 4 of the month's 7 lessons, 400 000 of 700 000.
        const [offer] = await s.rows<Record<string, unknown>>(
          `select code, type, problem, before_voucher::int as before, voucher_discount::int as discount, amount::int as amount, is_prorated, lessons_counted from public.propose_voucher_charge($1, ${day(10)}, null, null, ' kor-7f3k9 ')`,
          [group],
        );
        expect(offer).toEqual({ code: "KOR-7F3K9", type: "percent", problem: null, before: 400_000, discount: 80_000, amount: 320_000, is_prorated: true, lessons_counted: 4 });
        await s.rows(`select public.enrol_student($1, $2, ${day(10)}, null, null, null, 'prorated', null, null, 'kor-7f3k9')`, [who, group]);
        expect(await charges(s, who)).toEqual([{ amount: 320_000, is_prorated: true, lessons_counted: 4, note: "Voucher KOR-7F3K9", this_month: true }]);
        // Used, by this manager, for this enrolment, and on the lead's timeline.
        const [used] = await s.rows<Record<string, unknown>>(`select v.status, v.redeemed_by, e.student_id from vouchers v join enrollments e on e.id = v.enrollment_id where v.code = 'KOR-7F3K9'`);
        expect(used).toEqual({ status: "redeemed", redeemed_by: MANAGER_ID, student_id: who });
        expect((await s.rows(`select count(*)::int as n from lead_activities where kind = 'voucher_redeemed' and body = 'KOR-7F3K9'`))[0].n).toBe(1);
      }, people);
    });

    it("with the enrolment's own discount, the voucher comes after it; on the full month it is taken off the full fee", async () => {
      await as("owner", async (s) => {
        const group = await lessonGroup(s);
        await give(s, "percent", 20);
        // 10% off 700 000 is 630 000; 4 of 7 lessons is 360 000; the voucher takes 72 000.
        const read = async (mode: string, kind: string | null, value: number | null) =>
          (await s.rows<Record<string, unknown>>(`select before_voucher::int as before, voucher_discount::int as discount, amount::int as amount from public.propose_voucher_charge($1, ${day(10)}, $2, $3, 'KOR-7F3K9', $4)`, [group, kind, value, mode]))[0];
        expect(await read("prorated", "percent", 10)).toEqual({ before: 360_000, discount: 72_000, amount: 288_000 });
        expect(await read("full", null, null)).toEqual({ before: 700_000, discount: 140_000, amount: 560_000 });
      }, people);
    });

    it("a fixed voucher takes its soʻm off, and never takes the charge below 0", async () => {
      await as("owner", async (s) => {
        const group = await lessonGroup(s);
        const who = await newStudent(s);
        await give(s, "fixed", 100_000);
        const amount = async (joined: string) => (await s.rows<{ discount: number; amount: number }>(`select voucher_discount::int as discount, amount::int as amount from public.propose_voucher_charge($1, ${joined}, null, null, 'KOR-7F3K9')`, [group]))[0];
        expect(await amount(day(10))).toEqual({ discount: 100_000, amount: 300_000 });
        // Joined on the 22nd: one lesson left, 100 000. The voucher covers it exactly.
        expect(await amount(day(22))).toEqual({ discount: 100_000, amount: 0 });
        await asDb(s, () => s.rows(`update vouchers set value = 500000`));
        expect(await amount(day(22))).toEqual({ discount: 100_000, amount: 0 });
        await s.rows(`select public.enrol_student($1, $2, ${day(22)}, null, null, null, 'prorated', null, null, 'KOR-7F3K9')`, [who, group]);
        expect(await charges(s, who)).toEqual([{ amount: 0, is_prorated: true, lessons_counted: 1, note: "Voucher KOR-7F3K9", this_month: true }]);
        expect(await s.rows(`select public.voucher_discount(0, 'fixed', 100000)::int as zero, public.voucher_discount(333000, 'percent', 20)::int as rounded, public.voucher_discount(50000, 'percent', 100)::int as whole`)).toEqual([{ zero: 0, rounded: 67_000, whole: 50_000 }]);
      }, people);
    });

    it("the free trial week: seven days without charge, then the monthly fee starts", async () => {
      await as("owner", async (s) => {
        const group = await lessonGroup(s);
        const who = await newStudent(s);
        await give(s, "trial_week", 7);
        // Joined on the 10th, paid from the 17th: the lessons of the 17th, 21st and 25th.
        const [offer] = await s.rows<Record<string, unknown>>(
          `select before_voucher::int as before, voucher_discount::int as discount, amount::int as amount, lessons_counted, paid_from = ${day(17)} as from_17th, next_month, next_amount from public.propose_voucher_charge($1, ${day(10)}, null, null, 'KOR-7F3K9')`,
          [group],
        );
        expect(offer).toEqual({ before: 400_000, discount: 100_000, amount: 300_000, lessons_counted: 3, from_17th: true, next_month: null, next_amount: null });
        await s.rows(`select public.enrol_student($1, $2, ${day(10)}, null, null, null, 'prorated', null, null, 'KOR-7F3K9')`, [who, group]);
        expect(await charges(s, who)).toEqual([{ amount: 300_000, is_prorated: true, lessons_counted: 3, note: "Voucher KOR-7F3K9", this_month: true }]);
        // The enrolment itself starts on the day joined: the week is free, not absent.
        expect((await s.rows(`select joined_on = ${day(10)} as tenth from enrollments where student_id = $1`, [who]))[0].tenth).toBe(true);
      }, people);
    });

    it("a trial week that runs into the next month: this month costs nothing, the next starts on the first paid day", async () => {
      await as("owner", async (s) => {
        const group = await lessonGroup(s);
        const who = await newStudent(s);
        await give(s, "trial_week", 7);
        // Joined on the 25th: the week ends in the first days of next month, before its first lesson on the 5th.
        await s.rows(`select public.enrol_student($1, $2, ${day(25)}, null, null, null, 'prorated', null, null, 'KOR-7F3K9')`, [who, group]);
        expect(await charges(s, who)).toEqual([
          { amount: 0, is_prorated: true, lessons_counted: 0, note: "Voucher KOR-7F3K9", this_month: true },
          { amount: 700_000, is_prorated: true, lessons_counted: 4, note: "Voucher KOR-7F3K9", this_month: false },
        ]);
        // The monthly run cannot bill that month again: one monthly fee per enrolment and month.
        await s.rows(`reset role`);
        expect(
          code(
            await s.attempt(
              `insert into charges (student_id, enrollment_id, group_id, billing_month, type, base_amount, amount)
               select student_id, id, group_id, (${monthStart} + interval '1 month')::date, 'monthly_fee', 700000, 700000 from enrollments where student_id = $1`,
              [who],
            ),
          ),
        ).toBe("23505");
      }, people);
    });

    it("a manager, too, enrols with a trial week that runs into the next month, and still writes no other fee for it", async () => {
      await as("manager", async (s) => {
        const group = await lessonGroup(s);
        const who = await newStudent(s);
        await give(s, "trial_week", 7);
        await s.rows(`select public.enrol_student($1, $2, ${day(25)}, null, null, null, 'prorated', null, null, 'KOR-7F3K9')`, [who, group]);
        expect((await charges(s, who)).map((row) => row.amount)).toEqual([0, 700_000]);
        // Another student of the group, joined mid-month: no fee for the next month from a manager.
        const other = (await s.rows<{ id: string }>(`insert into students (full_name, phone) values ('Second Student', '+998900000078') returning id`))[0].id;
        await s.rows(`select public.enrol_student($1, $2, ${day(10)}, null, null, null, 'prorated', null, null, null)`, [other, group]);
        expect(
          code(
            await s.attempt(
              `insert into charges (student_id, enrollment_id, group_id, billing_month, type, base_amount, amount, is_prorated, created_by)
               select student_id, id, group_id, (${monthStart} + interval '1 month')::date, 'monthly_fee', 700000, 1, true, auth.uid() from enrollments where student_id = $1`,
              [other],
            ),
          ),
        ).toBe(DENIED);
      }, people);
    });

    it("each code works once; unknown and expired codes, and a custom amount, are refused with nothing saved", async () => {
      await as("manager", async (s) => {
        const group = await lessonGroup(s);
        const who = await newStudent(s);
        const other = (await s.rows<{ id: string }>(`insert into students (full_name, phone) values ('Second Student', '+998900000079') returning id`))[0].id;
        await give(s, "percent", 20);
        const enrol = (target: string, text: string, mode = "prorated") =>
          s.attempt(`select public.enrol_student($1, $2, ${day(10)}, null, null, null, $4, $5, $6, $3)`, [target, group, text, mode, mode === "custom" ? 100000 : null, mode === "custom" ? "Kelishilgan" : null]);
        expect(code(await enrol(who, "KOR-22222"))).toBe("EV001");
        expect(code(await enrol(who, "KOR-7F3K9", "custom"))).toBe("EV004");
        expect((await s.rows(`select count(*)::int as n from enrollments where student_id = $1`, [who]))[0].n).toBe(0);
        expect(code(await enrol(who, "KOR-7F3K9"))).toBe("allowed");
        expect(code(await enrol(other, "KOR-7F3K9"))).toBe("EV002");
        expect((await s.rows(`select problem from public.propose_voucher_charge($1, ${day(10)}, null, null, 'KOR-7F3K9')`, [group]))[0].problem).toBe("redeemed");
        expect((await s.rows(`select count(*)::int as n from enrollments where student_id = $1`, [other]))[0].n).toBe(0);

        await asDb(s, () => s.rows(`update vouchers set status = 'issued', redeemed_at = null, redeemed_by = null, enrollment_id = null, expires_at = now() - interval '1 minute'`));
        expect(code(await enrol(other, "KOR-7F3K9"))).toBe("EV003");
        expect((await s.rows(`select problem from public.propose_voucher_charge($1, ${day(10)}, null, null, 'KOR-7F3K9')`, [group]))[0].problem).toBe("expired");
        // Without a code enrolment is as it always was.
        expect(code(await s.attempt(`select public.enrol_student($1, $2, ${day(10)})`, [other, group]))).toBe("allowed");
        expect(await charges(s, other)).toEqual([{ amount: 400_000, is_prorated: true, lessons_counted: 4, note: null, this_month: true }]);
      }, people);
    });

    it("teachers and app accounts cannot look a code up or use one", async () => {
      await as("manager", async (s) => {
        await give(s, "percent", 20);
        const group = await lessonGroup(s);
        for (const who of [TEACHER_USER_ID, APP_USER, STUDENT]) {
          expect(await refused(s, who, `public.propose_voucher_charge($1, ${day(10)}, null, null, 'KOR-7F3K9')`, [group])).toBe(DENIED);
          expect(await refused(s, who, `public.redeem_voucher('KOR-7F3K9', gen_random_uuid())`)).toBe(DENIED);
        }
        await actAs(s, TEACHER_USER_ID);
        expect(await s.rows(`select code from vouchers`)).toEqual([]);
      }, people);
    });

    it("the report counts vouchers by type: issued, used and expired", async () => {
      await as("manager", async (s) => {
        const group = await lessonGroup(s);
        const who = await newStudent(s);
        await give(s, "percent", 20);
        await asDb(s, () => s.rows(`insert into vouchers (code, type, value, expires_at, issued_at) values ('KOR-22222', 'percent', 20, now() - interval '1 day', now() - interval '15 days'), ('KOR-33333', 'trial_week', 7, now() + interval '5 days', now())`));
        await s.rows(`select public.enrol_student($1, $2, ${day(10)}, null, null, null, 'prorated', null, null, 'KOR-7F3K9')`, [who, group]);
        const rows = await s.rows(`select type, issued, redeemed, expired from public.voucher_report(${today} - 30, ${today})`);
        expect(rows).toEqual([
          { type: "percent", issued: 2, redeemed: 1, expired: 1 },
          { type: "fixed", issued: 0, redeemed: 0, expired: 0 },
          { type: "trial_week", issued: 1, redeemed: 0, expired: 0 },
        ]);
        expect(await refused(s, TEACHER_USER_ID, `public.voucher_report(${today} - 30, ${today})`)).toBe(DENIED);
      }, people);
    });
  });

  describe("open lessons", () => {
    const lessons = (s: Session, who: string) => call<Lessons>(s, who, `public.open_lessons()`);

    it("the app shows the sessions of the next four weeks with the seats left", async () => {
      await as({ userId: APP_USER }, async (s) => {
        const made = await asDb(s, () => slot(s));
        await asDb(s, () => s.rows(`insert into open_lesson_slots (title, weekday, start_time, seats, is_active) values ('Yopiq', 1, '10:00', 5, false)`));
        const view = await lessons(s, APP_USER);
        // The same weekday, four times, the first in three days.
        expect(view.sessions.map((session) => session.title)).toEqual(["Ochiq dars", "Ochiq dars", "Ochiq dars", "Ochiq dars"]);
        expect(view.sessions[0]).toMatchObject({ slot_id: made.id, session_date: made.day, seats: 2, seats_left: 2 });
        expect(view.booking).toBeNull();
        // Students and staff are not offered open lessons.
        expect(await refused(s, STUDENT, `public.open_lessons()`)).toBe(DENIED);
        expect(await refused(s, MANAGER_ID, `public.open_lessons()`)).toBe(DENIED);
      }, people);
    });

    it("booking takes a seat, moves the lead to Trial with the date and writes the timeline", async () => {
      await as({ userId: APP_USER }, async (s) => {
        const made = await asDb(s, () => slot(s));
        const booking = await call<string>(s, APP_USER, `public.book_open_lesson($1, $2)`, [made.id, made.day]);
        const view = await lessons(s, APP_USER);
        expect(view.booking).toMatchObject({ id: booking, session_date: made.day });
        expect(view.sessions[0].seats_left).toBe(1);
        const [lead] = await asDb(s, () =>
          s.rows(`select d.status, to_char(d.trial_date, 'YYYY-MM-DD') as day, d.trial_open_lesson_slot_id as slot, d.trial_group_id as grp from leads d join profiles p on p.lead_id = d.id where p.id = $1`, [APP_USER]),
        );
        expect(lead).toEqual({ status: "trial", day: made.day, slot: made.id, grp: null });
        const kinds = await asDb(s, () => s.rows(`select a.kind, a.body from lead_activities a join profiles p on p.lead_id = a.lead_id where p.id = $1 and a.kind in ('status_change', 'open_lesson_booked') order by a.kind`, [APP_USER]));
        expect(kinds).toEqual([{ kind: "open_lesson_booked", body: `Ochiq dars · ${made.day} 18:00` }, { kind: "status_change", body: null }]);
        // The person reads their own booking; they cannot write one directly.
        await actAs(s, APP_USER);
        expect((await s.rows(`select status from open_lesson_bookings`)).map((row) => row.status)).toEqual(["booked"]);
        expect(code(await s.attempt(`insert into open_lesson_bookings (slot_id, session_date, profile_id) values ($1, $2, $3)`, [made.id, made.day, APP_USER]))).toBe(DENIED);
        expect(code(await s.attempt(`update open_lesson_bookings set status = 'came'`))).toBe(DENIED);
        await actAs(s, OTHER);
        expect(await s.rows(`select status from open_lesson_bookings`)).toEqual([]);
      }, people);
    });

    it("one active booking per person: a second is refused until the first is cancelled", async () => {
      await as({ userId: APP_USER }, async (s) => {
        const made = await asDb(s, () => slot(s));
        const later = (await asDb(s, () => s.rows<{ day: string }>(`select to_char(${today} + 10, 'YYYY-MM-DD') as day`)))[0].day;
        const first = await call<string>(s, APP_USER, `public.book_open_lesson($1, $2)`, [made.id, made.day]);
        expect(await refused(s, APP_USER, `public.book_open_lesson($1, $2)`, [made.id, later])).toBe("EO003");
        expect(await refused(s, APP_USER, `public.book_open_lesson($1, $2)`, [made.id, made.day])).toBe("EO003");
        await call(s, APP_USER, `public.cancel_open_lesson_booking($1)`, [first]);
        // Cancelled: the seat is free again, the lead is back from Trial, and another day can be booked.
        expect((await lessons(s, APP_USER)).sessions[0].seats_left).toBe(2);
        expect((await asDb(s, () => s.rows(`select d.status, d.trial_date from leads d join profiles p on p.lead_id = d.id where p.id = $1`, [APP_USER])))[0]).toEqual({ status: "contacted", trial_date: null });
        await call<string>(s, APP_USER, `public.book_open_lesson($1, $2)`, [made.id, later]);
        expect((await lessons(s, APP_USER)).booking?.session_date).toBe(later);
        // The same session again after cancelling it: the one row is booked again.
        await call(s, APP_USER, `public.cancel_open_lesson_booking($1)`, [(await lessons(s, APP_USER)).booking!.id]);
        expect(await call<string>(s, APP_USER, `public.book_open_lesson($1, $2)`, [made.id, made.day])).toBe(first);
      }, people);
    });

    it("a full session takes nobody else; a day that is not the slot's, a past day and a day beyond four weeks are refused", async () => {
      await as({ userId: APP_USER }, async (s) => {
        const made = await asDb(s, () => slot(s, 1));
        await call<string>(s, OTHER, `public.book_open_lesson($1, $2)`, [made.id, made.day]);
        expect((await lessons(s, APP_USER)).sessions[0].seats_left).toBe(0);
        expect(await refused(s, APP_USER, `public.book_open_lesson($1, $2)`, [made.id, made.day])).toBe("EO002");
        const days = (await asDb(s, () => s.rows<{ wrong: string; past: string; far: string }>(`select to_char(${today} + 4, 'YYYY-MM-DD') as wrong, to_char(${today} - 4, 'YYYY-MM-DD') as past, to_char(${today} + 31, 'YYYY-MM-DD') as far`)))[0];
        for (const bad of [days.wrong, days.past, days.far]) expect(await refused(s, APP_USER, `public.book_open_lesson($1, $2)`, [made.id, bad])).toBe("EO001");
        expect(await refused(s, APP_USER, `public.book_open_lesson(gen_random_uuid(), $1)`, [made.day])).toBe("EO001");
        expect(await refused(s, STUDENT, `public.book_open_lesson($1, $2)`, [made.id, made.day])).toBe(DENIED);
      }, people);
    });

    it("cancelling closes two hours before the start", async () => {
      await as({ userId: APP_USER }, async (s) => {
        const made = await asDb(s, () => slot(s));
        const booking = await call<string>(s, APP_USER, `public.book_open_lesson($1, $2)`, [made.id, made.day]);
        const startsIn = (interval: string) =>
          asDb(s, async () => {
            // The session is moved so that it starts this long from now, in Tashkent's own time.
            await s.rows(
              `with t as (select (now() + $1::interval) at time zone 'Asia/Tashkent' as at)
               update open_lesson_slots set weekday = extract(isodow from (select at from t))::int, start_time = (select at from t)::time where id = $2`,
              [interval, made.id],
            );
            await s.rows(`update open_lesson_bookings set session_date = ((now() + $1::interval) at time zone 'Asia/Tashkent')::date where id = $2`, [interval, booking]);
          });
        await startsIn("1 hour 59 minutes");
        expect(await refused(s, APP_USER, `public.cancel_open_lesson_booking($1)`, [booking])).toBe("EO004");
        expect(await refused(s, OTHER, `public.cancel_open_lesson_booking($1)`, [booking])).toBe("P0002");
        await startsIn("2 hours 1 minute");
        const view = await lessons(s, APP_USER);
        expect(Date.parse(view.booking!.cancel_until)).toBeGreaterThan(Date.now());
        await call(s, APP_USER, `public.cancel_open_lesson_booking($1)`, [booking]);
        expect((await lessons(s, APP_USER)).booking).toBeNull();
        expect(await refused(s, APP_USER, `public.cancel_open_lesson_booking($1)`, [booking])).toBe("P0002");
      }, people);
    });

    it("the owner and managers mark Came or No-show; the slot's teacher only sees the list", async () => {
      await as({ userId: APP_USER }, async (s) => {
        const made = await asDb(s, () => slot(s));
        const booking = await call<string>(s, APP_USER, `public.book_open_lesson($1, $2)`, [made.id, made.day]);
        await asDb(s, () => s.rows(`update profiles set teacher_id = $1 where id = $2`, [teacherId(1), TEACHER_USER_ID]));
        await actAs(s, TEACHER_USER_ID);
        expect((await s.rows(`select title from open_lesson_slots`)).map((row) => row.title)).toEqual(["Ochiq dars"]);
        expect((await s.rows(`select status from open_lesson_bookings`)).map((row) => row.status)).toEqual(["booked"]);
        expect(code(await s.attempt(`select public.mark_open_lesson($1, 'came')`, [booking]))).toBe(DENIED);
        expect(code(await s.attempt(`update open_lesson_slots set seats = 9 returning id`))).toBe("allowed");
        expect((await s.rows(`select seats from open_lesson_slots`))[0].seats).toBe(2);
        // Another teacher's slot is not theirs to see.
        await asDb(s, () => s.rows(`update open_lesson_slots set teacher_id = $1`, [teacherId(2)]));
        expect(await s.rows(`select title from open_lesson_slots`)).toEqual([]);
        expect(await s.rows(`select status from open_lesson_bookings`)).toEqual([]);

        await call(s, MANAGER_ID, `public.mark_open_lesson($1, 'came')`, [booking]);
        await call(s, OWNER_ID, `public.mark_open_lesson($1, 'no_show')`, [booking]);
        const [row] = await asDb(s, () => s.rows(`select status, marked_by from open_lesson_bookings where id = $1`, [booking]));
        expect(row).toEqual({ status: "no_show", marked_by: OWNER_ID });
        expect((await asDb(s, () => s.rows(`select kind from lead_activities where kind like 'open_lesson_%' order by created_at, kind`))).map((r) => r.kind)).toEqual(expect.arrayContaining(["open_lesson_booked", "open_lesson_came", "open_lesson_no_show"]));
        expect(await refused(s, MANAGER_ID, `public.mark_open_lesson($1, 'cancelled')`, [booking])).toBe("22023");
        // Managers set slots; archiving one is the owner's.
        await actAs(s, MANAGER_ID);
        expect(code(await s.attempt(`update open_lesson_slots set seats = 12, is_active = false where id = $1`, [made.id]))).toBe("allowed");
        expect(code(await s.attempt(`update open_lesson_slots set archived_at = now() where id = $1`, [made.id]))).toBe(DENIED);
        expect(code(await s.attempt(`delete from open_lesson_slots where id = $1`, [made.id]))).toBe(DENIED);
        await actAs(s, OWNER_ID);
        expect(code(await s.attempt(`update open_lesson_slots set archived_at = now() where id = $1`, [made.id]))).toBe("allowed");
      }, people);
    });

    it("the whole journey: an App user finishes an exam, gets a voucher, books a lesson; staff enrol them with the code and the account links itself", async () => {
      await as("manager", async (s) => {
        const made = await asDb(s, () => slot(s));
        const group = await lessonGroup(s);
        // The first finished exam brings the voucher.
        await asDb(s, async () => {
          const [{ id }] = await s.rows<{ id: string }>(`insert into exams (title, level, status, published_at) values ('Journey exam', 'topik1', 'published', now()) returning id`);
          const [attempt] = await s.rows<{ id: string }>(`insert into exam_attempts (exam_id, profile_id, current_section, section_deadlines, first_attempt) values ($1, $2, 'listening', '{}', true) returning id`, [id, APP_USER]);
          await s.rows(`insert into locked_coins (profile_id, amount, exam_attempt_id) values ($1, 12, $2)`, [APP_USER, attempt.id]);
          await s.rows(`update exam_attempts set status = 'submitted', current_section = null, submitted_at = now() where id = $1`, [attempt.id]);
        });
        const voucher = await voucherOf(s, APP_USER);
        expect(voucher.status).toBe("issued");
        const booking = await call<string>(s, APP_USER, `public.book_open_lesson($1, $2)`, [made.id, made.day]);

        // Reception: the person came, the lead becomes a student with the same phone, and is enrolled with the code.
        await actAs(s, MANAGER_ID);
        await s.rows(`select public.mark_open_lesson($1, 'came')`, [booking]);
        const [{ student: created }] = await s.rows<{ student: string }>(`select public.convert_lead_to_student($1, 'Bekzod Aliyev', '+998770005001') as student`, [voucher.lead_id]);
        await s.rows(`select public.enrol_student($1, $2, ${day(10)}, null, null, null, 'prorated', null, null, $3)`, [created, group, voucher.code]);

        // The account linked itself by the phone: a student now, with the locked coins in the ledger.
        const [account] = await asDb(s, () => s.rows(`select role, student_id from profiles where id = $1`, [APP_USER]));
        expect(account).toEqual({ role: "student", student_id: created });
        expect((await asDb(s, () => s.rows(`select coalesce(sum(delta), 0)::int as coins from points_ledger where student_id = $1 and source = 'exam'`, [created])))[0].coins).toBe(12);
        expect((await asDb(s, () => s.rows(`select status from leads where id = $1`, [voucher.lead_id])))[0].status).toBe("won");
        expect(await voucherOf(s, APP_USER)).toMatchObject({ status: "redeemed" });
        expect(await charges(s, created)).toHaveLength(1);
        // As a student they are no longer offered open lessons, and the code cannot be used again.
        expect(await refused(s, APP_USER, `public.open_lessons()`)).toBe(DENIED);
        await actAs(s, MANAGER_ID);
        expect((await s.rows(`select problem from public.propose_voucher_charge($1, ${day(10)}, null, null, $2)`, [group, voucher.code]))[0].problem).toBe("redeemed");
      }, people);
    });

    it("deleting the account takes its bookings and leaves the voucher with the lead", async () => {
      await as({ userId: APP_USER }, async (s) => {
        const made = await asDb(s, () => slot(s));
        await give(s, "fixed", 100_000);
        await call<string>(s, APP_USER, `public.book_open_lesson($1, $2)`, [made.id, made.day]);
        await call(s, APP_USER, `public.delete_my_account()`);
        expect((await asDb(s, () => s.rows(`select count(*)::int as n from open_lesson_bookings`)))[0].n).toBe(0);
        expect((await asDb(s, () => s.rows(`select profile_id, lead_id is not null as has_lead, status from vouchers where code = 'KOR-7F3K9'`)))[0]).toEqual({ profile_id: null, has_lead: true, status: "issued" });
      }, people);
    });
  });
});
