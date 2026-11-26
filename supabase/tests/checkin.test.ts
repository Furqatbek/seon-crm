/**
 * QR check-in — docs/STUDENT_APP_SPEC.md → "Rules → QR check-in" and "Users,
 * roles and access". The per-student secret, the code a phone shows, and
 * verify_checkin() for a kiosk, the owner and managers. Everything is rolled back.
 */
import { createHmac } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, MANAGER_ID, OWNER_ID, TEACHER_USER_ID, as, connect, disconnect, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);

const STUDENT_USER = "0000000d-0000-4000-8000-000000000001";
const OTHER_USER = "0000000d-0000-4000-8000-000000000002";
const APP_USER = "0000000d-0000-4000-8000-000000000003";
const KIOSK = "0000000d-0000-4000-8000-000000000004";

// The same fixed moment, secret and student as mobile/test/checkin_test.dart:
// the phone and the server must write the very same code.
const FIXED = {
  secret: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  student: "11111111-2222-4333-8444-555555555555",
  at: "2026-11-26T10:45:00Z",
  code: "v1.11111111-2222-4333-8444-555555555555.59856330.cf514c2db341426d5c0869ad1fc302c589c3309ddb910369eb3fa5a609965193",
  next: "v1.11111111-2222-4333-8444-555555555555.59856331.8a2f6abd9b02e58b83ccf15327882bdf51f99f43a2833c401ce8b3fedd0e3dfb",
};

let student = "";
let other = "";
let group = "";

