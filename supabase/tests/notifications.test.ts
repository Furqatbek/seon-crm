/**
 * Notifications — who may write a message, what the reminders job reads,
 * and the cron job. docs/SPEC.md → "Notifications", "Roles and permissions".
 * Same setup as permissions.test.ts; every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, admin, as, connect, disconnect, studentId, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? `allowed (${result.rowCount})` : result.code);
const today = "public.tashkent_today()";

const insert = (s: Session, type: string, key: string, extra = "'queued', null") =>
  s.attempt(
    `insert into messages (student_id, channel, type, recipient, body, dedupe_key, status, sent_at)
     values ($1, 'sms', '${type}', '+998901234567', 'Test', $2, ${extra})`,
    [studentId(1), key],
  );

describe.skipIf(!DB_URL)("Notifications", () => {
  beforeAll(connect);
  afterAll(disconnect);

  describe("who may write a message", () => {
    it("a manager sends a one-off message and presses Remind, and nothing else", async () => {
      await as("manager", async (s) => {
        expect(code(await insert(s, "custom", "custom:t1"))).toBe("allowed (1)");
        expect(code(await insert(s, "payment_overdue", `remind:${studentId(1)}:2026-11-14`))).toBe("allowed (1)");
        // The job's own messages are not a manager's to write.
        expect(code(await insert(s, "payment_overdue", `payment_overdue:${studentId(1)}:2026-11:1`))).toBe(DENIED);
        expect(code(await insert(s, "payment_due", `remind:${studentId(1)}:x`))).toBe(DENIED);
        expect(code(await insert(s, "lesson_reminder", "remind:lesson"))).toBe(DENIED);
        expect(code(await insert(s, "payment_overdue", null as unknown as string))).toBe(DENIED);
      });
    });

    it("nobody signed in can mark a message sent, or change one afterwards", async () => {
      for (const who of ["owner", "manager"] as const) {
        await as(who, async (s) => {
          expect(code(await insert(s, "custom", "custom:t2", "'sent', now()"))).toBe(DENIED);
          expect(code(await insert(s, "custom", "custom:t3", "'skipped', null"))).toBe(DENIED);
          expect(code(await insert(s, "custom", "custom:t4"))).toBe("allowed (1)");
          expect(code(await s.attempt(`update messages set status = 'sent', sent_at = now() where dedupe_key = 'custom:t4'`))).toBe(DENIED);
          expect(code(await s.attempt(`delete from messages where dedupe_key = 'custom:t4'`))).toBe(DENIED);
        });
      }
    });

    it("the dedupe key lets a message exist once: Remind twice in a day is refused", async () => {
      await as("owner", async (s) => {
        const key = `remind:${studentId(1)}:2026-11-14`;
        expect(code(await insert(s, "payment_overdue", key))).toBe("allowed (1)");
        expect(code(await insert(s, "payment_overdue", key))).toBe("23505");
        expect(code(await insert(s, "payment_overdue", `remind:${studentId(1)}:2026-11-15`))).toBe("allowed (1)");
      });
    });

    it("a visitor reads and writes nothing", async () => {
      await as("anon", async (s) => {
        expect(code(await insert(s, "custom", "custom:t5"))).toBe(DENIED);
        expect(code(await s.attempt(`select * from messages`))).toBe(DENIED);
      });
    });
  });

  describe("what the reminders job reads", () => {
    it("is for the service role only", async () => {
      for (const who of ["owner", "manager", "anon"] as const) {
        await as(who, async (s) => {
          expect(code(await s.attempt(`select * from public.notify_debtors()`))).toBe(DENIED);
          expect(code(await s.attempt(`select * from public.notify_lessons(array[${today}])`))).toBe(DENIED);
          expect(code(await s.attempt(`select public.call_reminders_job()`))).toBe(DENIED);
        });
      }
    });

    it("notify_debtors lists every student who owes money, with the debt and the months billed", async () => {
      await admin(async (s) => {
        const rows = await s.rows<{ student_id: string; debt: string; charged_months: string[]; phone: string; language: string }>(
          `select student_id, debt, charged_months, phone, language from public.notify_debtors()`,
        );
        const expected = await s.rows<{ student_id: string; debt: string }>(
          `select b.student_id, (-b.balance)::text as debt from student_balances b join students st on st.id = b.student_id
           where b.balance < 0 and st.archived_at is null order by b.student_id`,
        );
        expect(rows.length).toBeGreaterThan(5);
        expect(rows.map((row) => ({ student_id: row.student_id, debt: row.debt }))).toEqual(expected);
        const [{ month }] = await s.rows<{ month: string }>(`select to_char(${today}, 'YYYY-MM') as month`);
        expect(rows.some((row) => row.charged_months.includes(month))).toBe(true);
        expect(rows.every((row) => /^\+998\d{9}$/.test(row.phone) && ["uz", "ru", "en"].includes(row.language))).toBe(true);
        // Only the last two billing months are of interest to the job.
        expect(rows.every((row) => row.charged_months.length <= 2)).toBe(true);
      });
    });

    it("notify_lessons lists scheduled lessons with the active students who have Telegram", async () => {
      await admin(async (s) => {
        const [lesson] = await s.rows<{ id: string; group_id: string; day: string }>(
          `select l.id, l.group_id, l.lesson_date::text as day from lessons l
           where l.status = 'scheduled' and l.lesson_date > ${today} order by l.lesson_date limit 1`,
        );
        const before = await s.rows(`select * from public.notify_lessons(array[$1::date]) where lesson_id = $2`, [lesson.day, lesson.id]);
        // Link two of the group's active students, one of them paused.
        const students = await s.rows<{ id: string }>(
          `select st.id from enrollments e join students st on st.id = e.student_id
           where e.group_id = $1 and e.status = 'active' and st.status = 'active' and st.archived_at is null
             and st.telegram_chat_id is null limit 2`,
          [lesson.group_id],
        );
        expect(students).toHaveLength(2);
        await s.rows(`update students set telegram_chat_id = 990000100 where id = any($1)`, [students.map((row) => row.id)]);
        await s.rows(`update students set status = 'paused' where id = $1`, [students[1].id]);
        const after = await s.rows<{ student_id: string; telegram_chat_id: string; start_time: string }>(
          `select student_id, telegram_chat_id, start_time::text from public.notify_lessons(array[$1::date]) where lesson_id = $2`,
          [lesson.day, lesson.id],
        );
        expect(after.length).toBe(before.length + 1);
        expect(after.map((row) => row.student_id)).toContain(students[0].id);
        expect(after.map((row) => row.student_id)).not.toContain(students[1].id);

        // A cancelled lesson has no reminders.
        await s.rows(`update lessons set status = 'cancelled', cancel_reason = 'Test' where id = $1`, [lesson.id]);
        expect(await s.rows(`select 1 from public.notify_lessons(array[$1::date]) where lesson_id = $2`, [lesson.day, lesson.id])).toEqual([]);
      });
    });
  });

  describe("the cron job", () => {
    it("runs every 15 minutes", async () => {
      await admin(async (s) => {
        expect(
          await s.rows(`select schedule, command from cron.job where jobname = 'reminders-every-15-minutes'`),
        ).toEqual([{ schedule: "*/15 * * * *", command: "select public.call_reminders_job()" }]);
      });
    });

    it("does nothing until the app URL and the cron secret are in Vault, then posts with the secret", async () => {
      await admin(async (s) => {
        await s.rows(`delete from vault.secrets where name in ('app_url', 'cron_secret')`);
        expect(await s.rows(`select public.call_reminders_job() as id`)).toEqual([{ id: null }]);
        await s.rows(`select vault.create_secret('https://crm.example.uz/', 'app_url')`);
        expect(await s.rows(`select public.call_reminders_job() as id`)).toEqual([{ id: null }]);
        await s.rows(`select vault.create_secret('s3cret', 'cron_secret')`);
        const [{ id }] = await s.rows<{ id: string | null }>(`select public.call_reminders_job() as id`);
        expect(id).not.toBeNull();
        // The request waits in pg_net's queue: the right URL, and the secret as a bearer token.
        expect(
          await s.rows(`select url, headers->>'Authorization' as auth, method from net.http_request_queue where id = $1`, [id]),
        ).toEqual([{ url: "https://crm.example.uz/api/jobs/reminders", auth: "Bearer s3cret", method: "POST" }]);
      });
    });
  });
});
