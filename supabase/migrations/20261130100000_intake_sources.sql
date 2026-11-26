-- Website intake. docs/SPEC.md → "Lead forms add-on → Public intake URL and
-- Meta lead ads" (website part), "Data model additions".
--
-- 1. intake_sources: one secret key per website or landing page. Only a hash
--    and a short prefix of the key are stored. Owner only.
-- 2. intake_source_check(): finds the source for a key and applies the
--    60-requests-a-minute limit per key.
-- 3. intake_submit() and intake_reject() take the source, so a lead may come
--    in without a form and every request is logged against its source.

create table public.intake_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  -- The first characters of the key, to tell keys apart: "lk_ab12cd34".
  key_prefix text not null check (key_prefix ~ '^lk_[A-Za-z0-9]{8}$'),
  -- SHA-256 of the whole key, in hex. The key itself is never stored.
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  -- { "<incoming field name>": "name" | "phone" | "subject" | "preferred_time" | "notes" | "language" | "answer" | "ignore" }
  field_map jsonb not null default '{}' check (jsonb_typeof(field_map) = 'object'),
  -- The funnel its leads count in, if any.
  form_id uuid references public.lead_forms (id),
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.intake_sources
  for each row execute function public.set_updated_at();

alter table public.intake_sources enable row level security;
revoke all on public.intake_sources from public, anon, authenticated;
-- The hash is written when the key is made and never read back.
grant select (id, name, key_prefix, field_map, form_id, is_active, last_used_at, created_by, created_at, updated_at)
  on public.intake_sources to authenticated;
grant insert (name, key_prefix, key_hash, field_map, form_id, is_active) on public.intake_sources to authenticated;
grant update (name, field_map, form_id, is_active) on public.intake_sources to authenticated;

create policy intake_sources_select on public.intake_sources
  for select to authenticated using ((select public.is_owner()));
create policy intake_sources_insert on public.intake_sources
  for insert to authenticated with check ((select public.is_owner()));
create policy intake_sources_update on public.intake_sources
  for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

-- The log names the source a request came through.
alter table public.intake_log
  add constraint intake_log_source_id_fkey foreign key (source_id) references public.intake_sources (id);
create index intake_log_source_idx on public.intake_log (source_id, received_at) where source_id is not null;

-- ─────────────────────────── The key check ───────────────────────────
-- The source a key belongs to, or no row for an unknown or switched-off key.
-- `limited` is true when the key has already made 60 requests in the last
-- minute (every logged request counts, whatever became of it).

create function public.intake_source_check(p_key_hash text)
returns table (id uuid, name text, field_map jsonb, form_id uuid, limited boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.intake_sources;
begin
  select * into source from public.intake_sources s where s.key_hash = p_key_hash and s.is_active;
  if not found then
    return;
  end if;
  update public.intake_sources s set last_used_at = now() where s.id = source.id;
  return query
  select source.id, source.name, source.field_map, source.form_id,
         (select count(*) from public.intake_log l
          where l.source_id = source.id and l.received_at > now() - interval '1 minute') >= 60;
end;
$$;

-- ───────────────────────────── Intake ───────────────────────────────
-- As before (rate limits, duplicate rules, the lead, its timeline, the day's
-- count, the inbox, the log), and now:
--   - a lead from the intake API or Meta may have no form: p_form_id is null,
--     or its form is closed, a draft or archived (the form only counts it);
--   - p_source_id is logged with the request.
-- A public form (channel 'form') must still be live.

drop function public.intake_submit(public.intake_channel, uuid, text, text, text, text, text, text, jsonb, public.app_language);
drop function public.intake_reject(public.intake_channel, uuid, public.intake_outcome, text, text);

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
  p_source_id uuid default null
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
    insert into public.intake_log (channel, source_id, form_id, outcome, detail, ip_hash)
    values (p_channel, p_source_id, case when has_form then p_form_id end, 'rate_limited', 'phone_or_visitor', p_ip_hash);
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
    values (existing.id, 'form_resubmitted', coalesce(case when has_form then form.name end, source_name, ''));
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
      form_id, answers, submitted_language, tags, inbox_since
    )
    values (
      btrim(p_full_name), p_phone,
      (case p_channel when 'form' then 'web_form' when 'meta' then 'facebook' else 'website' end)::public.lead_source,
      coalesce(nullif(btrim(p_subject), ''), case when has_form then form.subject end),
      nullif(btrim(p_preferred_time), ''), nullif(btrim(p_notes), ''),
      case when has_form then form.id end, p_answers, p_language, lead_tags, now()
    )
    returning id into new_id;
  end if;

  if has_form then
    insert into public.form_daily_stats (form_id, day, submissions)
    values (form.id, public.tashkent_today(), 1)
    on conflict (form_id, day) do update set submissions = public.form_daily_stats.submissions + 1;
  end if;

  insert into public.intake_log (channel, source_id, form_id, outcome, lead_id, ip_hash)
  values (p_channel, p_source_id, case when has_form then form.id end, result, new_id, p_ip_hash);

  return query select result, new_id;
end;
$$;

-- A request that made no lead: spam, answers that did not pass, a builder's
-- connection test, a key over its limit, a failure. Logged, nothing else.
create function public.intake_reject(
  p_channel public.intake_channel,
  p_form_id uuid,
  p_outcome public.intake_outcome,
  p_detail text,
  p_ip_hash text,
  p_source_id uuid default null
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
  insert into public.intake_log (channel, source_id, form_id, outcome, detail, ip_hash)
  values (
    p_channel,
    (select s.id from public.intake_sources s where s.id = p_source_id),
    (select f.id from public.lead_forms f where f.id = p_form_id),
    p_outcome, left(p_detail, 500), p_ip_hash
  );
end;
$$;

-- The last requests of one source, newest first, with the lead each made.
create function public.intake_source_log(p_source_id uuid)
returns table (id uuid, received_at timestamptz, outcome public.intake_outcome, detail text, lead_id uuid, lead_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select l.id, l.received_at, l.outcome, l.detail, l.lead_id, d.full_name
  from public.intake_log l
  left join public.leads d on d.id = l.lead_id
  where l.source_id = p_source_id
  order by l.received_at desc, l.id
  limit 100;
end;
$$;

-- Only the server's own key reaches the intake; the owner reads a source's log.
revoke execute on function
  public.intake_source_check(text),
  public.intake_submit(public.intake_channel, uuid, text, text, text, text, text, text, jsonb, public.app_language, uuid),
  public.intake_reject(public.intake_channel, uuid, public.intake_outcome, text, text, uuid)
from public, anon, authenticated;

grant execute on function
  public.intake_source_check(text),
  public.intake_submit(public.intake_channel, uuid, text, text, text, text, text, text, jsonb, public.app_language, uuid),
  public.intake_reject(public.intake_channel, uuid, public.intake_outcome, text, text, uuid)
to service_role;

revoke execute on function public.intake_source_log(uuid) from public, anon;
grant execute on function public.intake_source_log(uuid) to authenticated, service_role;
