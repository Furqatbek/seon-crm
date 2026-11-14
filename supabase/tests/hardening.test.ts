/**
 * The gaps the whole-app review found against docs/SPEC.md, each pinned by a
 * test. Same setup as permissions.test.ts; every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, admin, as, connect, disconnect, groupId, teacherId, type Attempt } from "./helpers";

const code = (result: Attempt) => (result.ok ? `allowed (${result.rowCount})` : result.code);
const today = "public.tashkent_today()";
const month = `date_trunc('month', ${today})::date`;

describe.skipIf(!DB_URL)("Hardening", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("a forming group starts on its start date", () => {
    it("becomes active when its day comes, and is then billed", async () => {
      await as(
        "owner",
        async (s) => {
          const [group] = await s.rows<{ id: string }>(
            `insert into groups (name, subject, teacher_id, monthly_fee, days, start_time, start_date, status)
             values ('Starts later', 'English', $1, 500000, '{1,3,5}', '18:00', ${today} + 3, 'forming') returning id`,
            [teacherId(1)],
          );
          await s.rows(
            `insert into enrollments (group_id, student_id, joined_on)
             select $1, id, ${today} + 3 from students where status = 'active' and archived_at is null limit 2`,
            [group.id],
          );
          // Not yet: the start date is ahead.
          await s.rows(`select public.activate_started_groups()`);
          expect(await s.rows(`select status from groups where id = $1`, [group.id])).toEqual([{ status: "forming" }]);
          expect(await s.rows(`select 1 from public.preview_monthly_charges(${month}) where group_name = 'Starts later'`)).toEqual([]);

          // The day comes.
          await s.rows(`update groups set start_date = ${today} where id = $1`, [group.id]);
          await s.rows(`update enrollments set joined_on = ${today} where group_id = $1`, [group.id]);
          expect(await s.rows(`select public.activate_started_groups() as n`)).toEqual([{ n: 1 }]);
          expect(await s.rows(`select status from groups where id = $1`, [group.id])).toEqual([{ status: "active" }]);
          expect((await s.rows(`select 1 from public.preview_monthly_charges(${month}) where group_name = 'Starts later'`)).length).toBe(2);
          // Running it again changes nothing.
          expect(await s.rows(`select public.activate_started_groups() as n`)).toEqual([{ n: 0 }]);
        },
      );
    });

    it("leaves archived and finished groups alone, runs daily, and is not a manager's to call", async () => {
      await admin(async (s) => {
        await s.rows(
          `insert into groups (name, subject, teacher_id, monthly_fee, days, start_time, start_date, status, archived_at)
           values ('Archived forming', 'English', $1, 500000, '{1}', '18:00', ${today} - 5, 'forming', now())`,
          [teacherId(1)],
        );
        await s.rows(`update groups set status = 'finished', end_date = ${today} where id = $1`, [groupId(2)]);
        await s.rows(`select public.activate_started_groups()`);
        expect(await s.rows(`select status from groups where name = 'Archived forming'`)).toEqual([{ status: "forming" }]);
        expect(await s.rows(`select status from groups where id = $1`, [groupId(2)])).toEqual([{ status: "finished" }]);
        expect(await s.rows(`select schedule from cron.job where jobname = 'activate-groups-daily'`)).toEqual([{ schedule: "5 19 * * *" }]);
      });
      expect(code(await as("manager", (s) => s.attempt(`select public.activate_started_groups()`)))).toBe(DENIED);
    });
  });

  describe("the centre name", () => {
    it("is readable before sign-in, and nothing else of the settings is", async () => {
      await as("anon", async (s) => {
        expect(await s.rows(`select public.centre_name() as name`)).toEqual([{ name: "Ziyo oʻquv markazi" }]);
        expect(code(await s.attempt(`select * from centre_settings`))).toBe(DENIED);
      });
    });
  });

  describe("a manager cannot get around the 7-day attendance window", () => {
    it("by moving an old lesson's date; the owner can move a lesson", async () => {
      const old = `(select id from lessons where lesson_date < ${today} - 30 and status = 'held' order by lesson_date limit 1)`;
      await as("manager", async (s) => {
        expect(code(await s.attempt(`update lessons set lesson_date = ${today} where id = ${old}`))).toBe(DENIED);
        expect(code(await s.attempt(`update lessons set group_id = $1 where id = ${old}`, [groupId(9)]))).toBe(DENIED);
        // Still theirs: a substitute teacher, cancelling.
        expect(code(await s.attempt(`update lessons set teacher_id = $1 where id = ${old}`, [teacherId(2)]))).toBe("allowed (1)");
        expect(
          code(await s.attempt(`update lessons set status = 'cancelled', cancel_reason = 'Test' where id = (select id from lessons where lesson_date > ${today} order by lesson_date limit 1)`)),
        ).toBe("allowed (1)");
        // And the old lesson's attendance stays closed to them.
        expect(code(await s.attempt(`update attendance set status = 'present', marked_by = auth.uid() where lesson_id = ${old}`))).toBe("allowed (0)");
      });
      await as("owner", async (s) => {
        expect(code(await s.attempt(`update lessons set lesson_date = lesson_date + 400 where id = ${old}`))).toBe("allowed (1)");
      });
    });

    it("a schedule change still rebuilds a manager's future lessons", async () => {
      await as("manager", async (s) => {
        const before = await s.rows<{ n: number }>(`select count(*)::int as n from lessons where group_id = $1 and lesson_date > ${today} and status = 'scheduled'`, [groupId(3)]);
        expect(code(await s.attempt(`update groups set start_time = '07:15' where id = $1`, [groupId(3)]))).toBe("allowed (1)");
        const after = await s.rows<{ n: number; t: string }>(
          `select count(*)::int as n, min(start_time)::text as t from lessons where group_id = $1 and lesson_date > ${today} and status = 'scheduled'`,
          [groupId(3)],
        );
        expect(after[0].n).toBeGreaterThan(0);
        expect(after[0].n).toBe(before[0].n);
        expect(after[0].t).toBe("07:15:00");
      });
    });
  });

  describe("reports leave out attendance on cancelled lessons", () => {
    it("so the report agrees with the group page after a marked lesson is cancelled", async () => {
      await as("owner", async (s) => {
        const rate = async () =>
          (await s.rows<{ rate: number; absent: number }>(
            `select rate::float8 as rate, absent from public.report_attendance(${month}, ${month}) where group_id = $1`,
            [groupId(1)],
          ))[0];
        const kpi = async () =>
          (await s.rows<{ r: number }>(`select attendance_rate::float8 as r from public.report_kpis(${month}, ${month})`))[0].r;
        const before = await rate();
        const kpiBefore = await kpi();
        // A lesson is marked with everyone absent, then cancelled as a mistake.
        const [lesson] = await s.rows<{ id: string; n: number }>(
          `with l as (select id from lessons where group_id = $1 and status = 'held' and lesson_date >= ${month} order by lesson_date limit 1),
                u as (update attendance set status = 'absent', marked_by = auth.uid() where lesson_id = (select id from l) returning 1)
           select (select id from l) as id, (select count(*)::int from u) as n`,
          [groupId(1)],
        );
        expect(lesson.n).toBeGreaterThan(0);
        const wrong = await rate();
        const kpiWrong = await kpi();
        expect(wrong.rate).toBeLessThan(before.rate);
        expect(kpiWrong).toBeLessThan(kpiBefore);

        await s.rows(`update lessons set status = 'cancelled', cancel_reason = 'Marked by mistake' where id = $1`, [lesson.id]);
        const after = await rate();
        // The cancelled lesson's marks no longer count, in the chart or the KPI.
        expect(after.rate).toBeGreaterThan(wrong.rate);
        expect(await kpi()).toBeGreaterThan(kpiWrong);
        // The same lessons the group page counts.
        const [page] = await s.rows<{ rate: number }>(
          `select round(100.0 * count(*) filter (where a.status in ('present', 'late'))
                    / nullif(count(*) filter (where a.status <> 'excused'), 0), 1)::float8 as rate
           from attendance a join lessons l on l.id = a.lesson_id
           where l.group_id = $1 and l.status <> 'cancelled' and l.lesson_date >= ${month} and l.lesson_date < (${month} + interval '1 month')::date`,
          [groupId(1)],
        );
        expect(after.rate).toBe(page.rate);
      });
    });
  });

  describe("message templates come with the schema", () => {
    it("every type, channel and language is there, and SMS texts are plain Latin where they can be", async () => {
      await admin(async (s) => {
        expect(await s.rows(`select count(*)::int as n, count(distinct (type, channel, language))::int as distinct_n from message_templates`)).toEqual([{ n: 24, distinct_n: 24 }]);
        const sms = await s.rows<{ language: string; body: string }>(`select language, body from message_templates where channel = 'sms' and language in ('uz', 'en')`);
        expect(sms.every((row) => /^[\x20-\x7E]+$/.test(row.body))).toBe(true);
        const telegram = await s.rows<{ body: string }>(`select body from message_templates where channel = 'telegram' and language = 'uz' and type = 'payment_due'`);
        expect(telegram[0].body).toContain("toʻlovi");
      });
    });
  });
});
