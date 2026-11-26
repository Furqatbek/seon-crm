-- Facebook and Instagram lead ads. docs/SPEC.md → "Lead forms add-on → Public
-- intake URL and Meta lead ads" (Meta part), "Data model additions".
--
-- 1. meta_connections: one row per connected Facebook Page. The Page's
--    long-lived token is in Supabase Vault; the row holds only the secret's id.
-- 2. meta_form_links: the Page's lead forms, each with an optional CRM funnel.
-- 3. Intake remembers Meta's id of each lead (leads.external_id and
--    intake_log.external_id), so a lead delivered twice is taken once.
-- 4. An hourly job asks the app to read recent leads, to catch a missed webhook.
-- Everything here is the owner's to see; only the server's key writes it.

create table public.meta_connections (
  id uuid primary key default gen_random_uuid(),
  page_id text not null unique check (page_id ~ '^[0-9]{1,32}$'),
  page_name text not null check (btrim(page_name) <> ''),
  -- The Page token, in Vault.
  token_secret_id uuid,
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect')),
  -- What Meta said when the token stopped working.
  status_detail text,
  connected_by uuid references public.profiles (id),
  connected_at timestamptz not null default now(),
  last_lead_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meta_form_links (
  id uuid primary key default gen_random_uuid(),
  meta_form_id text not null unique check (meta_form_id ~ '^[0-9]{1,32}$'),
  meta_form_name text not null,
  page_id text not null references public.meta_connections (page_id),
  -- The funnel its leads count in, if any.
  form_id uuid references public.lead_forms (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meta_form_links_page_idx on public.meta_form_links (page_id);

create trigger set_updated_at before update on public.meta_connections
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.meta_form_links
  for each row execute function public.set_updated_at();

alter table public.meta_connections enable row level security;
alter table public.meta_form_links enable row level security;
revoke all on public.meta_connections, public.meta_form_links from public, anon, authenticated;
-- The owner reads both (never the token: it is not in these tables) and picks a form's funnel.
grant select (id, page_id, page_name, status, status_detail, connected_by, connected_at, last_lead_at) on public.meta_connections to authenticated;
grant select on public.meta_form_links to authenticated;
grant update (form_id) on public.meta_form_links to authenticated;

create policy meta_connections_select on public.meta_connections
  for select to authenticated using ((select public.is_owner()));
create policy meta_form_links_select on public.meta_form_links
  for select to authenticated using ((select public.is_owner()));
create policy meta_form_links_update on public.meta_form_links
  for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

-- ─────────────────────────── Tokens in Vault ─────────────────────────
-- Called by the server with its own key, after it has checked that the owner is asking.

-- A Page was connected (or connected again): its token is stored and it is marked connected.
create function public.meta_save_connection(p_page_id text, p_page_name text, p_token text, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_id uuid;
  connection_id uuid;
begin
  if coalesce(p_token, '') = '' then
    raise exception 'A token is required' using errcode = '22023';
  end if;
  -- Vault's own functions do the writing: a secret is updated in place when the
  -- Page already has one (by the connection, or by its name), else created.
  select c.token_secret_id into secret_id from public.meta_connections c where c.page_id = p_page_id for update;
  if secret_id is null or not exists (select 1 from vault.decrypted_secrets s where s.id = secret_id) then
    select s.id into secret_id from vault.decrypted_secrets s where s.name = 'meta_page_' || p_page_id;
  end if;
  if secret_id is not null then
    perform vault.update_secret(secret_id, p_token);
  else
    secret_id := vault.create_secret(p_token, 'meta_page_' || p_page_id, 'Meta Page token for lead ads');
  end if;

  insert into public.meta_connections (page_id, page_name, token_secret_id, status, status_detail, connected_by, connected_at)
  values (p_page_id, p_page_name, secret_id, 'connected', null, p_user, now())
  on conflict (page_id) do update
    set page_name = excluded.page_name, token_secret_id = excluded.token_secret_id, status = 'connected',
        status_detail = null, connected_by = excluded.connected_by, connected_at = now()
  returning id into connection_id;
  return connection_id;
end;
$$;

-- The token of a connected Page, or null.
create function public.meta_page_token(p_page_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from public.meta_connections c
  join vault.decrypted_secrets s on s.id = c.token_secret_id
  where c.page_id = p_page_id;
$$;

-- Between "Connect with Facebook" and choosing Pages, the person's own token
-- waits here, in Vault, under their id. It is cleared once Pages are chosen.
create function public.meta_set_pending(p_user uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_id uuid;
begin
  select s.id into secret_id from vault.decrypted_secrets s where s.name = 'meta_pending_' || p_user;
  if secret_id is not null then
    -- An empty token clears it: there is nothing left to read.
    perform vault.update_secret(secret_id, coalesce(p_token, ''));
  elsif coalesce(p_token, '') <> '' then
    perform vault.create_secret(p_token, 'meta_pending_' || p_user, 'Meta user token while Pages are being chosen');
  end if;
end;
$$;

create function public.meta_pending_token(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets s
  -- An hour is plenty to choose Pages in.
  where s.name = 'meta_pending_' || p_user and s.decrypted_secret <> '' and s.updated_at > now() - interval '1 hour';
$$;

-- The token stopped working. True the first time, so the owner is told once.
create function public.meta_mark_reconnect(p_page_id text, p_detail text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.meta_connections c
  set status = 'needs_reconnect', status_detail = left(p_detail, 300)
  where c.page_id = p_page_id and c.status = 'connected';
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

-- ───────────────────── Meta's lead ids, remembered ───────────────────

alter table public.intake_log add column external_id text;
create index intake_log_external_idx on public.intake_log (external_id) where external_id is not null;

-- Which of these Meta lead ids have already been dealt with: a lead exists, or
-- the request was taken, merged, refused for its answers, or was a test lead.
-- (A rate-limited or failed one is tried again.)
create function public.meta_known_leads(p_ids text[])
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select d.external_id from public.leads d where d.external_id = any (p_ids)
  union
  select l.external_id from public.intake_log l
  where l.external_id = any (p_ids) and l.outcome in ('created', 'merged', 'invalid', 'test');
$$;

-- Intake, as before, and now with Meta's id of the lead.
drop function public.intake_submit(public.intake_channel, uuid, text, text, text, text, text, text, jsonb, public.app_language, uuid);
drop function public.intake_reject(public.intake_channel, uuid, public.intake_outcome, text, text, uuid);

create function public.intake_submit(
  p_channel public.intake_channel,
  p_form_id uuid,
  p_ip_hash text,
  p_full_name text,
  p_phone text,
  p_subject text default null,
  p_preferred_time text default null,
  p_notes text default null,
  p_answers jsonb default null,
  p_language public.app_language default null,
  p_source_id uuid default null,
  p_external_id text default null
)
returns table (outcome public.intake_outcome, lead_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  form public.lead_forms;
  has_form boolean := false;
  source_name text;
  existing public.leads;
  new_id uuid;
  lead_tags text[] := '{}';
  result public.intake_outcome;
begin
  if p_form_id is not null then
    select * into form from public.lead_forms f where f.id = p_form_id;
    has_form := found and form.archived_at is null;
  end if;
  if p_channel = 'form' and (not has_form or form.status <> 'live') then
    insert into public.intake_log (channel, form_id, outcome, detail, ip_hash)
    values (p_channel, case when has_form then p_form_id end, 'invalid', 'form_closed', p_ip_hash);
    return query select 'invalid'::public.intake_outcome, null::uuid;
    return;
  end if;
  if p_source_id is not null then
    select s.name into source_name from public.intake_sources s where s.id = p_source_id;
  end if;

  -- A lead Meta has already delivered (its leadgen id is known) is not taken
  -- twice: neither a second lead nor a second "sent again". One at a time per id.
  if p_external_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('intake:external:' || p_external_id, 0));
    select d.id into new_id from public.leads d where d.external_id = p_external_id;
    if new_id is null then
      select l.lead_id into new_id from public.intake_log l
      where l.external_id = p_external_id and l.outcome in ('created', 'merged')
      order by l.received_at desc limit 1;
    end if;
    if new_id is not null then
      return query select 'merged'::public.intake_outcome, new_id;
      return;
    end if;
  end if;

  -- One at a time per visitor and per phone, always in this order.
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('intake:visitor:' || coalesce(p_form_id::text, '') || ':' || p_ip_hash, 0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('intake:phone:' || p_phone, 0));

  if (
    p_ip_hash is not null and (
      select count(*) from public.intake_log l
      where l.form_id is not distinct from p_form_id and l.ip_hash = p_ip_hash
        and l.received_at > now() - interval '10 minutes'
        and l.outcome in ('created', 'merged', 'spam')
    ) >= 5
  ) or (
    select count(*) from public.intake_log l
    join public.leads d on d.id = l.lead_id
    where d.phone = p_phone and l.received_at > now() - interval '1 day'
      and l.outcome in ('created', 'merged')
  ) >= 3 then
    insert into public.intake_log (channel, source_id, form_id, outcome, detail, ip_hash, external_id)
    values (p_channel, p_source_id, case when has_form then p_form_id end, 'rate_limited', 'phone_or_visitor', p_ip_hash, p_external_id);
    return query select 'rate_limited'::public.intake_outcome, null::uuid;
    return;
  end if;

  select * into existing from public.leads d
  where d.phone = p_phone and d.archived_at is null and d.status in ('new', 'contacted', 'trial')
  order by d.created_at desc
  limit 1
  for update;

  if found then
    result := 'merged';
    new_id := existing.id;
    -- "Submitted <form> again": the form's name, or the website's when there is no form.
    insert into public.lead_activities (lead_id, kind, body)
    values (existing.id, 'form_resubmitted', coalesce(case when has_form then form.name end, source_name, case when p_channel = 'meta' then 'Facebook' end, ''));
    -- Back to the inbox: nobody's, and new again. A lead on a trial keeps its
    -- stage, since the trial lesson is still booked.
    update public.leads d
    set assigned_to = null, taken_at = null, inbox_since = now(),
        status = case when d.status = 'trial' then d.status else 'new'::public.lead_status end
    where d.id = existing.id;
  else
    result := 'created';
    if has_form and form.source_tag is not null and btrim(form.source_tag) <> '' then
      lead_tags := array[btrim(form.source_tag)];
    end if;
    if exists (
      select 1 from public.students s
      where s.archived_at is null and (s.phone = p_phone or s.parent_phone = p_phone)
    ) then
      lead_tags := lead_tags || 'existing_student'::text;
    end if;

    insert into public.leads (
      full_name, phone, source, subject_interest, preferred_time, notes,
      form_id, answers, submitted_language, tags, inbox_since, external_id
    )
    values (
      btrim(p_full_name), p_phone,
      (case p_channel when 'form' then 'web_form' when 'meta' then 'facebook' else 'website' end)::public.lead_source,
      coalesce(nullif(btrim(p_subject), ''), case when has_form then form.subject end),
      nullif(btrim(p_preferred_time), ''), nullif(btrim(p_notes), ''),
      case when has_form then form.id end, p_answers, p_language, lead_tags, now(), p_external_id
    )
    returning id into new_id;
  end if;

  if has_form then
    insert into public.form_daily_stats (form_id, day, submissions)
    values (form.id, public.tashkent_today(), 1)
    on conflict (form_id, day) do update set submissions = public.form_daily_stats.submissions + 1;
  end if;

  insert into public.intake_log (channel, source_id, form_id, outcome, lead_id, ip_hash, external_id)
  values (p_channel, p_source_id, case when has_form then form.id end, result, new_id, p_ip_hash, p_external_id);

  return query select result, new_id;
end;
$$;

create function public.intake_reject(
  p_channel public.intake_channel,
  p_form_id uuid,
  p_outcome public.intake_outcome,
  p_detail text,
  p_ip_hash text,
  p_source_id uuid default null,
  p_external_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('spam', 'invalid', 'error', 'test', 'rate_limited') then
    raise exception 'Not a rejection' using errcode = '22023';
  end if;
  insert into public.intake_log (channel, source_id, form_id, outcome, detail, ip_hash, external_id)
  values (
    p_channel,
    (select s.id from public.intake_sources s where s.id = p_source_id),
    (select f.id from public.lead_forms f where f.id = p_form_id),
    p_outcome, left(p_detail, 500), p_ip_hash, p_external_id
  );
end;
$$;

-- ───────────────────────── The hourly catch-up ───────────────────────
-- Supabase Cron asks the app to read recent leads of every linked Meta form,
-- in case a webhook was missed. The app's address and the secret are in Vault
-- ('app_url', 'cron_secret'), as for the reminders job.

create function public.call_meta_backfill_job()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  secret text;
  request_id bigint;
begin
  if public.is_user_request() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- Nothing to do until a Page is connected.
  if not exists (select 1 from public.meta_connections) then
    return null;
  end if;

  select ds.decrypted_secret into app_url from vault.decrypted_secrets ds where ds.name = 'app_url';
  select ds.decrypted_secret into secret from vault.decrypted_secrets ds where ds.name = 'cron_secret';
  if coalesce(app_url, '') = '' or coalesce(secret, '') = '' then
    return null;
  end if;

  select net.http_post(
    url := rtrim(app_url, '/') || '/api/jobs/meta-backfill',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  ) into request_id;
  return request_id;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('meta-backfill-hourly', '7 * * * *', 'select public.call_meta_backfill_job()');
  end if;
end;
$$;

-- ───────────────────────────── Grants ───────────────────────────────

revoke execute on function
  public.meta_save_connection(text, text, text, uuid),
  public.meta_page_token(text),
  public.meta_set_pending(uuid, text),
  public.meta_pending_token(uuid),
  public.meta_mark_reconnect(text, text),
  public.meta_known_leads(text[]),
  public.call_meta_backfill_job(),
  public.intake_submit(public.intake_channel, uuid, text, text, text, text, text, text, jsonb, public.app_language, uuid, text),
  public.intake_reject(public.intake_channel, uuid, public.intake_outcome, text, text, uuid, text)
from public, anon, authenticated;

grant execute on function
  public.meta_save_connection(text, text, text, uuid),
  public.meta_page_token(text),
  public.meta_set_pending(uuid, text),
  public.meta_pending_token(uuid),
  public.meta_mark_reconnect(text, text),
  public.meta_known_leads(text[]),
  public.intake_submit(public.intake_channel, uuid, text, text, text, text, text, text, jsonb, public.app_language, uuid, text),
  public.intake_reject(public.intake_channel, uuid, public.intake_outcome, text, text, uuid, text)
to service_role;
