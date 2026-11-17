/**
 * Leaderboards and the TV screen — docs/SPEC.md → "Points and rewards add-on
 * → Leaderboard rules", "Screens → TV screen". Every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, admin, as, connect, disconnect, teacherId, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);
const TEACHER = teacherId(2);
const monthStart = `(date_trunc('month', public.tashkent_today())::timestamp at time zone 'Asia/Tashkent')`;
const lastMonth = `(date_trunc('month', public.tashkent_today()) - interval '1 month')::date`;

let ownGroup: string; // IELTS 6.5, taught by the teacher login
let otherGroup: string; // another teacher's

type Row = { display_name: string; points: number; rank: number; hidden: boolean };
const board = (s: Session, scope: "group" | "centre", group: string | null, period = "month", month = "null") =>
  s.rows<Row>(
    `select display_name, points::int as points, rank, hidden from public.leaderboard($1, $2, $3, ${month})`,
    [scope, group, period],
  );
const top = (rows: Row[], n: number) => rows.slice(0, n).map((row) => [row.rank, row.display_name, row.points]);

/** Four students in the teacher's group; the first is also in another group. Far more points than anyone seeded. */
async function fixture(s: Session) {
  const ids: Record<string, string> = {};
  for (const [key, name] of [["a", "Board Alpha"], ["b", "Board Bravo"], ["c", "Board Charlie"], ["d", "Board Delta"]]) {
    const [{ id }] = await s.rows<{ id: string }>(
      `insert into students (full_name, phone) values ($1, '+99890555' || lpad((random() * 9999)::int::text, 4, '0')) returning id`,
      [name],
    );
    await s.rows(`insert into enrollments (group_id, student_id, joined_on) values ($1, $2, public.tashkent_today() - 60)`, [ownGroup, id]);
    ids[key] = id;
  }
  await s.rows(`insert into enrollments (group_id, student_id, joined_on) values ($1, $2, public.tashkent_today() - 60)`, [otherGroup, ids.a]);
  const post = (student: string, delta: number, group: string | null, at = "now()", source = "owner_adjustment") =>
    s.rows(
      `insert into points_ledger (student_id, delta, source, group_id, reason, created_at) values ($1, $2, $3, $4, 'Test', ${at})`,
      [student, delta, source, group],
    );
  await post(ids.a, 50_030, ownGroup);
  await post(ids.b, 50_012, ownGroup);
  await post(ids.c, 50_012, ownGroup);
  await post(ids.d, 50_005, ownGroup);
  return { ids, post };
}

