/**
 * Student app groundwork — docs/STUDENT_APP_SPEC.md → "Account lifecycle",
 * "Users, roles and access", "Rules → Coins". Sign-up by phone, linking to a
 * student or becoming a lead, and what Student, App user and Kiosk can reach.
 * Same setup as permissions.test.ts; every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, admin, as, connect, disconnect, studentId, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? `allowed (${result.rowCount})` : result.code);

// Fixed ids for the accounts the tests make, so `as()` can sign in as them.
const APP_USER = "0000000a-0000-4000-8000-000000000001";
const STUDENT_USER = "0000000a-0000-4000-8000-000000000002";
const KIOSK = "0000000a-0000-4000-8000-000000000003";
const OTHER_USER = "0000000a-0000-4000-8000-000000000004";

// Phones nobody in the seed has.
const FREE = "+998770000001";
const FREE_2 = "+998770000002";

/** Supabase Auth keeps a phone as digits. */
const digits = (phone: string) => phone.slice(1);

/** A phone sign-up, as Supabase Auth writes it; `confirmed` = the SMS code was entered. */
async function signUp(s: Session, phone: string, options: { id?: string; confirmed?: boolean; name?: string; level?: string } = {}): Promise<string> {
  const rows = await s.rows<{ id: string }>(
    `insert into auth.users (id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at)
     values (coalesce($1::uuid, gen_random_uuid()), 'authenticated', 'authenticated', $2, case when $3 then now() end,
             '{"provider":"phone"}', jsonb_build_object('full_name', $4::text, 'korean_level', $5::text), now())
     returning id`,
    [options.id ?? null, digits(phone), options.confirmed ?? true, options.name ?? "Test Person", options.level ?? "topik1"],
  );
  return rows[0].id;
}

const profile = async (s: Session, id: string) =>
  // Without the staff-only columns, so a signed-in owner can ask too.
  (await s.rows<{ role: string; is_active: boolean; student_id: string | null; lead_id: string | null; phone: string | null; korean_level: string | null; linked_at: string | null }>(
    `select role, is_active, student_id, lead_id, phone, korean_level, linked_at from profiles where id = $1`, [id]))[0];

const newStudent = async (s: Session, phone: string, parentPhone: string | null = null, name = "New Student") =>
  (await s.rows<{ id: string }>(`insert into students (full_name, phone, parent_phone) values ($1, $2, $3) returning id`, [name, phone, parentPhone]))[0].id;

let seedStudent: { id: string; phone: string; parent_phone: string };
let seedGroup: string;
let otherStudent: string;