/** Act as another signed-in user for the rest of the transaction. */
async function actAs(s: Session, userId: string) {
  await s.rows(`reset role`);
  await s.rows(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
  await s.rows(`set local role authenticated`);
}
/** What the owner of the database sees, from inside a signed-in session. */
const asDb = async <T>(s: Session, fn: () => Promise<T>): Promise<T> => {
  await s.rows(`reset role`);
  try {
    return await fn();
  } finally {
    await s.rows(`set local role authenticated`);
  }
};
const secretOf = (s: Session, id: string) =>
  asDb(s, async () => (await s.rows<{ secret: string | null }>(`select (select v.decrypted_secret from vault.decrypted_secrets v where v.id = st.qr_secret_id) as secret from students st where st.id = $1`, [id]))[0].secret);
/** The code the student's phone shows `seconds` from now. */
const codeOf = async (s: Session, id: string, seconds = 0) => {
  const secret = await secretOf(s, id);
  return asDb(s, async () => (await s.rows<{ code: string }>(`select public.qr_code_at($1, $2, now() + make_interval(secs => $3)) as code`, [secret, id, seconds]))[0].code);
};
type Result = { result: string; repeat?: boolean; at?: string; visit_id?: string; student?: { id: string; full_name: string; avatar_path: string | null }; lessons?: unknown[]; debt?: boolean };
const scan = async (s: Session, text: string) => (await s.rows<{ r: Result }>(`select public.verify_checkin($1) as r`, [text]))[0].r;
const visits = (s: Session, id: string) =>
  asDb(s, () => s.rows<{ kind: string; method: string; scanned_by: string | null }>(`select kind, method, scanned_by from visits where student_id = $1 order by at, id`, [id]));
/**
 * Minutes pass: what was written moves into the past. In the first minutes of
 * the Tashkent day that would move a visit into yesterday, where it no longer
 * counts for today, so the tests that need time to pass wait for later runs.
 */
const minutesIntoDay = (Math.floor(Date.now() / 60_000) + 5 * 60) % (24 * 60);
const justAfterMidnight = minutesIntoDay < 15;
const later = (s: Session, minutes: number) => asDb(s, () => s.rows(`update visits set at = at - $1::numeric * interval '1 minute'`, [minutes]));

/** Two seed students with app accounts linked by phone (the first with a lesson today), an app user and a kiosk. */
const setup = async (s: Session) => {
  const seeded = await s.rows<{ id: string; group_id: string }>(
    `select s.id, e.group_id from students s join enrollments e on e.student_id = s.id and e.status = 'active'
     join groups g on g.id = e.group_id and g.archived_at is null
     where s.archived_at is null order by s.id limit 2`,
  );
  [student, other] = seeded.map((row) => row.id);
  group = seeded[0].group_id;
  await s.rows(`update students set phone = '+998770002001' where id = $1`, [student]);
  await s.rows(`update students set phone = '+998770002002' where id = $1`, [other]);
  const user = `insert into auth.users (id, aud, role, phone, phone_confirmed_at, encrypted_password, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', $2, now(), 'hash-1', '{"full_name":"App"}')`;
  await s.rows(user, [STUDENT_USER, "998770002001"]);
  await s.rows(user, [OTHER_USER, "998770002002"]);
  await s.rows(user, [APP_USER, "998770002003"]);
  await s.rows(
    `insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', 'kiosk-checkin@test.local', '{"role":"kiosk"}', '{"full_name":"Reception tablet"}')`,
    [KIOSK],
  );
  // A lesson today for the first student's group, if the timetable has none.
  await s.rows(
    `update lessons set lesson_date = public.tashkent_today()
     where id = (select id from lessons where group_id = $1 and lesson_date > public.tashkent_today() and status <> 'cancelled' order by lesson_date limit 1)
       and not exists (select 1 from lessons where group_id = $1 and lesson_date = public.tashkent_today())`,
    [group],
  );
};

const kiosk = <T>(fn: (s: Session) => Promise<T>) => as({ userId: KIOSK }, fn, setup);

describe.skipIf(!DB_URL)("QR check-in", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("the code", () => {
    it("is the same on the server as on the phone, for a fixed clock", async () => {
      await kiosk(async (s) => {
        const payload = `v1.${FIXED.student}.${Math.floor(Date.parse(FIXED.at) / 30_000)}`;
        expect(`${payload}.${createHmac("sha256", FIXED.secret).update(payload).digest("hex")}`).toBe(FIXED.code);
        await asDb(s, async () => {
          const at = (seconds: number) => s.rows<{ code: string }>(`select public.qr_code_at($1, $2, $3::timestamptz + make_interval(secs => $4)) as code`, [FIXED.secret, FIXED.student, FIXED.at, seconds]);
          expect((await at(0))[0].code).toBe(FIXED.code);
          // The whole 30 seconds show one code; the next step shows another.
          expect((await at(29))[0].code).toBe(FIXED.code);
          expect((await at(30))[0].code).toBe(FIXED.next);
        });
        // Nobody signed in can make codes on the server.
        expect(code(await s.attempt(`select public.qr_code_at('x', $1, now())`, [student]))).toBe(DENIED);
      });
    });
  });

  describe("the secret", () => {
    it("is made on linking and handed only to that signed-in student", async () => {
      await as({ userId: STUDENT_USER }, async (s) => {
        const mine = (await s.rows<{ q: { student_id: string; secret: string } }>(`select public.qr_secret() as q`))[0].q;
        expect(mine.student_id).toBe(student);
        expect(mine.secret).toMatch(/^[0-9a-f]{64}$/);
        expect(mine.secret).toBe(await secretOf(s, student));
        // Asking again gives the same one.
        expect((await s.rows<{ q: { secret: string } }>(`select public.qr_secret() as q`))[0].q.secret).toBe(mine.secret);
        // Each student has their own.
        expect(await secretOf(s, other)).not.toBe(mine.secret);
        // Vault is closed to everyone signed in, and the rotation is not theirs to call.
        expect(code(await s.attempt(`select * from vault.decrypted_secrets`))).toBe(DENIED);
        expect(code(await s.attempt(`select public.qr_secret_rotate($1)`, [student]))).toBe(DENIED);

        for (const user of [APP_USER, KIOSK, OWNER_ID, MANAGER_ID, TEACHER_USER_ID]) {
          await actAs(s, user);
          expect(code(await s.attempt(`select public.qr_secret()`)), user).toBe(DENIED);
        }
      }, setup);
    });

    it("is replaced when the password or the phone changes: the old code stops working", async () => {
      await kiosk(async (s) => {
        const first = await secretOf(s, student);
        const oldCode = await codeOf(s, student);

        await asDb(s, () => s.rows(`update auth.users set encrypted_password = 'hash-2' where id = $1`, [STUDENT_USER]));
        const second = await secretOf(s, student);
        expect(second).not.toBe(first);
        expect((await scan(s, oldCode)).result).toBe("invalid");

        await asDb(s, () => s.rows(`update auth.users set phone = '998770002009' where id = $1`, [STUDENT_USER]));
        const third = await secretOf(s, student);
        expect(third).not.toBe(second);
        // Anything else about the account leaves it alone, and so does someone else's change.
        await asDb(s, () => s.rows(`update auth.users set raw_user_meta_data = '{"full_name":"Renamed"}' where id = $1`, [STUDENT_USER]));
        await asDb(s, () => s.rows(`update auth.users set encrypted_password = 'hash-3' where id = $1`, [OTHER_USER]));
        expect(await secretOf(s, student)).toBe(third);

        expect((await scan(s, await codeOf(s, student))).result).toBe("arrived");
      });
    });

    it("is removed when the account is unlinked or deleted", async () => {
      await kiosk(async (s) => {
        const oldCode = await codeOf(s, student);
        const otherCode = await codeOf(s, other);
        await asDb(s, () => s.rows(`update profiles set role = 'app_user', student_id = null, linked_at = null where id = $1`, [STUDENT_USER]));
        expect(await secretOf(s, student)).toBeNull();
        expect((await scan(s, oldCode)).result).toBe("unknown");
        await asDb(s, () => s.rows(`delete from auth.users where id = $1`, [OTHER_USER]));
        expect(await secretOf(s, other)).toBeNull();
        expect((await scan(s, otherCode)).result).toBe("unknown");
        expect(await visits(s, student)).toEqual([]);
      });
    });
  });

  describe("verify_checkin", () => {
    it("accepts the current step and writes a visit with who scanned it", async () => {
      await kiosk(async (s) => {
        const result = await scan(s, await codeOf(s, student));
        expect(result).toMatchObject({ result: "arrived", repeat: false, student: { id: student } });
        expect(result.student?.full_name).toEqual(expect.any(String));
        expect(await visits(s, student)).toEqual([{ kind: "arrived", method: "qr", scanned_by: KIOSK }]);
      });
    });

    it("accepts the previous step, and a code typed in capitals by a handheld scanner", async () => {
      await kiosk(async (s) => {
        expect((await scan(s, await codeOf(s, student, -30))).result).toBe("arrived");
        expect((await scan(s, ` ${(await codeOf(s, other)).toUpperCase()}\n`)).result).toBe("arrived");
      });
    });

    it("refuses a code two steps old, and one from a phone whose clock runs ahead", async () => {
      await kiosk(async (s) => {
        expect(await scan(s, await codeOf(s, student, -60))).toEqual({ result: "expired" });
        expect(await scan(s, await codeOf(s, student, -3600))).toEqual({ result: "expired" });
        expect(await scan(s, await codeOf(s, student, 30))).toEqual({ result: "clock" });
        expect(await visits(s, student)).toEqual([]);
      });
    });

    it("refuses a tampered signature, another student's signature and anything that is not a code", async () => {
      await kiosk(async (s) => {
        const real = await codeOf(s, student);
        const [version, id, step, signature] = real.split(".");
        const flipped = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
        expect(await scan(s, [version, id, step, flipped].join("."))).toEqual({ result: "invalid" });
        // A later step under an old signature.
        expect(await scan(s, [version, id, String(Number(step) + 1), signature].join("."))).toEqual({ result: "invalid" });
        // Someone else's code with this student's id.
        const theirs = (await codeOf(s, other)).split(".");
        expect(await scan(s, [version, id, step, theirs[3]].join("."))).toEqual({ result: "invalid" });
        // Signed with a made-up secret.
        const forged = createHmac("sha256", "guess").update(`v1.${id}.${step}`).digest("hex");
        expect(await scan(s, `v1.${id}.${step}.${forged}`)).toEqual({ result: "invalid" });
        for (const text of ["", "hello", "https://example.com/x", `v2.${id}.${step}.${signature}`, `v1.${id}.${step}`, `v1.${id}.${step}.${signature}.extra`, `v1.${id}.x.${signature}`]) {
          expect(await scan(s, text), text).toEqual({ result: "invalid" });
        }
        // A student the centre does not have.
        expect(await scan(s, `v1.00000000-0000-4000-8000-00000000dead.${step}.${signature}`)).toEqual({ result: "unknown" });
        expect(await visits(s, student)).toEqual([]);
      });
    });

    it("an archived student's code is not accepted", async () => {
      await kiosk(async (s) => {
        const real = await codeOf(s, student);
        await asDb(s, () => s.rows(`update students set archived_at = now() where id = $1`, [student]));
        expect(await scan(s, real)).toEqual({ result: "unknown" });
      });
    });

    it.skipIf(justAfterMidnight)("alternates Arrived and Left through the day, and a repeat within 2 minutes changes nothing", async () => {
      await kiosk(async (s) => {
        const show = async () => scan(s, await codeOf(s, student));
        const first = await show();
        expect(first).toMatchObject({ result: "arrived", repeat: false });

        // Held to the scanner a moment too long, or scanned twice.
        const again = await show();
        expect(again).toMatchObject({ result: "arrived", repeat: true, visit_id: first.visit_id, at: first.at });
        await later(s, 1.9);
        expect(await show()).toMatchObject({ result: "arrived", repeat: true });
        expect(await visits(s, student)).toHaveLength(1);

        await later(s, 0.2);
        expect(await show()).toMatchObject({ result: "left", repeat: false });
        expect(await show()).toMatchObject({ result: "left", repeat: true });
        await later(s, 3);
        expect(await show()).toMatchObject({ result: "arrived", repeat: false });
        await later(s, 3);
        expect(await show()).toMatchObject({ result: "left", repeat: false });
        expect((await visits(s, student)).map((visit) => visit.kind)).toEqual(["arrived", "left", "arrived", "left"]);

        // Someone else's day is their own.
        expect((await scan(s, await codeOf(s, other))).result).toBe("arrived");
      });
    });

    it("starts each Tashkent day with Arrived, whatever yesterday ended on", async () => {
      await kiosk(async (s) => {
        await asDb(s, () =>
          s.rows(`insert into visits (student_id, kind, method, at) values ($1, 'arrived', 'qr', (public.tashkent_today()::timestamp at time zone 'Asia/Tashkent') - interval '1 minute')`, [student]),
        );
        expect((await scan(s, await codeOf(s, student))).result).toBe("arrived");
      });
    });

    it.skipIf(justAfterMidnight)("shows today's lessons and a debt flag, never an amount, and leaves lesson attendance alone", async () => {
      await kiosk(async (s) => {
        const before = await asDb(s, () => s.rows<{ n: number }>(`select count(*)::int as n from attendance`));
        const owes = await asDb(s, async () => (await s.rows<{ owes: boolean }>(`select coalesce((select balance < 0 from student_balances where student_id = $1), false) as owes`, [student]))[0].owes);
        const result = await scan(s, await codeOf(s, student));
        expect(result.debt).toBe(owes);
        expect(result.lessons).toEqual([expect.objectContaining({ group: expect.any(String), start_time: expect.stringMatching(/^\d\d:\d\d$/), end_time: expect.stringMatching(/^\d\d:\d\d$/) })]);
        expect(JSON.stringify(result)).not.toMatch(/balance|amount|phone/);
        expect(await asDb(s, () => s.rows<{ n: number }>(`select count(*)::int as n from attendance`))).toEqual(before);

        // With a fee unpaid the flag is on.
        await asDb(s, () => s.rows(`insert into charges (student_id, group_id, billing_month, amount, type, note) values ($1, $2, date_trunc('month', now())::date, 99000000, 'adjustment', 'Test')`, [student, group]));
        await later(s, 3);
        expect((await scan(s, await codeOf(s, student))).debt).toBe(true);
      });
    });

    it.skipIf(justAfterMidnight)("is for a kiosk, the owner and managers only", async () => {
      await as({ userId: STUDENT_USER }, async (s) => {
        const mine = await codeOf(s, student);
        for (const user of [STUDENT_USER, APP_USER, TEACHER_USER_ID]) {
          await actAs(s, user);
          expect(code(await s.attempt(`select public.verify_checkin($1)`, [mine])), user).toBe(DENIED);
          expect(code(await s.attempt(`select * from public.checkin_search('a')`)), user).toBe(DENIED);
          expect(code(await s.attempt(`select public.manual_checkin($1)`, [student])), user).toBe(DENIED);
          expect(code(await s.attempt(`select public.record_visit($1, 'qr')`, [student])), user).toBe(DENIED);
          expect(code(await s.attempt(`insert into visits (student_id, kind, method) values ($1, 'arrived', 'manual')`, [student])), user).toBe(DENIED);
        }
        expect(await visits(s, student)).toEqual([]);

        await actAs(s, OWNER_ID);
        expect((await scan(s, mine)).result).toBe("arrived");
        await later(s, 3);
        await actAs(s, MANAGER_ID);
        expect((await scan(s, mine)).result).toBe("left");
        expect((await visits(s, student)).map((visit) => visit.scanned_by)).toEqual([OWNER_ID, MANAGER_ID]);
      }, setup);
    });

    it("a kiosk can do nothing else: no students, visits, payments or profiles", async () => {
      await kiosk(async (s) => {
        await scan(s, await codeOf(s, student));
        for (const table of ["students", "visits", "payments", "charges", "leads", "groups", "lessons", "enrollments"]) {
          const read = await s.attempt(`select * from ${table} limit 1`);
          expect(read.ok ? read.rowCount : 0, table).toBe(0);
        }
        expect(code(await s.attempt(`insert into visits (student_id, kind, method) values ($1, 'arrived', 'manual')`, [student]))).toBe(DENIED);
        expect(code(await s.attempt(`select public.qr_secret()`))).toBe(DENIED);
      });
    });
  });

  describe("the search fallback", () => {
    it.skipIf(justAfterMidnight)("finds students by name, with their groups and nothing else, and checks one in by hand", async () => {
      await kiosk(async (s) => {
        const name = await asDb(s, async () => (await s.rows<{ full_name: string }>(`select full_name from students where id = $1`, [student]))[0].full_name);
        const found = await s.rows<Record<string, unknown>>(`select * from public.checkin_search($1)`, [name.slice(0, 4).toLowerCase()]);
        expect(found.length).toBeGreaterThan(0);
        expect(found.length).toBeLessThanOrEqual(8);
        const row = found.find((each) => each.student_id === student);
        expect(row).toEqual({ student_id: student, full_name: name, groups: expect.any(String) });
        // One letter is not a search, and % is not a wildcard.
        expect(await s.rows(`select * from public.checkin_search('a')`)).toEqual([]);
        expect(await s.rows(`select * from public.checkin_search('%%')`)).toEqual([]);

        const result = (await s.rows<{ r: Result }>(`select public.manual_checkin($1) as r`, [student]))[0].r;
        expect(result).toMatchObject({ result: "arrived", student: { id: student } });
        expect(await visits(s, student)).toEqual([{ kind: "arrived", method: "manual", scanned_by: KIOSK }]);
        // By hand and by code are one day's visits: the code a little later is Left.
        await later(s, 3);
        expect((await scan(s, await codeOf(s, student))).result).toBe("left");
        expect((await s.rows<{ r: Result }>(`select public.manual_checkin('00000000-0000-4000-8000-00000000dead') as r`))[0].r).toEqual({ result: "unknown" });
      });
    });
  });

  describe("the student", () => {
    it("reads their own visits and nobody else's", async () => {
      await as({ userId: STUDENT_USER }, async (s) => {
        await asDb(s, () => s.rows(`insert into visits (student_id, kind, method) values ($1, 'arrived', 'qr'), ($2, 'arrived', 'qr')`, [student, other]));
        const mine = await s.rows<{ student_id: string }>(`select student_id from visits`);
        expect(mine).toEqual([{ student_id: student }]);
      }, setup);
    });
  });
});