describe.skipIf(!DB_URL)("Leaderboards and the TV screen", () => {
  beforeAll(async () => {
    await connect();
    await admin(async (s) => {
      const groups = await s.rows<{ id: string; name: string; teacher_id: string }>(`select id, name, teacher_id from groups where status = 'active' and archived_at is null`);
      ownGroup = groups.find((g) => g.name === "IELTS 6.5")!.id;
      otherGroup = groups.find((g) => g.teacher_id !== TEACHER)!.id;
    });
  });
  afterAll(disconnect);

  it("ties share a rank and the next one skips: 1, 2, 2, 4, then by name", async () => {
    await as("manager", async (s) => {
      expect(top(await board(s, "group", ownGroup), 4)).toEqual([
        [1, "Board Alpha", 50_030],
        [2, "Board Bravo", 50_012],
        [2, "Board Charlie", 50_012],
        [4, "Board Delta", 50_005],
      ]);
      // Everyone enrolled is listed, also with no points; nobody is listed twice.
      const rows = await board(s, "group", ownGroup);
      expect(rows.length).toBe(await s.count("enrollments", `group_id = '${ownGroup}' and status = 'active'`));
    }, async (s) => void (await fixture(s)));
  });

  it("the month boundary is 00:00 Tashkent time", async () => {
    await as("manager", async (s) => {
      // This month: the row from one second before midnight is not counted, the one at midnight is.
      expect(top(await board(s, "group", ownGroup), 2)).toEqual([
        [1, "Board Alpha", 50_030],
        [2, "Board Delta", 50_005 + 7],
      ]);
      // Last month has only the row from before midnight.
      expect(top(await board(s, "group", ownGroup, "month", lastMonth), 1)).toEqual([[1, "Board Delta", 90_000]]);
      // All-time has everything.
      expect(top(await board(s, "group", ownGroup, "all"), 1)).toEqual([[1, "Board Delta", 50_005 + 7 + 90_000]]);
    }, async (s) => {
      const { ids, post } = await fixture(s);
      await post(ids.d, 90_000, ownGroup, `${monthStart} - interval '1 second'`);
      await post(ids.d, 7, ownGroup, monthStart);
      // Keep the tie out of this test.
      await s.rows(`delete from points_ledger where student_id in ($1, $2)`, [ids.b, ids.c]);
    });
  });

  it("a student in two groups is ranked separately in each, and the centre counts everything", async () => {
    await as("manager", async (s) => {
      const own = await board(s, "group", ownGroup);
      const other = await board(s, "group", otherGroup);
      const centre = await board(s, "centre", null);
      expect(own[0]).toMatchObject({ display_name: "Board Alpha", points: 50_030, rank: 1 });
      // In the other group only that group's 3 points count.
      expect(other.find((row) => row.display_name === "Board Alpha")).toMatchObject({ points: 3 });
      expect(other[0].display_name).not.toBe("Board Alpha");
      // The centre board adds both groups and the points that belong to no group; reward rows are not earnings.
      expect(centre[0]).toMatchObject({ display_name: "Board Alpha", points: 50_030 + 3 + 40, rank: 1 });
    }, async (s) => {
      const { ids, post } = await fixture(s);
      await post(ids.a, 3, otherGroup);
      await post(ids.a, 40, null, "now()", "on_time_payment");
      await post(ids.a, -40_000, null, "now()", "reward_hold");
      // Someone in the other group with more than 3 points there.
      const [{ student_id }] = await s.rows<{ student_id: string }>(
        `select student_id from enrollments where group_id = $1 and status = 'active' and student_id <> $2 limit 1`,
        [otherGroup, ids.a],
      );
      await post(student_id, 900, otherGroup);
    });
  });

  it("a hidden student is flagged for staff, and left out of the TV before the places are counted", async () => {
    let token = "";
    await as("manager", async (s) => {
      expect(top(await board(s, "group", ownGroup), 4).map((row) => row[1])).toEqual(["Board Alpha", "Board Bravo", "Board Charlie", "Board Delta"]);
      expect((await board(s, "group", ownGroup))[1]).toMatchObject({ display_name: "Board Bravo", hidden: true, rank: 2 });

      const [{ tv }] = await s.rows<{ tv: { centre: unknown[]; groups: Array<{ name: string; rows: unknown[] }>; language: string } }>(
        `select public.tv_board($1) as tv`,
        [token],
      );
      // First name and last initial only; Bravo is gone and the others move up.
      expect(tv.centre.slice(0, 3)).toEqual([
        { name: "Board A.", points: 50_030, rank: 1 },
        { name: "Board C.", points: 50_012, rank: 2 },
        { name: "Board D.", points: 50_005, rank: 3 },
      ]);
      expect(tv.centre.length).toBeLessThanOrEqual(10);
      const group = tv.groups.find((g) => g.name === "IELTS 6.5")!;
      expect(group.rows.length).toBeLessThanOrEqual(5);
      expect(JSON.stringify(tv)).not.toMatch(/Bravo|B\.|\+998|Alpha/);
    }, async (s) => {
      const { ids } = await fixture(s);
      await s.rows(`update students set leaderboard_hidden = true where id = $1`, [ids.b]);
      [{ tv_token: token }] = await s.rows<{ tv_token: string }>(`select tv_token from points_settings`);
    });
  });

  it("the TV needs the current token: a wrong or old one gets nothing", async () => {
    let token = "";
    await as("anon", async (s) => {
      expect(await s.rows(`select public.tv_board('wrong') as tv, public.tv_token_ok('wrong') as ok`)).toEqual([{ tv: null, ok: false }]);
      expect(await s.rows(`select public.tv_board(null) as tv`)).toEqual([{ tv: null }]);
      const [{ ok, name }] = await s.rows<{ ok: boolean; name: string }>(
        `select public.tv_token_ok($1) as ok, public.tv_board($1) ->> 'centre_name' as name`,
        [token],
      );
      expect(ok).toBe(true);
      expect(name).not.toBe("");
      // Nothing else is open to a visitor.
      for (const table of ["points_settings", "points_ledger", "students", "student_points"]) {
        const result = await s.attempt(`select 1 from public.${table}`);
        expect(`${table}: ${result.ok ? result.rowCount : "denied"}`).toMatch(new RegExp(`^${table}: (0|denied)$`));
      }
      expect(code(await s.attempt(`select * from public.leaderboard('centre')`))).toBe(DENIED);
    }, async (s) => {
      [{ tv_token: token }] = await s.rows<{ tv_token: string }>(`select tv_token from points_settings`);
    });

    await as("owner", async (s) => {
      const [{ before }] = await s.rows<{ before: string }>(`select public.points_tv_token() as before`);
      const [{ fresh }] = await s.rows<{ fresh: string }>(`select public.regenerate_tv_token() as fresh`);
      expect(fresh).toMatch(/^[0-9a-f]{32}$/);
      expect(fresh).not.toBe(before);
      expect(await s.rows(`select public.tv_token_ok($1) as old, public.tv_token_ok($2) as new`, [before, fresh])).toEqual([{ old: false, new: true }]);
    });
  });

  it("only the owner reads or changes the token; a teacher sees the centre board and their own groups", async () => {
    await as("manager", async (s) => {
      expect(code(await s.attempt(`select tv_token from points_settings`))).toBe(DENIED);
      expect(code(await s.attempt(`select public.points_tv_token()`))).toBe(DENIED);
      expect(code(await s.attempt(`select public.regenerate_tv_token()`))).toBe(DENIED);
      expect(await s.rows(`select tv_language from points_settings`)).toEqual([{ tv_language: "uz" }]);
    });
    await as("teacher", async (s) => {
      expect(code(await s.attempt(`select tv_token from points_settings`))).toBe(DENIED);
      expect(code(await s.attempt(`select public.points_tv_token()`))).toBe(DENIED);
      expect((await board(s, "group", ownGroup)).length).toBeGreaterThan(0);
      expect((await board(s, "centre", null)).length).toBeGreaterThan(0);
      expect(code(await s.attempt(`select * from public.leaderboard('group', $1)`, [otherGroup]))).toBe(DENIED);
    });
  });
});
