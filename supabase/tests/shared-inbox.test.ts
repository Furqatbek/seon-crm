/**
 * The shared inbox — docs/SPEC.md → "Lead forms add-on → Shared inbox and
 * staff alerts". Take is atomic: of two people pressing it together exactly
 * one wins. Most tests are rolled back; the ones about simultaneous Takes
 * need two real connections and commits, and delete what they made.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, MANAGER_ID, OWNER_ID, TEACHER_USER_ID, admin, as, connect, disconnect, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);

const formId = async (s: Session, slug = "course-signup") => (await s.rows<{ id: string }>(`select id from lead_forms where slug = $1`, [slug]))[0].id;
/** A lead that came in through a form: it is in the inbox. */
const arrive = async (s: Session, phone: string, name = "Inbox Test") =>
  (
    await s.rows<{ lead_id: string }>(
      `select lead_id from public.intake_submit('form', $1, $2, $3, $4, null, null, null,
         '[{"id":"level","type":"radio","label":"Level","value":"Basic"}]'::jsonb, 'ru')`,
      [await formId(s), `visitor-${phone}`, name, phone],
    )
  )[0].lead_id;
const inbox = async (s: Session) => (await s.rows<{ id: string }>(`select id from public.lead_inbox()`)).map((row) => row.id);
const take = (s: Session, lead: string, assignTo?: string) =>
  s.rows<{ taken: boolean; assigned_to: string | null; assigned_name: string | null }>(
    `select taken, assigned_to, assigned_name from public.take_lead($1, $2)`,
    [lead, assignTo ?? null],
  );

let lead = "";
const oneLead = async (s: Session) => {
  lead = await arrive(s, "+998906660001");
};

