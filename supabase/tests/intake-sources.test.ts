/**
 * Website intake — docs/SPEC.md → "Lead forms add-on → Public intake URL and
 * Meta lead ads" (website part). Sources are the owner's; a key is found by
 * its hash; 60 requests a minute per key; a lead may come in without a form.
 * Every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, admin, as, connect, disconnect, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);
const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);

const newSource = async (s: Session, options: { hash?: string; form?: string | null; active?: boolean; map?: object } = {}) =>
  (
    await s.rows<{ id: string }>(
      `insert into intake_sources (name, key_prefix, key_hash, form_id, is_active, field_map)
       values ('Landing page', 'lk_ab12cd34', $1, $2, $3, $4::jsonb) returning id`,
      [options.hash ?? HASH, options.form ?? null, options.active ?? true, JSON.stringify(options.map ?? {})],
    )
  )[0].id;
const formId = async (s: Session, slug = "course-signup") => (await s.rows<{ id: string }>(`select id from lead_forms where slug = $1`, [slug]))[0].id;
const submit = async (s: Session, source: string | null, form: string | null, phone: string, name = "Api Test") =>
  (
    await s.rows<{ outcome: string; lead_id: string | null }>(
      `select outcome, lead_id from public.intake_submit('api', $1, null, $2, $3, 'TOPIK', null, 'From the website',
         '[{"id":"utmsource","type":"short_text","label":"utm_source","value":"instagram"}]'::jsonb, 'ru', $4)`,
      [form, name, phone, source],
    )
  )[0];

describe.skipIf(!DB_URL)("Website intake sources", () => {
  beforeAll(connect);
  afterAll(disconnect);

  it("only the owner sees, adds and changes sources; nobody reads a key's hash back", async () => {
    await as("owner", async (s) => {
      const made = await s.attempt(
        `insert into intake_sources (name, key_prefix, key_hash) values ('Main website', 'lk_Zz99Yy88', $1) returning id, name, key_prefix, is_active, created_by = auth.uid() as mine`,
        [OTHER_HASH],
      );
      expect(made).toMatchObject({ ok: true, rows: [{ name: "Main website", key_prefix: "lk_Zz99Yy88", is_active: true, mine: true }] });
      expect(await s.count("intake_sources")).toBe(1);
      expect(code(await s.attempt(`select key_hash from intake_sources`))).toBe(DENIED);
      expect(code(await s.attempt(`update intake_sources set key_hash = $1`, [HASH]))).toBe(DENIED);
      expect(await s.attempt(`update intake_sources set name = 'Renamed', is_active = false, field_map = '{"field-17":"name"}'`)).toMatchObject({ ok: true, rowCount: 1 });
      expect((await s.attempt(`delete from intake_sources`)).ok).toBe(false);
      // A key's shape is checked: a prefix and a SHA-256.
      expect((await s.attempt(`insert into intake_sources (name, key_prefix, key_hash) values ('X', 'bad', $1)`, ["c".repeat(64)])).ok).toBe(false);
      expect((await s.attempt(`insert into intake_sources (name, key_prefix, key_hash) values ('X', 'lk_ab12cd34', 'plain-key')`)).ok).toBe(false);
      expect((await s.attempt(`insert into intake_sources (name, key_prefix, key_hash) values ('Twin', 'lk_ab12cd34', $1)`, [OTHER_HASH])).ok).toBe(false);
    });
    for (const who of ["manager", "teacher"] as const) {
      await as(who, async (s) => {
        expect(await s.count("intake_sources")).toBe(0);
        expect(code(await s.attempt(`insert into intake_sources (name, key_prefix, key_hash) values ('Mine', 'lk_ab12cd34', $1)`, [OTHER_HASH]))).toBe(DENIED);
        expect(await s.attempt(`update intake_sources set is_active = false`)).toMatchObject({ ok: true, rowCount: 0 });
        expect(code(await s.attempt(`select * from public.intake_source_log(gen_random_uuid())`))).toBe(DENIED);
        expect(code(await s.attempt(`select * from public.intake_source_check($1)`, [HASH]))).toBe(DENIED);
      }, async (s) => void (await newSource(s)));
    }
    await as("anon", async (s) => {
      expect(code(await s.attempt(`select * from intake_sources`))).toBe(DENIED);
      expect(code(await s.attempt(`select * from public.intake_source_check($1)`, [HASH]))).toBe(DENIED);
      expect(code(await s.attempt(`select * from public.intake_submit('api', null, null, 'A', '+998901112233')`))).toBe(DENIED);
    });
  });

  it("a key is found by its hash, with its field map and funnel; a wrong key or a switched-off source finds nothing", async () => {
    await admin(async (s) => {
      const form = await formId(s);
      const id = await newSource(s, { form, map: { "field-17": "name" } });
      expect(await s.rows(`select id, name, field_map, form_id, limited from public.intake_source_check($1)`, [HASH])).toEqual([
        { id, name: "Landing page", field_map: { "field-17": "name" }, form_id: form, limited: false },
      ]);
      expect((await s.rows<{ used: boolean }>(`select last_used_at is not null as used from intake_sources where id = $1`, [id]))[0].used).toBe(true);
      expect(await s.rows(`select * from public.intake_source_check($1)`, [OTHER_HASH])).toEqual([]);
      await s.rows(`update intake_sources set is_active = false where id = $1`, [id]);
      expect(await s.rows(`select * from public.intake_source_check($1)`, [HASH])).toEqual([]);
    });
  });

  it("60 requests a minute per key: the 61st is limited, another key is not, and a minute later it may send again", async () => {
    await admin(async (s) => {
      const id = await newSource(s);
      const other = await newSource(s, { hash: OTHER_HASH });
      const limited = async (hash: string) => (await s.rows<{ limited: boolean }>(`select limited from public.intake_source_check($1)`, [hash]))[0].limited;
      // Whatever became of a request, it counts: leads, refusals, tests.
      await s.rows(`select public.intake_reject('api', null, case when n % 3 = 0 then 'invalid' when n % 3 = 1 then 'test' else 'error' end::public.intake_outcome, 'x', null, $1) from generate_series(1, 59) n`, [id]);
      expect(await limited(HASH)).toBe(false);
      expect((await submit(s, id, null, "+998907771001")).outcome).toBe("created");
      expect(await limited(HASH)).toBe(true);
      expect(await limited(OTHER_HASH)).toBe(false);
      expect((await s.rows<{ n: number }>(`select count(*)::int as n from intake_log where source_id = $1`, [other]))[0].n).toBe(0);

      await s.rows(`update intake_log set received_at = received_at - interval '61 seconds' where source_id = $1`, [id]);
      expect(await limited(HASH)).toBe(false);
    });
  });

  it("a lead from a source with no funnel: source website, in the inbox, answers kept, logged against the source", async () => {
    await admin(async (s) => {
      const id = await newSource(s);
      const sent = await submit(s, id, null, "+998907771002", "  Aziza Karimova ");
      expect(sent.outcome).toBe("created");
      expect(
        await s.rows(
          `select full_name, source, status, form_id, subject_interest, notes, submitted_language, tags, assigned_to, inbox_since is not null as inbox,
                  answers -> 0 ->> 'label' as label, answers -> 0 ->> 'value' as value
           from leads where id = $1`,
          [sent.lead_id],
        ),
      ).toEqual([
        {
          full_name: "Aziza Karimova", source: "website", status: "new", form_id: null, subject_interest: "TOPIK", notes: "From the website",
          submitted_language: "ru", tags: [], assigned_to: null, inbox: true, label: "utm_source", value: "instagram",
        },
      ]);
      expect(await s.rows(`select channel, outcome, form_id, lead_id = $2 as lead from intake_log where source_id = $1`, [id, sent.lead_id])).toEqual([
        { channel: "api", outcome: "created", form_id: null, lead: true },
      ]);
      expect((await s.rows<{ id: string }>(`select id from public.lead_inbox()`)).map((row) => row.id)).toContain(sent.lead_id);
    });
  });

  it("a source tied to a funnel counts in that form's numbers and takes its tag and subject, even when the form is closed", async () => {
    await admin(async (s) => {
      const form = await formId(s, "free-trial");
      await s.rows(`update lead_forms set status = 'closed', subject = 'Korean' where id = $1`, [form]);
      await s.rows(`delete from form_daily_stats where form_id = $1`, [form]);
      const id = await newSource(s, { form });
      const sent = (
        await s.rows<{ outcome: string; lead_id: string }>(`select outcome, lead_id from public.intake_submit('api', $1, null, 'Funnel Lead', '+998907771003', null, null, null, null, null, $2)`, [form, id])
      )[0];
      expect(sent.outcome).toBe("created");
      expect(await s.rows(`select form_id = $2 as counted, tags, subject_interest from leads where id = $1`, [sent.lead_id, form])).toEqual([
        { counted: true, tags: ["free-trial"], subject_interest: "Korean" },
      ]);
      expect(await s.rows(`select submissions from form_daily_stats where form_id = $1`, [form])).toEqual([{ submissions: 1 }]);
      // The public form itself is still closed to visitors.
      expect((await s.rows<{ outcome: string }>(`select outcome from public.intake_submit('form', $1, 'v', 'Visitor', '+998907771004')`, [form]))[0].outcome).toBe("invalid");
      // An archived form no longer counts anything: the lead still comes in.
      await s.rows(`update lead_forms set archived_at = now() where id = $1`, [form]);
      const later = (await s.rows<{ outcome: string; lead_id: string }>(`select outcome, lead_id from public.intake_submit('api', $1, null, 'Later Lead', '+998907771005', null, null, null, null, null, $2)`, [form, id]))[0];
      expect(later.outcome).toBe("created");
      expect((await s.rows<{ form_id: string | null }>(`select form_id from leads where id = $1`, [later.lead_id]))[0].form_id).toBe(null);
    });
  });

  it("the same duplicate and phone rules as a form: merged into an open lead, tagged for a student, 3 a day per phone", async () => {
    await admin(async (s) => {
      const id = await newSource(s);
      const first = await submit(s, id, null, "+998907771006");
      const again = await submit(s, id, null, "+998907771006", "Someone Else");
      expect(again).toEqual({ outcome: "merged", lead_id: first.lead_id });
      // "Submitted <website> again" on the timeline.
      expect(await s.rows(`select kind, body from lead_activities where lead_id = $1 and kind = 'form_resubmitted'`, [first.lead_id])).toEqual([
        { kind: "form_resubmitted", body: "Landing page" },
      ]);
      expect((await submit(s, id, null, "+998907771006")).outcome).toBe("merged");
      expect(await submit(s, id, null, "+998907771006")).toEqual({ outcome: "rate_limited", lead_id: null });
      expect(await s.rows(`select outcome, detail from intake_log where source_id = $1 and outcome = 'rate_limited'`, [id])).toEqual([{ outcome: "rate_limited", detail: "phone_or_visitor" }]);

      await s.rows(`insert into students (full_name, phone) values ('Known Student', '+998907771007')`);
      const known = await submit(s, id, null, "+998907771007");
      expect((await s.rows<{ tags: string[] }>(`select tags from leads where id = $1`, [known.lead_id]))[0].tags).toEqual(["existing_student"]);
    });
  });

  it("the owner reads the last 100 requests of a source, newest first, with the lead each made", async () => {
    await as("owner", async (s) => {
      const rows = await s.rows<{ outcome: string; detail: string | null; lead_name: string | null }>(`select outcome, detail, lead_name from public.intake_source_log($1)`, [source]);
      expect(rows).toHaveLength(100);
      expect(rows[0]).toEqual({ outcome: "created", detail: null, lead_name: "Api Test" });
      expect(rows[1]).toEqual({ outcome: "test", detail: "connection test", lead_name: null });
      expect(rows[2]).toMatchObject({ outcome: "invalid", detail: "phone:phone" });
      // Another source's requests are not in it.
      expect(await s.rows(`select * from public.intake_source_log($1)`, [otherSource])).toEqual([]);
    }, async (s) => {
      source = await newSource(s);
      otherSource = await newSource(s, { hash: OTHER_HASH });
      await s.rows(`insert into intake_log (channel, source_id, outcome, detail, received_at) select 'api', $1, 'invalid', 'phone:phone', now() - (n || ' minutes')::interval from generate_series(10, 130) n`, [source]);
      await s.rows(`insert into intake_log (channel, source_id, outcome, detail, received_at) values ('api', $1, 'test', 'connection test', now() - interval '5 minutes')`, [source]);
      await submit(s, source, null, "+998907771008");
    });
  });
});

let source = "";
let otherSource = "";
