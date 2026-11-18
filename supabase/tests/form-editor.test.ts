/**
 * The form editor's database side — docs/SPEC.md → "Lead forms add-on":
 * "Form builder" (funnels list), "Editor with live preview" (publish, versions).
 * Every test is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, MANAGER_ID, OWNER_ID, as, connect, disconnect, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);
const draftOf = (slug: string) => `(select published from lead_forms where slug = '${slug}')`;

/** A draft form copied from a seeded template, made by the database owner. */
const draftForm = (slug: string) => async (s: Session) => {
  await s.rows(`insert into lead_forms (name, slug, draft) select 'Editor Test', $1, published from lead_forms where slug = 'consultation'`, [slug]);
};
const idOf = async (s: Session, slug: string) => (await s.rows<{ id: string }>(`select id from lead_forms where slug = $1`, [slug]))[0].id;

describe.skipIf(!DB_URL)("Form editor", () => {
  beforeAll(connect);
  afterAll(disconnect);

  it("publish copies the draft to the published copy, numbers the version and keeps it", async () => {
    await as("manager", async (s) => {
      const id = await idOf(s, "editor-test");
      expect(await s.rows(`select public.publish_lead_form($1) as version`, [id])).toEqual([{ version: 1 }]);
      expect(await s.rows(`select status, published_version, published = draft as same, published_at is not null as dated, updated_by from lead_forms where id = $1`, [id])).toEqual([
        { status: "live", published_version: 1, same: true, dated: true, updated_by: MANAGER_ID },
      ]);

      // Edit the draft: visitors still get version 1 until the next publish.
      await s.rows(`update lead_forms set draft = jsonb_set(draft, '{texts,title,en}', '"Second"') where id = $1`, [id]);
      expect(await s.rows(`select published #>> '{texts,title,en}' as live, draft #>> '{texts,title,en}' as draft from lead_forms where id = $1`, [id])).toEqual([
        { live: "Free consultation", draft: "Second" },
      ]);
      expect(await s.rows(`select public.publish_lead_form($1) as version`, [id])).toEqual([{ version: 2 }]);
      expect(await s.rows(`select version, content #>> '{texts,title,en}' as title, published_by from lead_form_versions where form_id = $1 order by version`, [id])).toEqual([
        { version: 1, title: "Free consultation", published_by: MANAGER_ID },
        { version: 2, title: "Second", published_by: MANAGER_ID },
      ]);
    }, draftForm("editor-test"));
  });

  it("publishing a closed form keeps it closed", async () => {
    await as("owner", async (s) => {
      const id = await idOf(s, "consultation");
      await s.rows(`update lead_forms set status = 'closed' where id = $1`, [id]);
      await s.rows(`select public.publish_lead_form($1)`, [id]);
      expect(await s.rows(`select status, published_version from lead_forms where id = $1`, [id])).toEqual([{ status: "closed", published_version: 2 }]);
    });
  });

  it("only the owner publishes a form without a required consent box", async () => {
    const withoutConsent = async (s: Session) => {
      await draftForm("no-consent")(s);
      await s.rows(
        `update lead_forms set draft = jsonb_set(draft, '{fields}', (select jsonb_agg(f) from jsonb_array_elements(draft -> 'fields') f where f ->> 'type' <> 'consent')) where slug = 'no-consent'`,
      );
    };
    await as("manager", async (s) => {
      expect(code(await s.attempt(`select public.publish_lead_form($1)`, [await idOf(s, "no-consent")]))).toBe("EF001");
      expect(await s.rows(`select status, published is null as unpublished from lead_forms where slug = 'no-consent'`)).toEqual([{ status: "draft", unpublished: true }]);
    }, withoutConsent);
    await as("owner", async (s) => {
      expect(code(await s.attempt(`select public.publish_lead_form($1)`, [await idOf(s, "no-consent")]))).toBe("allowed");
    }, withoutConsent);
    // Consent switched to optional counts as removed.
    await as("manager", async (s) => {
      expect(code(await s.attempt(`select public.publish_lead_form($1)`, [await idOf(s, "optional-consent")]))).toBe("EF001");
    }, async (s) => {
      await draftForm("optional-consent")(s);
      await s.rows(`update lead_forms set draft = replace(draft::text, '"type": "consent", "required": true', '"type": "consent", "required": false')::jsonb where slug = 'optional-consent'`);
      await s.rows(
        `update lead_forms set draft = jsonb_set(draft, '{fields}', (select jsonb_agg(case when f ->> 'type' = 'consent' then f || '{"required": false}' else f end) from jsonb_array_elements(draft -> 'fields') f)) where slug = 'optional-consent'`,
      );
    });
  });

  it("a draft with no name or phone field, an archived form and an unknown form are not published", async () => {
    await as("owner", async (s) => {
      const id = await idOf(s, "broken");
      expect(code(await s.attempt(`select public.publish_lead_form($1)`, [id]))).toBe("EF002");
      await s.rows(`update lead_forms set draft = '{"fields": "none"}' where id = $1`, [id]);
      expect(code(await s.attempt(`select public.publish_lead_form($1)`, [id]))).toBe("EF002");
      expect(code(await s.attempt(`select public.publish_lead_form(gen_random_uuid())`))).toBe("P0002");
      await s.rows(`update lead_forms set draft = ${draftOf("consultation")}, archived_at = now() where id = $1`, [id]);
      expect(code(await s.attempt(`select public.publish_lead_form($1)`, [id]))).toBe("P0002");
    }, async (s) => {
      await draftForm("broken")(s);
      await s.rows(
        `update lead_forms set draft = jsonb_set(draft, '{fields}', (select jsonb_agg(f) from jsonb_array_elements(draft -> 'fields') f where f ->> 'maps_to' <> 'phone')) where slug = 'broken'`,
      );
    });
  });

  it("staff cannot write the published copy, the version number or the history directly; teachers and visitors publish nothing", async () => {
    for (const who of ["owner", "manager"] as const) {
      await as(who, async (s) => {
        const id = await idOf(s, "course-signup");
        expect(code(await s.attempt(`update lead_forms set published = '{}' where id = $1`, [id]))).toBe(DENIED);
        expect(code(await s.attempt(`update lead_forms set published_version = 99 where id = $1`, [id]))).toBe(DENIED);
        expect(code(await s.attempt(`insert into lead_form_versions (form_id, version, content) values ($1, 99, '{}')`, [id]))).toBe(DENIED);
        expect(code(await s.attempt(`update lead_form_versions set content = '{}' where form_id = $1`, [id]))).toBe(DENIED);
        expect(code(await s.attempt(`insert into lead_forms (name, slug, draft, published, status) values ('X', 'sneaky', '{}', '{}', 'live')`))).toBe(DENIED);
        // What the editor does write: name, address, status, subject, tag and the draft.
        expect(code(await s.attempt(`update lead_forms set name = 'N', slug = 'course-signup-b', status = 'closed', subject = 'S', source_tag = 'T', draft = draft where id = $1`, [id]))).toBe("allowed");
      });
    }
    await as("teacher", async (s) => {
      expect(code(await s.attempt(`select public.publish_lead_form((select id from lead_forms limit 1))`))).toBe(DENIED);
      expect(code(await s.attempt(`select * from public.lead_forms_overview()`))).toBe(DENIED);
    });
    await as("anon", async (s) => {
      expect(code(await s.attempt(`select public.publish_lead_form(gen_random_uuid())`))).toBe(DENIED);
      expect(code(await s.attempt(`select * from public.lead_forms_overview()`))).toBe(DENIED);
    });
  });

  it("the funnels list: 30-day views, leads, students won and conversion, with who edited last", async () => {
    await as("manager", async (s) => {
      const rows = await s.rows<Record<string, unknown>>(
        `select name, slug, status, has_changes, updated_by_name, views, leads, won, conversion from public.lead_forms_overview() where slug in ('funnel-test', 'quiet-form')`,
      );
      expect(rows.find((row) => row.slug === "funnel-test")).toEqual({
        name: "Editor Test", slug: "funnel-test", status: "live", has_changes: false,
        updated_by_name: (await s.rows<{ full_name: string }>(`select full_name from profiles where id = $1`, [OWNER_ID]))[0].full_name,
        // 40 + 60 views in the window (the 31-day-old 500 are out); 4 leads, 1 won; 4 ÷ 100.
        views: "100", leads: "4", won: "1", conversion: "4.0",
      });
      // No views: no conversion to show. A draft always has something to publish.
      expect(rows.find((row) => row.slug === "quiet-form")).toMatchObject({ status: "draft", has_changes: true, views: "0", leads: "0", won: "0", conversion: null });
      // An archived form is not listed.
      expect(await s.count("lead_forms_overview()", `slug = 'gone-form'`)).toBe(0);

      // An edit shows as unpublished changes, and the manager as the last editor.
      await s.rows(`update lead_forms set draft = jsonb_set(draft, '{texts,title,en}', '"Changed"') where slug = 'funnel-test'`);
      expect(await s.rows(`select has_changes, updated_by_name = (select full_name from profiles where id = $1) as mine from public.lead_forms_overview() where slug = 'funnel-test'`, [MANAGER_ID])).toEqual([
        { has_changes: true, mine: true },
      ]);
    }, async (s) => {
      await draftForm("funnel-test")(s);
      await draftForm("quiet-form")(s);
      await draftForm("gone-form")(s);
      await s.rows(`update lead_forms set archived_at = now() where slug = 'gone-form'`);
      await s.rows(`update lead_forms set published = draft, published_version = 1, published_at = now(), status = 'live', updated_by = $1 where slug = 'funnel-test'`, [OWNER_ID]);
      const id = await idOf(s, "funnel-test");
      await s.rows(
        `insert into form_daily_stats (form_id, day, views) values ($1, public.tashkent_today(), 40), ($1, public.tashkent_today() - 29, 60), ($1, public.tashkent_today() - 30, 500)`,
        [id],
      );
      await s.rows(
        `insert into leads (full_name, phone, source, form_id, status, created_at)
         select 'Funnel ' || n, '+99890444000' || n, 'web_form', $1, 'new', now() - (n || ' days')::interval from generate_series(1, 4) n`,
        [id],
      );
      // One became a student; one more is older than the window; one is archived.
      await s.rows(`insert into leads (full_name, phone, source, form_id, created_at) values ('Old', '+998904440009', 'web_form', $1, now() - interval '40 days')`, [id]);
      await s.rows(`insert into leads (full_name, phone, source, form_id, archived_at) values ('Archived', '+998904440008', 'web_form', $1, now())`, [id]);
      await s.rows(`alter table leads disable trigger user`);
      await s.rows(`update leads set status = 'won' where phone = '+998904440001'`);
      await s.rows(`alter table leads enable trigger user`);
    });
  });
});