describe.skipIf(!DB_URL)("Student app groundwork", () => {
  beforeAll(async () => {
    await connect();
    await admin(async (s) => {
      seedStudent = (await s.rows<typeof seedStudent>(`select id, phone, parent_phone from students where id = $1`, [studentId(1)]))[0];
      seedGroup = (await s.rows<{ group_id: string }>(`select group_id from enrollments where student_id = $1 and status = 'active'`, [studentId(1)]))[0].group_id;
      otherStudent = (
        await s.rows<{ student_id: string }>(
          `select e.student_id from enrollments e where e.status = 'active' and e.group_id <> $1
             and not exists (select 1 from enrollments x where x.student_id = e.student_id and x.group_id = $1)
           order by e.student_id limit 1`,
          [seedGroup],
        )
      )[0].student_id;
    });
  });
  afterAll(disconnect);

  describe("link_or_lead", () => {
    it("links to the student who has the phone as their own", async () => {
      await admin(async (s) => {
        const id = await signUp(s, seedStudent.phone);
        const p = await profile(s, id);
        expect(p).toMatchObject({ role: "student", is_active: true, student_id: seedStudent.id, lead_id: null, phone: seedStudent.phone, korean_level: "topik1" });
        expect(p.linked_at).not.toBeNull();
        expect(await s.count("leads", `phone = '${seedStudent.phone}' and source = 'mobile_app'`)).toBe(0);
      });
    });

    it("links by the parent's phone when exactly one student has it", async () => {
      await admin(async (s) => {
        const id = await signUp(s, seedStudent.parent_phone);
        expect(await profile(s, id)).toMatchObject({ role: "student", student_id: seedStudent.id });
      });
    });

    it("prefers the student's own phone to another student's parent phone", async () => {
      await admin(async (s) => {
        const own = await newStudent(s, FREE);
        await newStudent(s, FREE_2, FREE, "Child of the first");
        const id = await signUp(s, FREE);
        expect((await profile(s, id)).student_id).toBe(own);
      });
    });

    it("never links two students sharing a phone: the person becomes a lead for staff to link by hand", async () => {
      await admin(async (s) => {
        await newStudent(s, FREE, null, "Twin One");
        await newStudent(s, FREE, null, "Twin Two");
        const id = await signUp(s, FREE, { name: "Twin One" });
        const p = await profile(s, id);
        expect(p).toMatchObject({ role: "app_user", student_id: null });
        const lead = (await s.rows<{ source: string; tags: string[]; status: string; inbox: boolean }>(
          `select source, tags, status, inbox_since is not null as inbox from leads where id = $1`, [p.lead_id]))[0];
        expect(lead).toEqual({ source: "mobile_app", tags: ["existing_student"], status: "new", inbox: true });
      });
    });

    it("does not link when two students share the phone as their parent's", async () => {
      await admin(async (s) => {
        await newStudent(s, FREE_2, FREE, "Sibling One");
        await newStudent(s, "+998770000003", FREE, "Sibling Two");
        const id = await signUp(s, FREE);
        expect(await profile(s, id)).toMatchObject({ role: "app_user", student_id: null });
      });
    });

    it("does not take a student who already has an account", async () => {
      await admin(async (s) => {
        await signUp(s, seedStudent.phone);
        const second = await signUp(s, seedStudent.parent_phone);
        // The own phone decides; the parent's phone is only tried when nobody has it as their own.
        expect(await profile(s, second)).toMatchObject({ role: "app_user", student_id: null });
      });
    });

    it("an unknown phone becomes an app user and a new lead with source Mobile app, in the inbox", async () => {
      await admin(async (s) => {
        const id = await signUp(s, FREE, { name: "Aziza Karimova", level: "beginner" });
        const p = await profile(s, id);
        expect(p).toMatchObject({ role: "app_user", is_active: true, student_id: null, korean_level: "beginner" });
        const lead = (await s.rows(`select full_name, phone, source, status from leads where id = $1`, [p.lead_id]))[0];
        expect(lead).toEqual({ full_name: "Aziza Karimova", phone: FREE, source: "mobile_app", status: "new" });
        expect((await s.rows(`select id from lead_inbox() where id = $1`, [p.lead_id])).length).toBe(1);
      });
    });

    it("joins an existing open lead instead of making a new one", async () => {
      await admin(async (s) => {
        const lead = (await s.rows<{ id: string }>(
          `insert into leads (full_name, phone, source, status) values ('Earlier Lead', $1, 'instagram', 'contacted') returning id`, [FREE]))[0].id;
        const id = await signUp(s, FREE);
        expect((await profile(s, id)).lead_id).toBe(lead);
        expect(await s.count("leads", `phone = '${FREE}'`)).toBe(1);
        expect(await s.rows(`select kind from lead_activities where lead_id = $1`, [lead])).toEqual([{ kind: "app_signup" }]);
        // Still with whoever was working on it.
        expect((await s.rows(`select status from leads where id = $1`, [lead]))[0]).toEqual({ status: "contacted" });
      });
    });

    it("a closed lead is not reused", async () => {
      await admin(async (s) => {
        const lost = (await s.rows<{ id: string }>(
          `insert into leads (full_name, phone, source, status, lost_reason) values ('Lost Lead', $1, 'instagram', 'lost', 'price') returning id`, [FREE]))[0].id;
        const id = await signUp(s, FREE);
        expect((await profile(s, id)).lead_id).not.toBe(lost);
        expect(await s.count("leads", `phone = '${FREE}'`)).toBe(2);
      });
    });

    it("waits for the SMS code: no profile access and no lead until the phone is confirmed", async () => {
      await admin(async (s) => {
        const id = await signUp(s, FREE, { confirmed: false });
        expect(await profile(s, id)).toMatchObject({ role: "app_user", is_active: false, lead_id: null });
        expect(await s.count("leads", `phone = '${FREE}'`)).toBe(0);
        await s.rows(`update auth.users set phone_confirmed_at = now() where id = $1`, [id]);
        const p = await profile(s, id);
        expect(p).toMatchObject({ role: "app_user", is_active: true });
        expect(p.lead_id).not.toBeNull();
      });
    });

    it("refuses a phone that is not Uzbek", async () => {
      await admin(async (s) => {
        const result = await s.attempt(`insert into auth.users (phone, phone_confirmed_at) values ('15551234567', now())`);
        expect(code(result)).toBe("22023");
      });
    });

    it("a student created later links the waiting account and moves its locked coins exactly once", async () => {
      await admin(async (s) => {
        const id = await signUp(s, FREE);
        await s.rows(`insert into locked_coins (profile_id, amount) values ($1, 7), ($1, 12)`, [id]);
        const student = await newStudent(s, FREE);
        expect(await profile(s, id)).toMatchObject({ role: "student", student_id: student });
        const moved = () => s.rows<{ delta: number; source: string }>(
          `select delta, source from points_ledger where student_id = $1 order by delta`, [student]);
        expect(await moved()).toEqual([{ delta: 7, source: "exam" }, { delta: 12, source: "exam" }]);
        expect(await s.count("locked_coins", `profile_id = '${id}' and moved_at is null`)).toBe(0);

        // Linking again, by any road, moves nothing a second time.
        await s.rows(`select link_profile_to_student($1, $2)`, [id, student]);
        await s.rows(`update profiles set role = 'app_user', student_id = null, linked_at = null where id = $1`, [id]);
        await s.rows(`update students set parent_phone = '+998770000009' where id = $1`, [student]);
        expect(await profile(s, id)).toMatchObject({ role: "student", student_id: student });
        expect(await moved()).toEqual([{ delta: 7, source: "exam" }, { delta: 12, source: "exam" }]);
      });
    });

    it("links when staff change a student's phone to the account's, and when a lead is converted", async () => {
      await admin(async (s) => {
        const id = await signUp(s, FREE);
        const lead = (await profile(s, id)).lead_id;
        const converted = (await s.rows<{ id: string }>(
          `select convert_lead_to_student($1, 'Test Person', $2) as id`, [lead, FREE]))[0].id;
        expect(await profile(s, id)).toMatchObject({ role: "student", student_id: converted });
        expect((await s.rows(`select status from leads where id = $1`, [lead]))[0]).toEqual({ status: "won" });

        const second = await signUp(s, FREE_2);
        const student = await newStudent(s, "+998770000008");
        expect((await profile(s, second)).role).toBe("app_user");
        await s.rows(`update students set phone = $2 where id = $1`, [student, FREE_2]);
        expect(await profile(s, second)).toMatchObject({ role: "student", student_id: student });
        // Saving a phone never makes a lead.
        expect(await s.count("leads", `phone = '${FREE_2}'`)).toBe(1);
      });
    });

    it("a changed and re-confirmed phone is saved to the profile", async () => {
      await admin(async (s) => {
        const id = await signUp(s, FREE);
        await s.rows(`update auth.users set phone = $2 where id = $1`, [id, digits(FREE_2)]);
        expect((await profile(s, id)).phone).toBe(FREE_2);
      });
    });

    it("is not something a signed-in user can call", async () => {
      await as({ userId: APP_USER }, async (s) => {
        expect(code(await s.attempt(`select link_or_lead($1)`, [APP_USER]))).toBe(DENIED);
        expect(code(await s.attempt(`select link_profile_to_student($1, $2)`, [APP_USER, seedStudent.id]))).toBe(DENIED);
        expect(code(await s.attempt(`select sms_code_allowed('+998770000001')`))).toBe(DENIED);
      }, async (s) => void (await signUp(s, FREE, { id: APP_USER })));
    });
  });

  describe("unlink and relink — owner only", () => {
    it("the owner unlinks an account and links it again by hand; a manager cannot", async () => {
      const setup = async (s: Session) => void (await signUp(s, seedStudent.phone, { id: STUDENT_USER }));
      await as("manager", async (s) => {
        expect(code(await s.attempt(`select unlink_app_account($1)`, [seedStudent.id]))).toBe(DENIED);
        expect(code(await s.attempt(`select link_app_account($1)`, [seedStudent.id]))).toBe(DENIED);
      }, setup);
      await as("owner", async (s) => {
        await s.rows(`select unlink_app_account($1)`, [seedStudent.id]);
        expect(await profile(s, STUDENT_USER)).toMatchObject({ role: "app_user", student_id: null, linked_at: null });
        expect(code(await s.attempt(`select unlink_app_account($1)`, [seedStudent.id]))).toBe("EA001");
        // Saving the student without changing a phone leaves the account unlinked.
        await s.rows(`update students set phone = phone, parent_phone = parent_phone, notes = 'edited' where id = $1`, [seedStudent.id]);
        expect((await profile(s, STUDENT_USER)).role).toBe("app_user");
        await s.rows(`select link_app_account($1)`, [seedStudent.id]);
        expect(await profile(s, STUDENT_USER)).toMatchObject({ role: "student", student_id: seedStudent.id });
        expect(code(await s.attempt(`select link_app_account($1)`, [seedStudent.id]))).toBe("EA002");
        expect(code(await s.attempt(`select link_app_account($1)`, [otherStudent]))).toBe("EA001");
      }, setup);
    });

    it("the owner links one of two students sharing a phone by hand", async () => {
      let twin = "";
      await as("owner", async (s) => {
        await s.rows(`select link_app_account($1)`, [twin]);
        expect(await profile(s, APP_USER)).toMatchObject({ role: "student", student_id: twin });
      }, async (s) => {
        twin = await newStudent(s, FREE, null, "Twin One");
        await newStudent(s, FREE, null, "Twin Two");
        await signUp(s, FREE, { id: APP_USER });
      });
    });
  });

  describe("Student (linked)", () => {
    const setup = async (s: Session) => {
      await signUp(s, seedStudent.phone, { id: STUDENT_USER });
      await signUp(s, FREE, { id: OTHER_USER });
      await s.rows(
        `insert into notifications (profile_id, type, title, body) values ($1, 'account_linked', 't', 'mine'), ($2, 'account_linked', 't', 'theirs')`,
        [STUDENT_USER, OTHER_USER],
      );
      await s.rows(`insert into visits (student_id, kind, method) values ($1, 'arrived', 'qr'), ($2, 'arrived', 'qr')`, [seedStudent.id, otherStudent]);
    };
    const student = <T>(fn: (s: Session) => Promise<T>) => as({ userId: STUDENT_USER }, fn, setup);

    it("reads their own profile and nobody else's", async () => {
      await student(async (s) => {
        expect(await s.rows(`select id from profiles`)).toEqual([{ id: STUDENT_USER }]);
      });
    });

    it("edits photo, language and theme; not the name, role, phone or link", async () => {
      await student(async (s) => {
        expect(code(await s.attempt(`update profiles set avatar_path = $1 || '/a.jpg', language = 'ko', theme = 'dark' where id = $1`, [STUDENT_USER]))).toBe("allowed (1)");
        for (const change of [`full_name = 'Someone Else'`, `role = 'owner'`, `phone = '+998770000005'`, `student_id = '${otherStudent}'`, `is_active = false`, `korean_level = 'topik2'`, `linked_at = now()`]) {
          expect(code(await s.attempt(`update profiles set ${change} where id = $1`, [STUDENT_USER])), change).toBe(DENIED);
        }
        expect(code(await s.attempt(`update profiles set theme = 'dark' where id = $1`, [OTHER_USER]))).toBe("allowed (0)");
      });
    });

    it("reads their own groups, lessons, coins and visits only; attendance, charges and payments without staff notes", async () => {
      await student(async (s) => {
        expect(await s.rows(`select id from groups`)).toEqual([{ id: seedGroup }]);
        expect(await s.rows(`select distinct student_id from enrollments`)).toEqual([{ student_id: seedStudent.id }]);
        expect(await s.rows(`select distinct group_id from lessons`)).toEqual([{ group_id: seedGroup }]);
        for (const table of ["points_ledger", "visits"]) {
          expect(await s.rows(`select distinct student_id from ${table}`), table).toEqual([{ student_id: seedStudent.id }]);
        }
        // The tables with staff notes are closed; the functions give the student's own rows without them.
        for (const table of ["attendance", "charges", "payments"]) expect(await s.count(table), table).toBe(0);
        const own = async (table: string) => (await s.rows<{ n: number }>(`select count(*)::int as n from my_${table}()`))[0].n;
        await s.rows(`reset role`);
        const real = {
          attendance: await s.count("attendance", `student_id = '${seedStudent.id}'`),
          charges: await s.count("charges", `student_id = '${seedStudent.id}'`),
          payments: await s.count("payments", `student_id = '${seedStudent.id}'`),
        };
        await s.rows(`set local role authenticated`);
        expect({ attendance: await own("attendance"), charges: await own("charges"), payments: await own("payments") }).toEqual(real);
        expect(real.payments).toBeGreaterThan(0);
        for (const table of ["attendance", "charges", "payments"]) {
          const columns = Object.keys((await s.rows(`select * from my_${table}() limit 1`))[0]);
          expect(columns.filter((column) => /note|reason|_by$/.test(column)), table).toEqual([]);
        }
        expect(await s.count("redemptions", `student_id <> '${seedStudent.id}'`)).toBe(0);
        expect(await s.rows(`select body from notifications`)).toEqual([{ body: "mine" }]);
      });
    });

    it("reads nothing about other people, staff, leads or finance", async () => {
      await student(async (s) => {
        for (const table of ["students", "student_overview", "student_balances", "student_points", "leads", "lead_activities", "teachers", "messages", "telegram_links", "centre_settings", "message_templates", "coin_transactions", "locked_coins", "device_tokens", "lead_forms", "intake_log"]) {
          const result = await s.attempt(`select count(*)::int as n from ${table}`);
          expect(result.ok ? result.rows[0].n : 0, table).toBe(0);
        }
        for (const table of ["expenses", "teacher_payouts", "teacher_pay_rates", "sms_code_log"]) {
          const result = await s.attempt(`select count(*)::int as n from ${table}`);
          expect(result.ok ? result.rows[0].n : 0, table).toBe(0);
        }
        for (const call of [`leaderboard('centre')`, `lead_inbox()`, `group_coins('${seedGroup}')`, `teacher_groups()`, `list_debtors(10, 0)`, `points_tv_token()`]) {
          const result = await s.attempt(`select count(*)::int as n from ${call}`);
          expect(result.ok ? result.rows[0].n : 0, call).toBe(0);
        }
      });
    });

    it("writes nothing to the centre's records", async () => {
      await student(async (s) => {
        expect(code(await s.attempt(`insert into payments (student_id, group_id, amount, method, received_by) values ($1, $2, 1000, 'cash', $3)`, [seedStudent.id, seedGroup, STUDENT_USER]))).toBe(DENIED);
        expect(code(await s.attempt(`update lessons set status = 'held'`))).toBe("allowed (0)");
        expect(code(await s.attempt(`update groups set name = 'x'`))).toBe("allowed (0)");
        expect(code(await s.attempt(`insert into attendance (lesson_id, student_id, status, marked_by) select id, $1, 'present', $2 from lessons limit 1`, [seedStudent.id, STUDENT_USER]))).toBe(DENIED);
        expect(code(await s.attempt(`insert into notifications (profile_id, type, title, body) values ($1, 'custom', 'x', 'y')`, [STUDENT_USER]))).toBe(DENIED);
        expect(code(await s.attempt(`insert into visits (student_id, kind, method) values ($1, 'arrived', 'manual')`, [seedStudent.id]))).toBe(DENIED);
        expect(code(await s.attempt(`select adjust_points($1, 100, 'gift')`, [seedStudent.id]))).toBe(DENIED);
        expect(code(await s.attempt(`select add_coins($1, $2, 5)`, [seedStudent.id, seedGroup]))).toBe(DENIED);
        expect(code(await s.attempt(`select teacher_set_lesson_exam(id, true, 'x') from lessons limit 1`))).toBe(DENIED);
      });
    });

    it("marks their own notifications read, and changes nothing else on them", async () => {
      await student(async (s) => {
        expect(code(await s.attempt(`update notifications set read_at = now()`))).toBe("allowed (1)");
        expect(code(await s.attempt(`update notifications set body = 'changed'`))).toBe(DENIED);
        expect(code(await s.attempt(`delete from notifications`))).toBe(DENIED);
      });
    });

    it("saves a device token, takes over one left by another account, and removes it on log out", async () => {
      await student(async (s) => {
        await s.rows(`select register_device_token('token-1', 'android', '1.0.0')`);
        await s.rows(`select register_device_token('token-1', 'android', '1.0.1')`);
        await s.rows(`select register_device_token('token-left-behind', 'ios')`);
        expect(await s.rows(`select token, platform, app_version from device_tokens order by token`)).toEqual([
          { token: "token-1", platform: "android", app_version: "1.0.1" },
          { token: "token-left-behind", platform: "ios", app_version: null },
        ]);
        expect(code(await s.attempt(`delete from device_tokens where token = 'token-1'`))).toBe("allowed (1)");
        expect(code(await s.attempt(`insert into device_tokens (profile_id, token, platform) values ($1, 'direct', 'ios')`, [STUDENT_USER]))).toBe(DENIED);
      });
    });

    it("student_home returns the Home data for the chosen group", async () => {
      await student(async (s) => {
        const home = (await s.rows<{ home: Record<string, unknown> }>(`select student_home($1) as home`, [seedGroup]))[0].home;
        expect(home.group_id).toBe(seedGroup);
        expect(home.groups).toEqual([expect.objectContaining({ id: seedGroup })]);
        expect(home.student).toMatchObject({ id: seedStudent.id });
        expect(home.unread).toBe(1);
        expect(home.rank).toEqual({ rank: 1, of: 1 });
        expect(typeof home.coins).toBe("number");
        expect(home.balance).toEqual(expect.objectContaining({ amount: expect.any(Number), due_day: expect.any(Number) }));
        expect(home.attendance).toEqual(expect.objectContaining({ present: expect.any(Number), rate: expect.any(Number) }));
        // A group that is not theirs falls back to their own.
        const fallback = (await s.rows<{ home: { group_id: string } }>(`select student_home($1) as home`, [otherStudent]))[0].home;
        expect(fallback.group_id).toBe(seedGroup);
      });
    });

    it("student_home skips a cancelled lesson and says when an exam is next", async () => {
      await as({ userId: STUDENT_USER }, async (s) => {
        const next = (await s.rows<{ next: { kind: string; exam_title: string; starts_at: string } }>(`select student_home() -> 'next' as next`))[0].next;
        expect(next.kind).toBe("exam");
        expect(next.exam_title).toBe("Monthly test");
        expect(Date.parse(next.starts_at)).toBeGreaterThan(Date.now());
      }, async (s) => {
        await setup(s);
        const upcoming = await s.rows<{ id: string }>(
          `select id from lessons where group_id = $1 and status = 'scheduled'
             and (lesson_date + start_time) at time zone 'Asia/Tashkent' > now()
           order by lesson_date, start_time limit 2`, [seedGroup]);
        await s.rows(`update lessons set status = 'cancelled', cancel_reason = 'holiday' where id = $1`, [upcoming[0].id]);
        await s.rows(`update lessons set kind = 'exam', exam_title = 'Monthly test' where id = $1`, [upcoming[1].id]);
      });
    });

    it("the leaderboard shows linked students only, as first name and last initial", async () => {
      let classmate = "";
      await as({ userId: STUDENT_USER }, async (s) => {
        const rows = await s.rows<{ rank: number; display_name: string; coins: string; is_me: boolean }>(`select * from app_leaderboard('group', $1, 'all')`, [seedGroup]);
        expect(rows.length).toBe(2);
        expect(rows.filter((row) => row.is_me).length).toBe(1);
        for (const row of rows) expect(row.display_name).toMatch(/^\S+ \S\.$/);
        expect(Object.keys(rows[0]).sort()).toEqual(["coins", "display_name", "is_me", "rank"]);
        expect((await s.rows(`select * from app_leaderboard('centre')`)).length).toBe(2);
        // Another group's board is not theirs to read.
        const elsewhere = (await s.rows<{ id: string }>(`select group_id as id from my_group_ids() as group_id`)).map((g) => g.id);
        expect(elsewhere).toEqual([seedGroup]);
        expect(code(await s.attempt(`select * from app_leaderboard('group', $1)`, [classmate]))).toBe(DENIED);
        expect(code(await s.attempt(`select * from app_leaderboard('group')`))).toBe(DENIED);
      }, async (s) => {
        await setup(s);
        const mate = (await s.rows<{ id: string; phone: string }>(
          `select s.id, s.phone from students s join enrollments e on e.student_id = s.id
           where e.group_id = $1 and e.status = 'active' and s.id <> $2 order by s.id limit 1`, [seedGroup, seedStudent.id]))[0];
        await signUp(s, mate.phone);
        classmate = (await s.rows<{ id: string }>(`select id from groups where id <> $1 limit 1`, [seedGroup]))[0].id;
      });
    });

    it("reads rewards on offer and their variants", async () => {
      await as({ userId: STUDENT_USER }, async (s) => {
        expect(await s.count("rewards")).toBe(1);
        expect(await s.rows(`select name ->> 'en' as name, stock from reward_variants`)).toEqual([{ name: "M", stock: 3 }]);
        expect(code(await s.attempt(`insert into reward_variants (reward_id, name) select id, '{"en":"L"}' from rewards limit 1`))).toBe(DENIED);
        expect(code(await s.attempt(`update reward_variants set stock = 99`))).toBe("allowed (0)");
      }, async (s) => {
        await setup(s);
        await s.rows(`update rewards set is_active = false`);
        const reward = (await s.rows<{ id: string }>(`insert into rewards (name, cost) values ('T-shirt', 50) returning id`))[0].id;
        const hidden = (await s.rows<{ id: string }>(`insert into rewards (name, cost, is_active) values ('Old', 50, false) returning id`))[0].id;
        await s.rows(`insert into reward_variants (reward_id, name, stock) values ($1, '{"uz":"M","ru":"M","en":"M","ko":"M"}', 3), ($2, '{"en":"S"}', 1)`, [reward, hidden]);
      });
    });

    it("my_student returns their own record without staff notes", async () => {
      await student(async (s) => {
        const mine = (await s.rows<{ me: Record<string, unknown> }>(`select my_student() as me`))[0].me;
        expect(mine).toMatchObject({ id: seedStudent.id, phone: seedStudent.phone });
        expect(Object.keys(mine)).not.toContain("notes");
      });
    });

    it("delete_my_account removes the login and account data and keeps the student's records", async () => {
      await as({ userId: STUDENT_USER }, async (s) => {
        const before = (await s.rows<{ n: number }>(`select count(*)::int as n from my_payments()`))[0].n;
        expect(before).toBeGreaterThan(0);
        await s.rows(`select register_device_token('token-1', 'android')`);
        await s.rows(`select delete_my_account()`);
        // Signed out for good: the profile is gone, so nothing is readable any more.
        expect(await s.count("profiles")).toBe(0);
        expect(await s.rows(`select * from my_payments()`)).toEqual([]);
        expect(code(await s.attempt(`select student_home()`))).toBe(DENIED);
        await s.rows(`reset role`);
        expect(await s.rows(`select count(*)::int as n from auth.users where id = $1`, [STUDENT_USER])).toEqual([{ n: 0 }]);
        for (const table of ["device_tokens", "notifications", "locked_coins"]) {
          expect(await s.count(table, `profile_id = '${STUDENT_USER}'`), table).toBe(0);
        }
        // The photo's folder is left for the server to remove.
        expect(await s.count("deleted_app_accounts", `profile_id = '${STUDENT_USER}'`)).toBe(1);
        expect(await s.count("students", `id = '${seedStudent.id}' and archived_at is null`)).toBe(1);
        expect(await s.count("payments", `student_id = '${seedStudent.id}'`)).toBe(before);
        expect(await s.count("points_ledger", `student_id = '${seedStudent.id}'`)).toBeGreaterThan(0);
        // The student can sign up again later and is linked again.
        await signUp(s, seedStudent.phone, { id: STUDENT_USER });
        expect(await profile(s, STUDENT_USER)).toMatchObject({ role: "student", student_id: seedStudent.id });
      }, setup);
    });
  });

  describe("App user (not linked)", () => {
    const setup = async (s: Session) => {
      await signUp(s, FREE, { id: APP_USER });
      await signUp(s, seedStudent.phone, { id: STUDENT_USER });
      await s.rows(`insert into notifications (profile_id, type, title, body) values ($1, 'voucher_expiring', 't', 'mine'), ($2, 'account_linked', 't', 'theirs')`, [APP_USER, STUDENT_USER]);
      await s.rows(`insert into locked_coins (profile_id, amount) values ($1, 9), ($2, 4)`, [APP_USER, STUDENT_USER]);
    };
    const appUser = <T>(fn: (s: Session) => Promise<T>) => as({ userId: APP_USER }, fn, setup);

    it("reads and edits their own profile only", async () => {
      await appUser(async (s) => {
        expect(await s.rows(`select id, role from profiles`)).toEqual([{ id: APP_USER, role: "app_user" }]);
        expect(code(await s.attempt(`update profiles set language = 'ru', theme = 'light' where id = $1`, [APP_USER]))).toBe("allowed (1)");
        expect(code(await s.attempt(`update profiles set role = 'student', student_id = $2 where id = $1`, [APP_USER, seedStudent.id]))).toBe(DENIED);
        expect(code(await s.attempt(`update profiles set full_name = 'Other' where id = $1`, [APP_USER]))).toBe(DENIED);
      });
    });

    it("has no groups, lessons, attendance, charges, payments, coins, orders or visits", async () => {
      await appUser(async (s) => {
        for (const table of ["groups", "enrollments", "lessons", "attendance", "charges", "payments", "points_ledger", "redemptions", "visits", "students", "leads", "teachers", "messages", "centre_settings", "student_balances"]) {
          const result = await s.attempt(`select count(*)::int as n from ${table}`);
          expect(result.ok ? result.rows[0].n : 0, table).toBe(0);
        }
        expect(code(await s.attempt(`select student_home()`))).toBe(DENIED);
        expect(code(await s.attempt(`select * from app_leaderboard('centre')`))).toBe(DENIED);
        expect((await s.rows(`select my_student() as me`))[0]).toEqual({ me: null });
        for (const list of ["my_attendance", "my_charges", "my_payments"]) expect(await s.rows(`select * from ${list}()`), list).toEqual([]);
        expect(await s.rows(`select * from my_group_ids()`)).toEqual([]);
      });
    });

    it("reads their own locked coins, notifications and tokens, and the rewards on offer", async () => {
      await appUser(async (s) => {
        expect(await s.rows(`select amount from locked_coins`)).toEqual([{ amount: 9 }]);
        expect(await s.rows(`select body from notifications`)).toEqual([{ body: "mine" }]);
        await s.rows(`select register_device_token('app-user-token', 'ios')`);
        expect(await s.count("device_tokens")).toBe(1);
        expect(await s.count("rewards")).toBeGreaterThan(0);
        expect(await s.count("rewards", "not is_active or archived_at is not null")).toBe(0);
        expect(code(await s.attempt(`insert into locked_coins (profile_id, amount) values ($1, 1000)`, [APP_USER]))).toBe(DENIED);
        expect(code(await s.attempt(`update locked_coins set amount = 1000`))).toBe(DENIED);
      });
    });

    it("cannot order a reward", async () => {
      await appUser(async (s) => {
        const result = await s.attempt(`select request_reward($1, (select id from rewards limit 1), 'desk', 'staff')`, [seedStudent.id]);
        expect(result.ok).toBe(false);
      });
    });

    it("can delete their account; the lead stays with the centre", async () => {
      await appUser(async (s) => {
        await s.rows(`select delete_my_account()`);
        await s.rows(`reset role`);
        expect(await s.count("profiles", `id = '${APP_USER}'`)).toBe(0);
        expect(await s.count("leads", `phone = '${FREE}' and source = 'mobile_app'`)).toBe(1);
      });
    });

    it("staff cannot use delete_my_account", async () => {
      await as("manager", async (s) => {
        expect(code(await s.attempt(`select delete_my_account()`))).toBe(DENIED);
      });
    });
  });

  describe("Kiosk", () => {
    const setup = async (s: Session) => {
      await s.rows(
        `insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', 'kiosk@test.local', '{"role":"kiosk"}', '{"full_name":"Reception tablet"}')`,
        [KIOSK],
      );
    };
    const kiosk = <T>(fn: (s: Session) => Promise<T>) => as({ userId: KIOSK }, fn, setup);

    it("is made with the kiosk role from app metadata only", async () => {
      await admin(async (s) => {
        await setup(s);
        expect(await profile(s, KIOSK)).toMatchObject({ role: "kiosk", is_active: true, student_id: null });
        // User metadata cannot ask for it.
        await s.rows(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'x@test.local', '{"role":"kiosk"}')`, [OTHER_USER]);
        expect(await profile(s, OTHER_USER)).toMatchObject({ role: "manager", is_active: false });
      });
    });

    it("reads its own profile and nothing else at all", async () => {
      await kiosk(async (s) => {
        expect(await s.rows(`select role from profiles`)).toEqual([{ role: "kiosk" }]);
        const tables = (await s.rows<{ name: string }>(
          `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'v') and c.relname <> 'profiles' order by 1`)).map((t) => t.name);
        expect(tables.length).toBeGreaterThan(40);
        for (const table of tables) {
          const result = await s.attempt(`select count(*)::int as n from public.${table}`);
          expect(result.ok ? result.rows[0].n : 0, table).toBe(0);
        }
        expect(await s.count("objects" as never).catch(() => 0)).toBe(0);
      });
    });

    it("cannot use the app's or the staff's functions", async () => {
      await kiosk(async (s) => {
        for (const call of [`student_home()`, `delete_my_account()`, `register_device_token('t', 'ios')`, `lead_inbox()`, `leaderboard('centre')`, `app_leaderboard('centre')`, `unlink_app_account('${seedStudent.id}')`]) {
          expect(code(await s.attempt(`select ${call}`)), call).toBe(DENIED);
        }
        expect(code(await s.attempt(`update profiles set full_name = 'Hacked'`))).toBe(DENIED);
      });
    });
  });

  describe("everyone else", () => {
    it("anyone reads About and the privacy policy; nothing else is open", async () => {
      await as("anon", async (s) => {
        const info = (await s.rows<{ info: Record<string, unknown> }>(`select app_centre_info() as info`))[0].info;
        expect(Object.keys(info).sort()).toEqual(["about", "centre_name", "privacy_policy"]);
        expect(code(await s.attempt(`select student_home()`))).toBe(DENIED);
        expect(code(await s.attempt(`select count(*) from notifications`))).toBe(DENIED);
      });
    });

    it("a teacher reaches none of the app's tables and marks a lesson of their own group as an exam", async () => {
      await as("teacher", async (s) => {
        for (const table of ["notifications", "device_tokens", "visits", "locked_coins"]) {
          expect(await s.count(table), table).toBe(0);
        }
        const group = (await s.rows<{ id: string }>(`select id from teacher_groups() limit 1`))[0].id;
        const lesson = (await s.rows<{ id: string }>(`select id from teacher_lessons($1) limit 1`, [group]))[0].id;
        expect(code(await s.attempt(`select teacher_set_lesson_exam($1, true, '  ')`, [lesson]))).toBe("EA003");
        await s.rows(`select teacher_set_lesson_exam($1, true, 'Unit 3 test')`, [lesson]);
        expect((await s.rows(`select kind, exam_title from teacher_lessons($1) where id = $2`, [group, lesson]))[0]).toEqual({ kind: "exam", exam_title: "Unit 3 test" });
        await s.rows(`select teacher_set_lesson_exam($1, false)`, [lesson]);
        expect((await s.rows(`select kind, exam_title from teacher_lessons($1) where id = $2`, [group, lesson]))[0]).toEqual({ kind: "lesson", exam_title: null });
        const foreign = await s.attempt(`select teacher_set_lesson_exam($1, true, 'x')`, ["00000000-0000-4000-8000-000000000000"]);
        expect(code(foreign)).toBe(DENIED);
      });
    });

    it("a manager marks a lesson as an exam; an exam always has a title", async () => {
      await as("manager", async (s) => {
        const lesson = (await s.rows<{ id: string }>(`select id from lessons limit 1`))[0].id;
        expect(code(await s.attempt(`update lessons set kind = 'exam', exam_title = 'Final' where id = $1`, [lesson]))).toBe("allowed (1)");
        expect(code(await s.attempt(`update lessons set exam_title = null where id = $1`, [lesson]))).toBe("23514");
        expect(await s.count("visits")).toBe(0);
        expect(await s.count("notifications")).toBe(0);
      });
    });

    it("the SMS limit: three codes an hour per phone", async () => {
      await admin(async (s) => {
        const ask = async (phone: string) => (await s.rows<{ ok: boolean }>(`select sms_code_allowed($1) as ok`, [phone]))[0].ok;
        expect([await ask(FREE), await ask(FREE), await ask(FREE), await ask(FREE)]).toEqual([true, true, true, false]);
        expect(await ask(FREE_2)).toBe(true);
        await s.rows(`update sms_code_log set sent_at = now() - interval '61 minutes' where phone = $1`, [FREE]);
        expect(await ask(FREE)).toBe(true);
        // A code that could not be sent is given back.
        expect([await ask(FREE_2), await ask(FREE_2), await ask(FREE_2)]).toEqual([true, true, false]);
        await s.rows(`select sms_code_release($1)`, [FREE_2]);
        expect(await ask(FREE_2)).toBe(true);
      });
    });
  });
});
