/**
 * Public lead forms — docs/SPEC.md → "Lead forms add-on": "Defaults to confirm"
 * (rate limits, duplicates), "Data model additions". Who may read and edit
 * forms, and what intake_submit() does. Every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, admin, as, connect, disconnect, type Session } from "./helpers";

const TABLES = ["lead_forms", "lead_form_versions", "form_assets", "form_daily_stats", "intake_log"];
const FUNCTIONS = [
  `select public.public_form('course-signup')`,
  `select public.form_count_view((select id from lead_forms limit 1))`,
  `select * from public.intake_submit('form', gen_random_uuid(), 'x', 'A', '+998901112233')`,
  `select public.intake_reject('form', null, 'spam', 'x', 'x')`,
];

const formId = async (s: Session, slug = "course-signup") =>
  (await s.rows<{ id: string }>(`select id from lead_forms where slug = $1`, [slug]))[0].id;

type Sent = { outcome: string; lead_id: string | null };
const submit = async (s: Session, form: string, phone: string, visitor: string | null = "visitor-1", name = "Form Test") =>
  (
    await s.rows<Sent>(
      `select outcome, lead_id from public.intake_submit('form', $1, $2, $3, $4, null, 'Evening', 'Hello',
         '[{"id":"level","type":"radio","label":"Ваш уровень сейчас","value":"Начальный"}]'::jsonb, 'ru')`,
      [form, visitor, name, phone],
    )
  )[0];
const outcomes = async (s: Session, form: string) =>
  (await s.rows<{ outcome: string }>(`select outcome from intake_log where form_id = $1 order by received_at, id`, [form])).map((row) => row.outcome).sort();

describe.skipIf(!DB_URL)("Public lead forms", () => {
  beforeAll(connect);
  afterAll(disconnect);

  it("the three templates are seeded, live and published as version 1", async () => {
    await admin(async (s) => {
      expect(
        await s.rows(
          `select f.slug, f.status, f.published_version, f.published = f.draft as same, v.version, v.content = f.published as kept
           from lead_forms f join lead_form_versions v on v.form_id = f.id order by f.slug`,
        ),
      ).toEqual([
        { slug: "consultation", status: "live", published_version: 1, same: true, version: 1, kept: true },
        { slug: "course-signup", status: "live", published_version: 1, same: true, version: 1, kept: true },
        { slug: "free-trial", status: "live", published_version: 1, same: true, version: 1, kept: true },
      ]);
    });
  });

  it("nobody without a login reads any table or calls any function; a teacher sees nothing", async () => {
    await as("anon", async (s) => {
      for (const table of TABLES) expect(await s.attempt(`select * from ${table}`), table).toMatchObject({ ok: false, code: DENIED });
      expect(await s.attempt(`select answers, tags from leads`)).toMatchObject({ ok: false, code: DENIED });
      for (const call of FUNCTIONS) expect(await s.attempt(call), call).toMatchObject({ ok: false, code: DENIED });
    });
    await as("teacher", async (s) => {
      for (const table of TABLES) expect(await s.count(table), table).toBe(0);
      expect(await s.attempt(`insert into lead_forms (name, slug, draft) values ('T', 'teacher-form', '{}')`)).toMatchObject({ ok: false, code: DENIED });
      for (const call of FUNCTIONS) expect(await s.attempt(call), call).toMatchObject({ ok: false, code: DENIED });
    });
  });

  it("the owner and managers read and edit forms; only the owner archives; signed-in staff cannot call the intake", async () => {
    for (const who of ["owner", "manager"] as const) {
      await as(who, async (s) => {
        expect(await s.count("lead_forms")).toBe(3);
        const made = await s.attempt(`insert into lead_forms (name, slug, draft) values ('Autumn', 'ielts-autumn', '{"fields":[]}') returning status, created_by = auth.uid() as mine`);
        expect(made).toMatchObject({ ok: true, rows: [{ status: "draft", mine: true }] });
        expect(await s.attempt(`update lead_forms set name = 'Autumn 2', draft = '{"fields":[1]}' where slug = 'ielts-autumn'`)).toMatchObject({ ok: true, rowCount: 1 });
        expect(await s.attempt(`update lead_forms set archived_at = now() where slug = 'ielts-autumn'`)).toMatchObject(
          who === "owner" ? { ok: true } : { ok: false, code: DENIED },
        );
        expect((await s.attempt(`delete from lead_forms where slug = 'ielts-autumn'`)).ok).toBe(false);
        for (const call of FUNCTIONS) expect(await s.attempt(call), call).toMatchObject({ ok: false, code: DENIED });
      });
    }
  });

  it("a slug is lowercase Latin letters, digits and hyphens, not a reserved word, and unique", async () => {
    await admin(async (s) => {
      const make = (slug: string) => s.attempt(`insert into lead_forms (name, slug, draft) values ('X', $1, '{}')`, [slug]);
      for (const bad of ["Api", "api", "admin", "uz", "form", "a", "with space", "kurs_1", "-start", "end-", "double--dash", "кириллица"]) {
        expect((await make(bad)).ok, bad).toBe(false);
      }
      expect((await make("ielts-autumn-2026")).ok).toBe(true);
      expect((await make("ielts-autumn-2026")).ok).toBe(false);
      // Live needs something published.
      expect((await s.attempt(`update lead_forms set status = 'live' where slug = 'ielts-autumn-2026'`)).ok).toBe(false);
    });
  });

  it("the public page gets the published document only, and nothing for a draft or an archived form", async () => {
    await admin(async (s) => {
      await s.rows(`update lead_forms set draft = '{"secret":"draft"}' where slug = 'free-trial'`);
      const [{ form }] = await s.rows<{ form: Record<string, unknown> }>(`select public.public_form('free-trial') as form`);
      expect(form).toMatchObject({ slug: "free-trial", status: "live", version: 1, assets: {} });
      expect(JSON.stringify(form)).not.toContain("secret");
      expect((form.document as { texts: { title: { ru: string } } }).texts.title.ru).toBe("Бесплатный пробный урок");

      await s.rows(`update lead_forms set status = 'closed' where slug = 'free-trial'`);
      expect((await s.rows<{ status: string }>(`select public.public_form('free-trial') ->> 'status' as status`))[0].status).toBe("closed");
      await s.rows(`update lead_forms set archived_at = now() where slug = 'free-trial'`);
      await s.rows(`insert into lead_forms (name, slug, draft) values ('Draft', 'only-a-draft', '{}')`);
      for (const slug of ["free-trial", "only-a-draft", "no-such-form"]) {
        expect((await s.rows<{ form: unknown }>(`select public.public_form($1) as form`, [slug]))[0].form, slug).toBe(null);
      }
    });
  });

  it("a submission creates an unassigned new lead with the form, answers, language, source and tags", async () => {
    await admin(async (s) => {
      // Whatever earlier runs left in the log is not this test's business.
      await s.rows(`delete from intake_log`);
      const form = await formId(s);
      const before =
        (await s.rows<{ n: number }>(`select submissions as n from form_daily_stats where form_id = $1 and day = public.tashkent_today()`, [form]))[0]?.n ?? 0;
      const sent = await submit(s, form, "+998907770001", "visitor-1", "  Aziza Karimova ");
      expect(sent.outcome).toBe("created");
      expect(
        await s.rows(
          `select full_name, phone, source, status, assigned_to, taken_at, created_by, form_id = $2 as from_form, submitted_language,
                  tags, preferred_time, notes, answers -> 0 ->> 'label' as label, answers -> 0 ->> 'value' as value
           from leads where id = $1`,
          [sent.lead_id, form],
        ),
      ).toEqual([
        {
          full_name: "Aziza Karimova", phone: "+998907770001", source: "web_form", status: "new", assigned_to: null, taken_at: null,
          created_by: null, from_form: true, submitted_language: "ru", tags: ["course-signup"], preferred_time: "Evening", notes: "Hello",
          label: "Ваш уровень сейчас", value: "Начальный",
        },
      ]);
      expect(await s.rows(`select outcome, channel, ip_hash, lead_id = $2 as lead from intake_log where form_id = $1`, [form, sent.lead_id])).toEqual([
        { outcome: "created", channel: "form", ip_hash: "visitor-1", lead: true },
      ]);
      expect(await s.rows(`select submissions from form_daily_stats where form_id = $1 and day = public.tashkent_today()`, [form])).toEqual([
        { submissions: before + 1 },
      ]);
    });
  });

  it("a foreign phone number is accepted for a lead", async () => {
    await admin(async (s) => {
      expect((await submit(s, await formId(s), "+79123456789")).outcome).toBe("created");
      expect((await s.attempt(`insert into leads (full_name, phone, source) values ('X', '901234567', 'other')`)).ok).toBe(false);
    });
  });

  it("duplicates: the phone of an open lead adds 'submitted again' and sends it back to the inbox", async () => {
    await admin(async (s) => {
      const form = await formId(s);
      const first = await submit(s, form, "+998907770002");
      // A manager took it and started working on it.
      await s.rows(`update leads set assigned_to = (select id from profiles where role = 'manager' limit 1), taken_at = now(), status = 'contacted' where id = $1`, [first.lead_id]);

      const again = await submit(s, await formId(s, "consultation"), "+998907770002", "visitor-2", "Someone Else");
      expect(again).toEqual({ outcome: "merged", lead_id: first.lead_id });
      expect(await s.count("leads", `phone = '+998907770002'`)).toBe(1);
      expect(await s.rows(`select full_name, status, assigned_to, taken_at, form_id = $2 as first_form from leads where id = $1`, [first.lead_id, form])).toEqual([
        { full_name: "Form Test", status: "new", assigned_to: null, taken_at: null, first_form: true },
      ]);
      expect(await s.rows(`select kind, body, created_by from lead_activities where lead_id = $1 and kind = 'form_resubmitted'`, [first.lead_id])).toEqual([
        { kind: "form_resubmitted", body: "Consultation call", created_by: null },
      ]);
    });
  });

  it("duplicates: a lead on a trial keeps its stage; a won, lost or archived lead does not merge", async () => {
    await admin(async (s) => {
      const form = await formId(s);
      const group = (await s.rows<{ id: string }>(`select id from groups where archived_at is null limit 1`))[0].id;
      const trial = await submit(s, form, "+998907770003");
      await s.rows(`update leads set status = 'trial', trial_group_id = $2, trial_date = public.tashkent_today() where id = $1`, [trial.lead_id, group]);
      expect((await submit(s, form, "+998907770003")).outcome).toBe("merged");
      expect((await s.rows<{ status: string }>(`select status from leads where id = $1`, [trial.lead_id]))[0].status).toBe("trial");

      const lost = await submit(s, form, "+998907770004", "visitor-2");
      await s.rows(`update leads set status = 'lost', lost_reason = 'price' where id = $1`, [lost.lead_id]);
      const fresh = await submit(s, form, "+998907770004", "visitor-2");
      expect(fresh.outcome).toBe("created");
      expect(fresh.lead_id).not.toBe(lost.lead_id);

      const archived = await submit(s, form, "+998907770005", "visitor-3");
      await s.rows(`update leads set archived_at = now() where id = $1`, [archived.lead_id]);
      expect((await submit(s, form, "+998907770005", "visitor-3")).outcome).toBe("created");
    });
  });

  it("duplicates: the phone of a student or of a student's parent makes a new lead tagged existing_student", async () => {
    await admin(async (s) => {
      const form = await formId(s);
      await s.rows(`insert into students (full_name, phone, parent_phone) values ('Known Student', '+998907770006', '+998907770007')`);
      for (const phone of ["+998907770006", "+998907770007"]) {
        const sent = await submit(s, form, phone);
        expect(sent.outcome).toBe("created");
        expect((await s.rows<{ tags: string[] }>(`select tags from leads where id = $1`, [sent.lead_id]))[0].tags).toEqual(["course-signup", "existing_student"]);
      }
    });
  });

  it("rate limit: 5 per visitor per form per 10 minutes", async () => {
    await admin(async (s) => {
      // Whatever earlier runs left in the log is not this test's business.
      await s.rows(`delete from intake_log`);
      const form = await formId(s);
      const other = await formId(s, "consultation");
      for (let n = 0; n < 5; n += 1) expect((await submit(s, form, `+99890888000${n}`)).outcome, `submission ${n + 1}`).toBe("created");
      expect(await submit(s, form, "+998908880009")).toEqual({ outcome: "rate_limited", lead_id: null });
      expect(await s.count("leads", `phone = '+998908880009'`)).toBe(0);

      // Another visitor, the same visitor on another form, and nobody's address: not limited.
      expect((await submit(s, form, "+998908880010", "visitor-2")).outcome).toBe("created");
      expect((await submit(s, other, "+998908880011")).outcome).toBe("created");
      expect((await submit(s, form, "+998908880012", null)).outcome).toBe("created");

      // Spam counts towards the limit; refused and invalid attempts do not.
      expect(await outcomes(s, form)).toEqual(["created", "created", "created", "created", "created", "created", "created", "rate_limited"]);

      // Ten minutes later the visitor may send again.
      await s.rows(`update intake_log set received_at = received_at - interval '10 minutes 1 second' where form_id = $1`, [form]);
      expect((await submit(s, form, "+998908880013")).outcome).toBe("created");
    });
  });

  it("rate limit: spam from a visitor counts towards their five", async () => {
    await admin(async (s) => {
      const form = await formId(s);
      for (let n = 0; n < 5; n += 1) await s.rows(`select public.intake_reject('form', $1, 'spam', 'honeypot', 'visitor-9')`, [form]);
      await s.rows(`select public.intake_reject('form', $1, 'invalid', 'phone:phone', 'visitor-8')`, [form]);
      expect((await submit(s, form, "+998908880020", "visitor-9")).outcome).toBe("rate_limited");
      expect((await submit(s, form, "+998908880021", "visitor-8")).outcome).toBe("created");
    });
  });

  it("rate limit: 3 per phone per day, whoever sends and whichever form", async () => {
    await admin(async (s) => {
      const forms = [await formId(s), await formId(s, "consultation"), await formId(s, "free-trial")];
      expect((await submit(s, forms[0], "+998908881000", "a")).outcome).toBe("created");
      expect((await submit(s, forms[1], "+998908881000", "b")).outcome).toBe("merged");
      expect((await submit(s, forms[2], "+998908881000", "c")).outcome).toBe("merged");
      expect((await submit(s, forms[0], "+998908881000", "d")).outcome).toBe("rate_limited");
      expect((await submit(s, forms[0], "+998908881001", "d")).outcome).toBe("created");

      await s.rows(`update intake_log set received_at = received_at - interval '1 day 1 second'`);
      expect((await submit(s, forms[0], "+998908881000", "d")).outcome).toBe("merged");
    });
  });

  it("a closed, draft or archived form takes nothing", async () => {
    await admin(async (s) => {
      // Whatever earlier runs left in the log is not this test's business.
      await s.rows(`delete from intake_log`);
      const form = await formId(s);
      await s.rows(`update lead_forms set status = 'closed' where id = $1`, [form]);
      expect(await submit(s, form, "+998908882000")).toEqual({ outcome: "invalid", lead_id: null });
      expect(await submit(s, "00000000-0000-4000-8000-000000000000", "+998908882000")).toEqual({ outcome: "invalid", lead_id: null });
      expect(await s.count("leads", `phone = '+998908882000'`)).toBe(0);
      expect(await s.rows(`select outcome, detail from intake_log where form_id = $1`, [form])).toEqual([{ outcome: "invalid", detail: "form_closed" }]);
    });
  });

  it("views are counted per form and Tashkent day", async () => {
    await admin(async (s) => {
      const form = await formId(s);
      await s.rows(`delete from form_daily_stats`);
      for (let n = 0; n < 3; n += 1) await s.rows(`select public.form_count_view($1)`, [form]);
      await s.rows(`select public.form_count_view('00000000-0000-4000-8000-000000000000')`);
      expect(await s.rows(`select form_id = $1 as mine, day = public.tashkent_today() as today, views, submissions from form_daily_stats`, [form])).toEqual([
        { mine: true, today: true, views: 3, submissions: 0 },
      ]);
    });
  });

  it("the log is pruned after 90 days by a nightly job", async () => {
    await admin(async (s) => {
      expect(await s.rows(`select schedule, command from cron.job where jobname = 'intake-log-prune'`)).toEqual([
        { schedule: "40 19 * * *", command: `delete from public.intake_log where received_at < now() - interval '90 days'` },
      ]);
    });
  });
});
