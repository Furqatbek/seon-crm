/**
 * Points reports — docs/SPEC.md → "Points and rewards add-on → Screens →
 * Reports → Points tab". The report's totals must equal sums taken straight
 * from points_ledger, and a teacher's figures must match their own History.
 * Every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, TEACHER_USER_ID, admin, as, connect, disconnect, teacherId, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);
const TEACHER = teacherId(2);
const month = `date_trunc('month', public.tashkent_today())::date`;
const lastMonth = `(date_trunc('month', public.tashkent_today()) - interval '1 month')::date`;
const args = `${month}, ${month}`;
const inMonth = `created_at >= (${month}::timestamp at time zone 'Asia/Tashkent') and created_at < ((${month} + interval '1 month')::timestamp at time zone 'Asia/Tashkent')`;
const REWARD = `source in ('reward_hold', 'reward_return')`;
const DEDUCTED = `(source = 'teacher_deduction' or (source = 'owner_adjustment' and delta < 0))`;

let ownGroup: string; // IELTS 6.5, taught by the teacher login
let otherGroup: string;

const one = async <T>(s: Session, sql: string, params: unknown[] = []) => (await s.rows<T>(sql, params))[0];
const ledgerSum = async (s: Session, where: string) =>
  (await one<{ n: number }>(s, `select coalesce(sum(delta), 0)::int as n from points_ledger where ${inMonth} and ${where}`)).n;

/** A month with every kind of row: attendance is seeded; this adds awards, deductions, an adjustment and a reward. */
async function fixture(s: Session) {
  await s.rows(`update points_settings set enabled = true`);
  const [{ id: student }] = await s.rows<{ id: string }>(
    `insert into students (full_name, phone) values ('Report Test', '+998907770002') returning id`,
  );
  await s.rows(`insert into enrollments (group_id, student_id, joined_on) values ($1, $2, public.tashkent_today() - 30)`, [ownGroup, student]);
  const post = (delta: number, source: string, group: string | null, by: string | null, key: string | null = null) =>
    s.rows(
      `insert into points_ledger (student_id, delta, source, group_id, reason, created_by, dedupe_key) values ($1, $2, $3, $4, 'Test', $5, $6)`,
      [student, delta, source, group, by, key],
    );
  await post(5, "teacher_award", ownGroup, TEACHER_USER_ID);
  await post(4, "teacher_award", ownGroup, TEACHER_USER_ID);
  await post(-4, "teacher_award", ownGroup, TEACHER_USER_ID, "undo:report-test"); // the 4 was undone
  await post(-3, "teacher_deduction", ownGroup, TEACHER_USER_ID);
  await post(10, "on_time_payment", null, null);
  await post(30, "owner_adjustment", null, null);
  await post(-6, "owner_adjustment", null, null);
  const [{ id: reward }] = await s.rows<{ id: string }>(`insert into rewards (name, cost, stock) values ('Report reward', 20, 5) returning id`);
  const [{ id: redemption }] = await s.rows<{ id: string }>(
    `insert into redemptions (student_id, reward_id, cost, status, via, requested_by, handled_at) values ($1, $2, 20, 'given', 'desk', 'staff', now()) returning id`,
    [student, reward],
  );
  await s.rows(`insert into points_ledger (student_id, delta, source, redemption_id, reason) values ($1, -20, 'reward_hold', $2, 'Report reward')`, [student, redemption]);
  // Last month has a row too: it must stay out of this month's report.
  await s.rows(
    `insert into points_ledger (student_id, delta, source, group_id, reason, created_at) values ($1, 7000, 'owner_adjustment', $2, 'Old', (${month}::timestamp at time zone 'Asia/Tashkent') - interval '1 second')`,
    [student, ownGroup],
  );
  return student;
}