describe.skipIf(!DB_URL)("Shared inbox", () => {
  beforeAll(connect);
  afterAll(disconnect);

  it("a lead from a form waits in the inbox with its form and answers; a lead typed in by staff does not", async () => {
    await as("manager", async (s) => {
      const rows = await s.rows<Record<string, unknown>>(`select full_name, phone, form_name, submitted_language, answers -> 0 ->> 'value' as answer, inbox_since is not null as since from public.lead_inbox() where id = $1`, [lead]);
      expect(rows).toEqual([{ full_name: "Inbox Test", phone: "+998906660001", form_name: "Course sign-up", submitted_language: "ru", answer: "Basic", since: true }]);
      const [{ id: typed }] = await s.rows<{ id: string }>(`insert into leads (full_name, phone, source, created_by) values ('Typed In', '+998906660002', 'phone_call', auth.uid()) returning id`);
      expect(await inbox(s)).not.toContain(typed);
    }, oneLead);
  });

  it("Take makes the lead yours, records when, and removes it from the inbox", async () => {
    await as("manager", async (s) => {
      expect(await take(s, lead)).toEqual([{ taken: true, assigned_to: MANAGER_ID, assigned_name: expect.any(String) }]);
      expect(await s.rows(`select assigned_to, taken_at is not null as dated, status, inbox_since is not null as kept from leads where id = $1`, [lead])).toEqual([
        { assigned_to: MANAGER_ID, dated: true, status: "new", kept: true },
      ]);
      expect(await inbox(s)).not.toContain(lead);
      // A second Take, even their own, changes nothing and says who has it.
      const again = await take(s, lead);
      expect(again).toMatchObject([{ taken: false, assigned_to: MANAGER_ID }]);
    }, oneLead);
  });

  it("the second of two Takes loses and sees who took it", async () => {
    await as("owner", async (s) => {
      const [{ full_name: manager }] = await s.rows<{ full_name: string }>(`select full_name from profiles where id = $1`, [MANAGER_ID]);
      expect(await take(s, lead)).toEqual([{ taken: false, assigned_to: MANAGER_ID, assigned_name: manager }]);
      expect((await s.rows<{ assigned_to: string }>(`select assigned_to from leads where id = $1`, [lead]))[0].assigned_to).toBe(MANAGER_ID);
    }, async (s) => {
      await oneLead(s);
      await s.rows(`select public.take_lead($1, $2)`, [lead, MANAGER_ID]);
    });
  });

  it("the owner assigns a lead to someone; a manager cannot assign to anyone but themselves", async () => {
    await as("owner", async (s) => {
      expect(await take(s, lead, MANAGER_ID)).toMatchObject([{ taken: true, assigned_to: MANAGER_ID }]);
    }, oneLead);
    await as("manager", async (s) => {
      expect(code(await s.attempt(`select public.take_lead($1, $2)`, [lead, OWNER_ID]))).toBe(DENIED);
      expect(await inbox(s)).toContain(lead);
      // Their own id is the same as leaving it out.
      expect(await take(s, lead, MANAGER_ID)).toMatchObject([{ taken: true, assigned_to: MANAGER_ID }]);
    }, oneLead);
  });

  it("nobody takes a lead for a teacher or a deactivated user, or a lead that is gone or not in the inbox", async () => {
    await as("owner", async (s) => {
      expect(code(await s.attempt(`select public.take_lead($1, $2)`, [lead, TEACHER_USER_ID]))).toBe("22023");
      expect(code(await s.attempt(`select public.take_lead(gen_random_uuid())`))).toBe("P0002");
      // A lead already moved on by hand is not in the inbox: nothing to take.
      await s.rows(`update leads set status = 'contacted' where id = $1`, [lead]);
      expect(await take(s, lead)).toMatchObject([{ taken: false, assigned_to: null }]);
    }, oneLead);
    await as("owner", async (s) => {
      expect(code(await s.attempt(`select public.take_lead($1, $2)`, [lead, MANAGER_ID]))).toBe("22023");
    }, async (s) => {
      await oneLead(s);
      await s.rows(`update profiles set is_active = false where id = $1`, [MANAGER_ID]);
    });
  });

  it("teachers and visitors have no inbox and take nothing", async () => {
    await as("teacher", async (s) => {
      expect(code(await s.attempt(`select * from public.lead_inbox()`))).toBe(DENIED);
      expect(code(await s.attempt(`select public.take_lead($1)`, [lead]))).toBe(DENIED);
      expect(await s.count("leads")).toBe(0);
    }, oneLead);
    await as("anon", async (s) => {
      expect(code(await s.attempt(`select * from public.lead_inbox()`))).toBe(DENIED);
      expect(code(await s.attempt(`select public.take_lead(gen_random_uuid())`))).toBe(DENIED);
    });
  });

  it("the same person sending a form again puts a taken lead back in the inbox, with a new waiting time", async () => {
    await admin(async (s) => {
      const id = await arrive(s, "+998906660003");
      await s.rows(`select public.take_lead($1, $2)`, [id, MANAGER_ID]);
      await s.rows(`update leads set inbox_since = now() - interval '2 hours', status = 'contacted' where id = $1`, [id]);
      expect(await inbox(s)).not.toContain(id);
      expect(await arrive(s, "+998906660003")).toBe(id);
      expect(await s.rows(`select assigned_to, taken_at, status, inbox_since > now() - interval '1 minute' as fresh from leads where id = $1`, [id])).toEqual([
        { assigned_to: null, taken_at: null, status: "new", fresh: true },
      ]);
      expect(await inbox(s)).toContain(id);
    });
  });

  it("a person's Telegram link code and chat are not readable through the API; they get their own link", async () => {
    await as("manager", async (s) => {
      expect(code(await s.attempt(`select staff_link_code from profiles`))).toBe(DENIED);
      expect(code(await s.attempt(`select telegram_chat_id from profiles`))).toBe(DENIED);
      expect(code(await s.attempt(`update profiles set telegram_chat_id = 1 where id = auth.uid()`))).toBe(DENIED);
      expect(code(await s.attempt(`update profiles set staff_link_code = 'x' where id = auth.uid()`))).toBe(DENIED);
      expect(await s.rows(`select code ~ '^[A-Za-z0-9]{22}$' as ok, linked from public.my_telegram_link()`)).toEqual([{ ok: true, linked: false }]);
      // Their own two switches are theirs to change; someone else's are not.
      expect(await s.attempt(`update profiles set alerts_on = false, alert_sound = false where id = auth.uid()`)).toMatchObject({ ok: true, rowCount: 1 });
      expect(await s.attempt(`update profiles set alerts_on = false where id = $1`, [OWNER_ID])).toMatchObject({ ok: true, rowCount: 0 });
      // What the rest of the app reads is still readable.
      expect(await s.count("profiles")).toBeGreaterThan(1);
    });
    await as("manager", async (s) => {
      expect(await s.rows(`select linked from public.my_telegram_link()`)).toEqual([{ linked: true }]);
      await s.rows(`select public.unlink_my_telegram()`);
      expect(await s.rows(`select linked from public.my_telegram_link()`)).toEqual([{ linked: false }]);
    }, async (s) => {
      await s.rows(`update profiles set telegram_chat_id = 777001 where id = $1`, [MANAGER_ID]);
    });
    await as("teacher", async (s) => {
      expect(await s.rows(`select * from public.my_telegram_link()`)).toEqual([]);
    });
  });

  it("every profile has a link code of its own", async () => {
    await admin(async (s) => {
      expect(await s.rows(`select count(*) = count(distinct staff_link_code) as distinct_codes, bool_and(alerts_on and alert_sound) as on_by_default from profiles`)).toEqual([
        { distinct_codes: true, on_by_default: true },
      ]);
    });
  });

  it("a message is for a student or for a member of staff, never both and never neither", async () => {
    await admin(async (s) => {
      const insert = (student: string | null, staff: string | null) =>
        s.attempt(
          `insert into messages (student_id, staff_id, lead_id, channel, type, recipient, body, dedupe_key)
           values ($1, $2, $3, 'telegram', 'staff_new_lead', '1', 'x', gen_random_uuid()::text)`,
          [student, staff, lead],
        );
      lead = await arrive(s, "+998906660004");
      const [{ id: student }] = await s.rows<{ id: string }>(`select id from students limit 1`);
      expect((await insert(null, OWNER_ID)).ok).toBe(true);
      expect((await insert(student, null)).ok).toBe(true);
      expect((await insert(null, null)).ok).toBe(false);
      expect((await insert(student, OWNER_ID)).ok).toBe(false);
    });
  });

  it("the funnel by form: views, leads, taken, won, conversion and the median time to Take", async () => {
    await as("manager", async (s) => {
      const month = `date_trunc('month', public.tashkent_today())::date`;
      const rows = await s.rows<Record<string, unknown>>(
        `select form_name, views, leads, taken, won, conversion, median_take_minutes from public.report_lead_forms(${month}, ${month}) where form_name = 'Report Form'`,
      );
      // 200 views; 5 leads; 3 taken after 10, 20 and 60 minutes → median 20; 1 won; 5 ÷ 200.
      expect(rows).toEqual([{ form_name: "Report Form", views: "200", leads: "5", taken: "3", won: "1", conversion: "2.5", median_take_minutes: "20.0" }]);
      // A form with nothing in the period still shows, with no conversion and no median.
      expect(
        await s.rows(`select views, leads, taken, conversion, median_take_minutes from public.report_lead_forms(${month}, ${month}) where form_name = 'Quiet Form'`),
      ).toEqual([{ views: "0", leads: "0", taken: "0", conversion: null, median_take_minutes: null }]);
    }, async (s) => {
      await s.rows(`insert into lead_forms (name, slug, draft) select 'Report Form', 'report-form', published from lead_forms where slug = 'consultation'`);
      await s.rows(`insert into lead_forms (name, slug, draft) select 'Quiet Form', 'quiet-report-form', published from lead_forms where slug = 'consultation'`);
      const id = await formId(s, "report-form");
      await s.rows(`insert into form_daily_stats (form_id, day, views) values ($1, public.tashkent_today(), 200), ($1, (date_trunc('month', public.tashkent_today()) - interval '1 day')::date, 999)`, [id]);
      await s.rows(
        `insert into leads (full_name, phone, source, form_id, inbox_since, taken_at, assigned_to)
         select 'Report ' || n, '+99890666010' || n, 'web_form', $1, now() - interval '3 hours',
                case n when 1 then now() - interval '3 hours' + interval '10 minutes'
                       when 2 then now() - interval '3 hours' + interval '20 minutes'
                       when 3 then now() - interval '3 hours' + interval '60 minutes' end,
                case when n <= 3 then $2::uuid end
         from generate_series(1, 5) n`,
        [id, MANAGER_ID],
      );
      await s.rows(`alter table leads disable trigger user`);
      await s.rows(`update leads set status = 'won' where phone = '+998906660101'`);
      await s.rows(`alter table leads enable trigger user`);
    });
    await as("teacher", async (s) => {
      expect(code(await s.attempt(`select * from public.report_lead_forms(date_trunc('month', public.tashkent_today())::date, date_trunc('month', public.tashkent_today())::date)`))).toBe(DENIED);
    });
  });

  it("leads are published to Realtime", async () => {
    await admin(async (s) => {
      expect(await s.rows(`select count(*)::int as n from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads'`)).toEqual([{ n: 1 }]);
    });
  });

  describe("two simultaneous Takes give one winner", () => {
    const PHONE_PREFIX = "+99890667";
    let one: pg.Client;
    let two: pg.Client;
    let setupDb: pg.Client;

    const make = async (n: number) => {
      const form = (await setupDb.query(`select id from lead_forms where slug = 'course-signup'`)).rows[0].id as string;
      const { rows } = await setupDb.query(`select lead_id from public.intake_submit('form', $1, $2, 'Race Test', $3)`, [form, `race-${n}-${Date.now()}`, `${PHONE_PREFIX}${String(n).padStart(4, "0")}`]);
      return rows[0].lead_id as string;
    };
    const takeAs = (db: pg.Client, id: string, who: string) => db.query(`select taken, assigned_to from public.take_lead($1, $2)`, [id, who]);

    beforeAll(async () => {
      [one, two, setupDb] = [0, 1, 2].map(() => new pg.Client({ connectionString: DB_URL }));
      await Promise.all([one.connect(), two.connect(), setupDb.connect()]);
    });
    afterAll(async () => {
      await setupDb.query(`delete from intake_log where lead_id in (select id from leads where phone like $1)`, [`${PHONE_PREFIX}%`]);
      await setupDb.query(`delete from leads where phone like $1`, [`${PHONE_PREFIX}%`]);
      await Promise.all([one.end(), two.end(), setupDb.end()]);
    });

    it("the second waits for the first, then finds the lead taken", async () => {
      const id = await make(1);
      await one.query("begin");
      expect((await takeAs(one, id, OWNER_ID)).rows).toEqual([{ taken: true, assigned_to: OWNER_ID }]);

      // The first has not committed: the second must wait, not win.
      let settled = false;
      const second = takeAs(two, id, MANAGER_ID).then((result) => {
        settled = true;
        return result.rows;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled).toBe(false);

      await one.query("commit");
      expect(await second).toEqual([{ taken: false, assigned_to: OWNER_ID }]);
      expect((await setupDb.query(`select assigned_to from leads where id = $1`, [id])).rows).toEqual([{ assigned_to: OWNER_ID }]);
    });

    it("if the first gives up, the second wins", async () => {
      const id = await make(2);
      await one.query("begin");
      await takeAs(one, id, OWNER_ID);
      const second = takeAs(two, id, MANAGER_ID).then((result) => result.rows);
      await new Promise((resolve) => setTimeout(resolve, 150));
      await one.query("rollback");
      expect(await second).toEqual([{ taken: true, assigned_to: MANAGER_ID }]);
    });

    it("fired at the same moment, twenty times: exactly one winner every time, and the lead is theirs", async () => {
      for (let round = 0; round < 20; round += 1) {
        const id = await make(100 + round);
        const [first, second] = await Promise.all([takeAs(one, id, OWNER_ID), takeAs(two, id, MANAGER_ID)]);
        const results = [first.rows[0], second.rows[0]] as Array<{ taken: boolean; assigned_to: string }>;
        expect(results.filter((row) => row.taken), `round ${round}`).toHaveLength(1);
        const winner = results.find((row) => row.taken)!.assigned_to;
        // Both were told the same name, and it is what the lead says.
        expect(results.map((row) => row.assigned_to)).toEqual([winner, winner]);
        expect((await setupDb.query(`select assigned_to, taken_at is not null as dated from leads where id = $1`, [id])).rows).toEqual([{ assigned_to: winner, dated: true }]);
      }
    });
  });
});
