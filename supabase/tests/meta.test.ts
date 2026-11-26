/**
 * Meta lead ads — docs/SPEC.md → "Lead forms add-on → Public intake URL and
 * Meta lead ads", "Data model additions". Connections are the owner's to see,
 * tokens live in Vault, and Meta's id of a lead is taken once. Every test is
 * rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DB_URL, DENIED, OWNER_ID, admin, as, connect, disconnect, type Attempt, type Session } from "./helpers";

const code = (result: Attempt) => (result.ok ? "allowed" : result.code);
const PAGE = "104857600000001";
const FORM = "777000000000001";

const connected = async (s: Session) => {
  await s.rows(`select public.meta_save_connection($1, 'SEON TOPIK', 'PAGE-TOKEN-1', $2)`, [PAGE, OWNER_ID]);
  await s.rows(`insert into meta_form_links (meta_form_id, meta_form_name, page_id) values ($1, 'TOPIK autumn', $2)`, [FORM, PAGE]);
};
const take = async (s: Session, externalId: string | null, phone: string, name = "Meta Test") =>
  (
    await s.rows<{ outcome: string; lead_id: string | null }>(
      `select outcome, lead_id from public.intake_submit('meta', null, null, $1, $2, null, null, null,
         '[{"id":"email","type":"short_text","label":"Email","value":"a@example.com"}]'::jsonb, null, null, $3)`,
      [name, phone, externalId],
    )
  )[0];

describe.skipIf(!DB_URL)("Meta lead ads", () => {
  beforeAll(connect);
  afterAll(disconnect);

  it("the owner sees connections and forms and picks a funnel; nobody else sees them, and nobody reads or writes a token through the API", async () => {
    await as("owner", async (s) => {
      expect(await s.rows(`select page_id, page_name, status, connected_by from meta_connections`)).toEqual([
        { page_id: PAGE, page_name: "SEON TOPIK", status: "connected", connected_by: OWNER_ID },
      ]);
      expect(code(await s.attempt(`select token_secret_id from meta_connections`))).toBe(DENIED);
      expect(code(await s.attempt(`select * from vault.decrypted_secrets`))).toBe(DENIED);
      expect(code(await s.attempt(`update meta_connections set status = 'connected'`))).toBe(DENIED);
      expect(code(await s.attempt(`insert into meta_connections (page_id, page_name) values ('1', 'Mine')`))).toBe(DENIED);
      expect(code(await s.attempt(`insert into meta_form_links (meta_form_id, meta_form_name, page_id) values ('2', 'X', $1)`, [PAGE]))).toBe(DENIED);
      // The one thing the owner writes: a form's funnel.
      expect(await s.attempt(`update meta_form_links set form_id = (select id from lead_forms where slug = 'consultation')`)).toMatchObject({ ok: true, rowCount: 1 });
      expect(code(await s.attempt(`update meta_form_links set meta_form_name = 'Renamed'`))).toBe(DENIED);
      for (const call of [
        `select public.meta_page_token('${PAGE}')`,
        `select public.meta_pending_token('${OWNER_ID}')`,
        `select public.meta_save_connection('${PAGE}', 'X', 'T', null)`,
        `select public.meta_set_pending('${OWNER_ID}', 'T')`,
        `select public.meta_mark_reconnect('${PAGE}', 'x')`,
        `select public.meta_known_leads(array['1'])`,
        `select public.call_meta_backfill_job()`,
      ]) {
        expect(code(await s.attempt(call)), call).toBe(DENIED);
      }
    }, connected);
    for (const who of ["manager", "teacher"] as const) {
      await as(who, async (s) => {
        expect(await s.count("meta_connections")).toBe(0);
        expect(await s.count("meta_form_links")).toBe(0);
        expect(await s.attempt(`update meta_form_links set form_id = null`)).toMatchObject({ ok: true, rowCount: 0 });
        expect(code(await s.attempt(`select public.meta_page_token('${PAGE}')`))).toBe(DENIED);
      }, connected);
    }
    await as("anon", async (s) => {
      expect(code(await s.attempt(`select * from meta_connections`))).toBe(DENIED);
      expect(code(await s.attempt(`select * from meta_form_links`))).toBe(DENIED);
      expect(code(await s.attempt(`select public.meta_page_token('${PAGE}')`))).toBe(DENIED);
    });
  });

  it("a Page's token is kept in Vault, encrypted; connecting again replaces it and clears Needs reconnect", async () => {
    await admin(async (s) => {
      await connected(s);
      expect((await s.rows<{ token: string }>(`select public.meta_page_token($1) as token`, [PAGE]))[0].token).toBe("PAGE-TOKEN-1");
      // In the table there is only the secret's id; in Vault the text is not stored as it is.
      const [stored] = await s.rows<{ plain: boolean; named: string }>(
        `select s.secret = 'PAGE-TOKEN-1' as plain, s.name as named from meta_connections c join vault.secrets s on s.id = c.token_secret_id where c.page_id = $1`,
        [PAGE],
      );
      expect(stored).toEqual({ plain: false, named: `meta_page_${PAGE}` });

      expect((await s.rows<{ first: boolean }>(`select public.meta_mark_reconnect($1, 'Error validating access token') as first`, [PAGE]))[0].first).toBe(true);
      // Told once: the second failure is not news.
      expect((await s.rows<{ first: boolean }>(`select public.meta_mark_reconnect($1, 'again') as first`, [PAGE]))[0].first).toBe(false);
      expect(await s.rows(`select status, status_detail from meta_connections where page_id = $1`, [PAGE])).toEqual([{ status: "needs_reconnect", status_detail: "Error validating access token" }]);

      await s.rows(`select public.meta_save_connection($1, 'SEON TOPIK (renamed)', 'PAGE-TOKEN-2', $2)`, [PAGE, OWNER_ID]);
      expect(await s.rows(`select page_name, status, status_detail, public.meta_page_token(page_id) as token from meta_connections`)).toEqual([
        { page_name: "SEON TOPIK (renamed)", status: "connected", status_detail: null, token: "PAGE-TOKEN-2" },
      ]);
      expect((await s.rows<{ n: number }>(`select count(*)::int as n from vault.decrypted_secrets where name = $1`, [`meta_page_${PAGE}`]))[0].n).toBe(1);
      // A Page that was never connected has no token; an empty token is refused.
      expect((await s.rows<{ token: string | null }>(`select public.meta_page_token('999') as token`))[0].token).toBe(null);
      expect(code(await s.attempt(`select public.meta_save_connection('5', 'X', '', null)`))).toBe("22023");
    });
  });

  it("the owner's own token waits in Vault only while Pages are chosen", async () => {
    await admin(async (s) => {
      const pending = async () => (await s.rows<{ token: string | null }>(`select public.meta_pending_token($1) as token`, [OWNER_ID]))[0].token;
      expect(await pending()).toBe(null);
      await s.rows(`select public.meta_set_pending($1, 'USER-TOKEN-1')`, [OWNER_ID]);
      await s.rows(`select public.meta_set_pending($1, 'USER-TOKEN-2')`, [OWNER_ID]);
      expect(await pending()).toBe("USER-TOKEN-2");
      expect((await s.rows<{ n: number }>(`select count(*)::int as n from vault.decrypted_secrets where name = $1`, [`meta_pending_${OWNER_ID}`]))[0].n).toBe(1);
      // Cleared once the Pages are chosen: nothing is left to read.
      await s.rows(`select public.meta_set_pending($1, '')`, [OWNER_ID]);
      expect(await pending()).toBe(null);
      // Someone else's is not theirs.
      await s.rows(`select public.meta_set_pending($1, 'USER-TOKEN-3')`, [OWNER_ID]);
      expect((await s.rows<{ token: string | null }>(`select public.meta_pending_token(gen_random_uuid()) as token`))[0].token).toBe(null);
    });
  });

  it("a Meta lead: source facebook, external id stored, in the inbox, counted in its form's funnel", async () => {
    await admin(async (s) => {
      const funnel = (await s.rows<{ id: string }>(`select id from lead_forms where slug = 'free-trial'`))[0].id;
      const [sent] = await s.rows<{ outcome: string; lead_id: string }>(
        `select outcome, lead_id from public.intake_submit('meta', $1, null, 'Aziza Karimova', '+998907772001', null, null, null, '[]'::jsonb, null, null, '990000000000001')`,
        [funnel],
      );
      expect(sent.outcome).toBe("created");
      expect(await s.rows(`select source, external_id, form_id = $2 as counted, tags, assigned_to, inbox_since is not null as inbox from leads where id = $1`, [sent.lead_id, funnel])).toEqual([
        { source: "facebook", external_id: "990000000000001", counted: true, tags: ["free-trial"], assigned_to: null, inbox: true },
      ]);
      expect(await s.rows(`select channel, outcome, external_id from intake_log where lead_id = $1`, [sent.lead_id])).toEqual([{ channel: "meta", outcome: "created", external_id: "990000000000001" }]);
    });
  });

  it("the same Meta lead delivered again creates nothing: one lead, one log row, no 'sent again', no return to the inbox", async () => {
    await admin(async (s) => {
      const first = await take(s, "990000000000002", "+998907772002");
      expect(first.outcome).toBe("created");
      await s.rows(`select public.take_lead($1, $2)`, [first.lead_id, OWNER_ID]);

      for (let n = 0; n < 3; n += 1) expect(await take(s, "990000000000002", "+998907772002")).toEqual({ outcome: "merged", lead_id: first.lead_id });
      expect(await s.count("leads", `external_id = '990000000000002'`)).toBe(1);
      expect(await s.count("intake_log", `external_id = '990000000000002'`)).toBe(1);
      expect(await s.count("lead_activities", `lead_id = '${first.lead_id}'`)).toBe(0);
      // Still the owner's: a repeated delivery is not a new submission.
      expect(await s.rows(`select assigned_to, taken_at is not null as taken from leads where id = $1`, [first.lead_id])).toEqual([{ assigned_to: OWNER_ID, taken: true }]);
      // Two leads cannot share an id whatever happens.
      expect((await s.attempt(`insert into leads (full_name, phone, source, external_id) values ('Twin', '+998907772099', 'facebook', '990000000000002')`)).ok).toBe(false);
    });
  });

  it("a second Meta lead from the same phone is merged once, and its id is remembered so the catch-up does not merge it again", async () => {
    await admin(async (s) => {
      const first = await take(s, "990000000000003", "+998907772003");
      const second = await take(s, "990000000000004", "+998907772003", "Same Person");
      expect(second).toEqual({ outcome: "merged", lead_id: first.lead_id });
      expect(await s.rows(`select kind, body from lead_activities where lead_id = $1`, [first.lead_id])).toEqual([{ kind: "form_resubmitted", body: "Facebook" }]);
      // An hour later the catch-up names the same two ids.
      expect(await take(s, "990000000000004", "+998907772003", "Same Person")).toEqual({ outcome: "merged", lead_id: first.lead_id });
      expect(await s.count("lead_activities", `lead_id = '${first.lead_id}'`)).toBe(1);
      expect(await s.count("intake_log", `external_id = '990000000000004'`)).toBe(1);
    });
  });

  it("known ids: a lead, a merge, a refusal and a test are known; a rate limit, a failure and a stranger are not", async () => {
    await admin(async (s) => {
      await take(s, "9001", "+998907772005");
      await take(s, "9002", "+998907772005");
      await s.rows(`select public.intake_reject('meta', null, 'invalid', 'phone:phone', null, null, '9003')`);
      await s.rows(`select public.intake_reject('meta', null, 'test', 'Meta test lead', null, null, '9004')`);
      await s.rows(`select public.intake_reject('meta', null, 'rate_limited', 'phone', null, null, '9005')`);
      await s.rows(`select public.intake_reject('meta', null, 'error', 'connection lost', null, null, '9006')`);
      const known = (await s.rows<{ id: string }>(`select public.meta_known_leads(array['9001','9002','9003','9004','9005','9006','9007']) as id`)).map((row) => row.id).sort();
      expect(known).toEqual(["9001", "9002", "9003", "9004"]);
    });
  });

  it("an hourly job asks the app to catch up, and does nothing until a Page is connected", async () => {
    await admin(async (s) => {
      expect(await s.rows(`select schedule, command from cron.job where jobname = 'meta-backfill-hourly'`)).toEqual([{ schedule: "7 * * * *", command: "select public.call_meta_backfill_job()" }]);
      expect((await s.rows<{ request: string | null }>(`select public.call_meta_backfill_job() as request`))[0].request).toBe(null);
    });
  });
});