describe.skipIf(!DB_URL)("Points reports", () => {
  beforeAll(async () => {
    await connect();
    await admin(async (s) => {
      const groups = await s.rows<{ id: string; name: string; teacher_id: string }>(`select id, name, teacher_id from groups where status = 'active' and archived_at is null`);
      ownGroup = groups.find((g) => g.name === "IELTS 6.5")!.id;
      otherGroup = groups.find((g) => g.teacher_id !== TEACHER)!.id;
    });
  });
  afterAll(disconnect);

  it("the KPIs equal sums taken from points_ledger for the same period", async () => {
    await as("owner", async (s) => {
      const kpis = await one<{ earned: number; deducted: number; spent: number; unspent: number; rewards_given: number; students_without_points: number }>(
        s,
        `select earned::int, deducted::int, spent::int, unspent::int, rewards_given, students_without_points from public.report_points_kpis(${args})`,
      );
      expect(kpis.earned).toBe(await ledgerSum(s, `not ${REWARD} and not ${DEDUCTED}`));
      expect(kpis.deducted).toBe(-(await ledgerSum(s, DEDUCTED)));
      expect(kpis.spent).toBe(-(await ledgerSum(s, REWARD)));
      // Earned minus deducted is everything the leaderboards count.
      expect(kpis.earned - kpis.deducted).toBe(await ledgerSum(s, `not ${REWARD}`));
      // The fixture alone: 5 + 4 − 4 + 10 + 30 earned on top of attendance; 3 + 6 deducted; 20 spent.
      expect(kpis.deducted).toBe(9);
      expect(kpis.spent).toBe(20);
      expect(kpis.rewards_given).toBe(1);
      // Unspent is every point in the ledger today, whatever the period and whoever holds it.
      const unspent = await one<{ n: number }>(s, `select coalesce(sum(delta), 0)::int as n from points_ledger`);
      expect(kpis.unspent).toBe(unspent.n);
      const without = await one<{ n: number }>(
        s,
        `select count(*)::int as n from students st where st.status = 'active' and st.archived_at is null
           and not exists (select 1 from points_ledger l where l.student_id = st.id and ${inMonth.replace(/created_at/g, "l.created_at")}
                             and l.delta > 0 and not (l.source in ('reward_hold', 'reward_return')) and l.source <> 'teacher_deduction')`,
      );
      expect(kpis.students_without_points).toBe(without.n);
    }, async (s) => void (await fixture(s)));
  });

  it("each chart adds up to the same ledger", async () => {
    let student = "";
    await as("manager", async (s) => {
      // 1. By source: the sources add up to Earned, month by month.
      const sources = await s.rows<{ month: string; source: string; points: number }>(
        `select month::text, source, points::int from public.report_points_by_source(${args})`,
      );
      expect(sources.reduce((sum, row) => sum + row.points, 0)).toBe(await ledgerSum(s, `not ${REWARD} and not ${DEDUCTED}`));
      expect(new Set(sources.map((row) => row.month)).size).toBe(1);
      for (const row of sources) expect(row.points).toBe(await ledgerSum(s, `source = '${row.source}' and not ${DEDUCTED}`));
      expect(sources.map((row) => row.source)).not.toContain("reward_hold");
      expect(sources.find((row) => row.source === "teacher_award")?.points).toBe(5);

      // 2. By teacher: awards and deductions, undone ones taken out.
      expect(await s.rows(`select teacher_name, awards::int, deductions::int from public.report_points_by_teacher(${args})`)).toEqual([
        { teacher_name: "Nodira Saidova", awards: 5, deductions: 3 },
      ]);

      // 3. Top students: at most ten, each with what the ledger says they earned net.
      const top = await s.rows<{ student_id: string; points: number }>(`select student_id, points::int from public.report_points_top_students(${args})`);
      expect(top.length).toBeLessThanOrEqual(10);
      // The test student earned 36 net; whether that makes the top ten depends on the others.
      const mine = top.find((row) => row.student_id === student);
      if (mine) expect(mine.points).toBe(5 + 4 - 4 - 3 + 10 + 30 - 6);
      expect(await ledgerSum(s, `student_id = '${student}' and not ${REWARD}`)).toBe(36);
      for (const row of top) expect(row.points).toBe(await ledgerSum(s, `student_id = '${row.student_id}' and not ${REWARD}`));
      expect(top.map((row) => row.points)).toEqual([...top.map((row) => row.points)].sort((a, b) => b - a));

      // 4. Rewards given.
      expect(await s.rows(`select reward_name, given, points::int from public.report_rewards_given(${args})`)).toEqual([
        { reward_name: "Report reward", given: 1, points: 20 },
      ]);

      // 5. By group: the group's points over the students enrolled now.
      const groups = await s.rows<{ group_id: string; students: number; points: number; average: string }>(
        `select group_id, students, points::int, average::text from public.report_points_by_group(${args})`,
      );
      for (const row of groups) {
        expect(row.points).toBe(await ledgerSum(s, `group_id = '${row.group_id}' and not ${REWARD}`));
        expect(Number(row.average)).toBeCloseTo(row.points / row.students, 1);
      }
      expect(groups.find((row) => row.group_id === ownGroup)).toBeDefined();

      // Last month's 7 000 is in last month's report, not this one.
      const before = await one<{ earned: number }>(s, `select earned::int from public.report_points_kpis(${lastMonth}, ${lastMonth})`);
      expect(before.earned).toBeGreaterThanOrEqual(7000);
    }, async (s) => {
      student = await fixture(s);
    });
  });

  it("awards per teacher match that teacher's History", async () => {
    await as("teacher", async (s) => {
      const [student] = await s.rows<{ student_id: string }>(`select student_id from public.group_month_points($1) limit 1`, [ownGroup]);
      const give = (points: number, reason: string) =>
        s.rows<{ ledger_id: string }>(`select ledger_id from public.award_points($1, $2, $3, null, $4)`, [student.student_id, ownGroup, points, reason]);
      await give(5, "Olympiad");
      const [mistake] = await give(4, "Mistake");
      await s.rows(`select public.undo_points($1)`, [mistake.ledger_id]);
      await give(-3, "Phone");

      const history = await s.rows<{ delta: number }>(`select delta from public.teacher_points_history()`);
      const report = await s.rows<{ user_id: string; awards: number; deductions: number }>(
        `select user_id, awards::int, deductions::int from public.report_points_by_teacher(${args})`,
      );
      // A teacher sees only themselves.
      expect(report).toEqual([{ user_id: TEACHER_USER_ID, awards: 5, deductions: 3 }]);
      // History lists every row, the undone one and its undo too: together they come to awards − deductions.
      expect(history.map((row) => row.delta).sort((a, b) => a - b)).toEqual([-4, -3, 4, 5]);
      expect(history.reduce((sum, row) => sum + row.delta, 0)).toBe(report[0].awards - report[0].deductions);
    }, async (s) => {
      await s.rows(`update points_settings set enabled = true`);
      await s.rows(`delete from points_ledger where created_by = $1`, [TEACHER_USER_ID]);
    });
  });

  it("a teacher gets the same report narrowed to their own groups", async () => {
    await as("teacher", async (s) => {
      // The ledger is closed to a teacher: these come from the report only.
      const kpis = await one<{ earned: number; deducted: number; spent: number | null; unspent: number | null; rewards_given: number | null }>(
        s,
        `select earned::int, deducted::int, spent::int, unspent::int, rewards_given from public.report_points_kpis(${args})`,
      );
      const groups = await s.rows<{ group_id: string; points: number }>(`select group_id, points::int from public.report_points_by_group(${args})`);
      const top = await s.rows<{ student_name: string; points: number }>(`select student_name, points::int from public.report_points_top_students(${args})`);
      expect(groups.map((row) => row.group_id)).toContain(ownGroup);
      expect(groups.map((row) => row.group_id)).not.toContain(otherGroup);
      // Only points that count for their groups: the 10 and the 30 − 6 with no group are left out.
      expect(kpis.earned - kpis.deducted).toBe(groups.reduce((sum, row) => sum + row.points, 0));
      expect(kpis.deducted).toBe(3);
      // Spending and balances belong to no group: a teacher's report has none of them,
      // however many points their students hold or spent elsewhere.
      expect([kpis.spent, kpis.unspent, kpis.rewards_given]).toEqual([null, null, null]);
      expect(await s.rows(`select * from public.report_rewards_given(${args})`)).toEqual([]);
      expect(top.find((row) => row.student_name === "Report Test")).toEqual({ student_name: "Report Test", points: 5 + 4 - 4 - 3 });
      const read = await s.attempt(`select 1 from points_ledger`);
      expect(read.ok ? read.rowCount : 0).toBe(0);
    }, async (s) => void (await fixture(s)));

    // What the owner sees for those groups is the same number.
    await as("owner", async (s) => {
      const own = await s.rows<{ id: string }>(`select id from groups where teacher_id = $1 and archived_at is null and status in ('active', 'forming')`, [TEACHER]);
      const all = await s.rows<{ group_id: string; points: number }>(`select group_id, points::int from public.report_points_by_group(${args})`);
      for (const group of own) {
        const row = all.find((entry) => entry.group_id === group.id);
        if (row) expect(row.points).toBe(await ledgerSum(s, `group_id = '${group.id}' and not ${REWARD}`));
      }
    }, async (s) => void (await fixture(s)));
  });

  it("is closed to visitors, and a period must be whole months", async () => {
    await as("anon", async (s) => {
      for (const name of ["kpis", "by_source", "by_teacher", "top_students", "by_group"]) {
        expect(code(await s.attempt(`select * from public.report_points_${name}(${args})`)), name).toBe(DENIED);
      }
      expect(code(await s.attempt(`select * from public.report_rewards_given(${args})`))).toBe(DENIED);
      expect(code(await s.attempt(`select * from public.report_points_rows(${args})`))).toBe(DENIED);
      expect(code(await s.attempt(`select * from public.report_points_students()`))).toBe(DENIED);
    });
    await as("manager", async (s) => {
      expect(code(await s.attempt(`select * from public.report_points_kpis(${month} + 1, ${month})`))).toBe("ER001");
      expect(code(await s.attempt(`select * from public.report_points_by_group(${month}, ${lastMonth})`))).toBe("ER001");
      expect(code(await s.attempt(`select * from public.report_points_rows(${args})`))).toBe(DENIED);
    });
  });
});
