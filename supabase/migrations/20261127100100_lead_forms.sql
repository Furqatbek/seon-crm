-- Public lead forms. docs/SPEC.md → "Lead forms add-on": "Decisions locked in",
-- "Defaults to confirm", "Form builder", "Data model additions".
--
-- 1. lead_forms, lead_form_versions, form_assets, form_daily_stats, intake_log.
--    The owner and managers read and edit forms. Nobody without a login reads
--    any table: the public page asks the server, and the server asks
--    public_form() with its own key.
-- 2. New columns on leads; a lead's phone may now be a foreign number.
-- 3. intake_submit(): the one way a lead comes in from outside. Rate limits,
--    duplicate rules, the lead, its timeline, the day's count and the log are
--    written together.

create type public.form_status as enum ('draft', 'live', 'closed');
create type public.intake_channel as enum ('form', 'api', 'meta');
create type public.intake_outcome as enum ('created', 'merged', 'spam', 'rate_limited', 'invalid', 'test', 'error');

-- ────────────────────────────── Forms ───────────────────────────────

create table public.lead_forms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  -- The address: forms.<centre>/<slug>.
  slug text not null unique check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 60
    and slug not in ('api', 'admin', 'form', 'forms', 'auth', 'tv', 'uz', 'ru', 'en', 'ko', 'static', 'public', 'assets')
  ),
  status public.form_status not null default 'draft',
  subject text,
  source_tag text,
  -- The form document being edited, and the one visitors see.
  draft jsonb not null,
  published jsonb,
  published_version integer not null default 0 check (published_version >= 0),
  published_at timestamptz,
  created_by uuid references public.profiles (id) default auth.uid(),
  updated_by uuid references public.profiles (id) default auth.uid(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A form is live or closed only once something was published.
  check (status = 'draft' or published is not null)
);

create trigger set_updated_at before update on public.lead_forms
  for each row execute function public.set_updated_at();
create trigger guard_archive before insert or update on public.lead_forms
  for each row execute function public.guard_archive();

create table public.lead_form_versions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.lead_forms (id),
  version integer not null check (version > 0),
  content jsonb not null,
  published_by uuid references public.profiles (id) default auth.uid(),
  published_at timestamptz not null default now(),
  unique (form_id, version)
);

create table public.form_assets (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.lead_forms (id),
  kind text not null check (kind in ('logo', 'background', 'image', 'share')),
  -- The object's name in the form-assets bucket.
  path text not null check (btrim(path) <> ''),
  width integer check (width > 0),
  height integer check (height > 0),
  created_at timestamptz not null default now()
);
create index form_assets_form_idx on public.form_assets (form_id);

create table public.form_daily_stats (
  form_id uuid not null references public.lead_forms (id),
  -- A Tashkent day.
  day date not null,
  views integer not null default 0 check (views >= 0),
  submissions integer not null default 0 check (submissions >= 0),
  unique (form_id, day)
);

-- Everything that arrived, whatever became of it. Kept 90 days.
create table public.intake_log (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  channel public.intake_channel not null,
  -- The API key or Meta link it came through, from Phase 22.
  source_id uuid,
  form_id uuid references public.lead_forms (id),
  outcome public.intake_outcome not null,
  lead_id uuid references public.leads (id) on delete set null,
  detail text,
  -- A keyed hash of the visitor's address: enough to count, not to identify.
  ip_hash text
);
create index intake_log_received_idx on public.intake_log (received_at);
create index intake_log_visitor_idx on public.intake_log (form_id, ip_hash, received_at);
create index intake_log_lead_idx on public.intake_log (lead_id) where lead_id is not null;

-- ─────────────────────────────── Leads ──────────────────────────────

alter table public.leads
  add column form_id uuid references public.lead_forms (id),
  -- [{ id, type, label, value }]: each answer with its label as it read then.
  add column answers jsonb,
  add column submitted_language public.app_language,
  add column taken_at timestamptz,
  -- The Meta leadgen id, from Phase 23.
  add column external_id text unique,
  add column tags text[] not null default '{}';

create index leads_form_idx on public.leads (form_id) where form_id is not null;

-- "Uzbek phone format with an international option": any full international
-- number is accepted for a lead. Students and teachers stay Uzbek numbers.
alter table public.leads drop constraint leads_phone_check;
alter table public.leads add constraint leads_phone_check check (phone ~ '^\+[1-9]\d{7,14}$');

-- The timeline gains one kind: the same person sent a form again (body = the form's name).
alter table public.lead_activities drop constraint lead_activities_kind_check;
alter table public.lead_activities add constraint lead_activities_kind_check
  check (kind in ('note', 'call', 'status_change', 'form_resubmitted'));

-- ─────────────────────── Row level security ─────────────────────────

alter table public.lead_forms enable row level security;
alter table public.lead_form_versions enable row level security;
alter table public.form_assets enable row level security;
alter table public.form_daily_stats enable row level security;
alter table public.intake_log enable row level security;

revoke all on public.lead_forms, public.lead_form_versions, public.form_assets,
  public.form_daily_stats, public.intake_log from public, anon, authenticated;

grant select, insert, update on public.lead_forms to authenticated;
grant select, insert on public.lead_form_versions, public.form_assets to authenticated;
grant select on public.form_daily_stats, public.intake_log to authenticated;

create policy lead_forms_select on public.lead_forms
  for select to authenticated using ((select public.is_staff()));
create policy lead_forms_insert on public.lead_forms
  for insert to authenticated with check ((select public.is_staff()));
create policy lead_forms_update on public.lead_forms
  for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

create policy lead_form_versions_select on public.lead_form_versions
  for select to authenticated using ((select public.is_staff()));
create policy lead_form_versions_insert on public.lead_form_versions
  for insert to authenticated
  with check ((select public.is_staff()) and published_by = (select auth.uid()));

create policy form_assets_select on public.form_assets
  for select to authenticated using ((select public.is_staff()));
create policy form_assets_insert on public.form_assets
  for insert to authenticated with check ((select public.is_staff()));

create policy form_daily_stats_select on public.form_daily_stats
  for select to authenticated using ((select public.is_staff()));
create policy intake_log_select on public.intake_log
  for select to authenticated using ((select public.is_staff()));

-- Form pictures are shown on a public page, so the bucket is public to read by
-- link. Only the owner and managers upload. PNG, JPG or WebP up to 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-assets', 'form-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy form_assets_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'form-assets' and (select public.is_staff()));

-- ───────────────────────── The public page ──────────────────────────
-- What the server needs to show a form, or null when there is no such form.
-- Only the published document: a draft never leaves the CRM.

create function public.public_form(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', f.id,
    'name', f.name,
    'slug', f.slug,
    'status', f.status,
    'subject', f.subject,
    'source_tag', f.source_tag,
    'version', f.published_version,
    'document', f.published,
    'assets', coalesce((
      select jsonb_object_agg(a.id, jsonb_build_object('path', a.path, 'width', a.width, 'height', a.height))
      from public.form_assets a where a.form_id = f.id
    ), '{}'::jsonb)
  )
  from public.lead_forms f
  where f.slug = p_slug and f.archived_at is null and f.status in ('live', 'closed') and f.published is not null;
$$;

-- One more view today. Counted on the server; nothing is stored about the visitor.
create function public.form_count_view(p_form_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.form_daily_stats (form_id, day, views)
  select f.id, public.tashkent_today(), 1 from public.lead_forms f where f.id = p_form_id
  on conflict (form_id, day) do update set views = public.form_daily_stats.views + 1;
$$;

-- ───────────────────────────── Intake ───────────────────────────────
-- Called by the server after the answers were checked against the form.
--
-- Rate limits:  5 per visitor per form per 10 minutes; 3 per phone per day.
-- Duplicates:   the phone of an open lead → no new lead; "submitted again" goes
--               on its timeline and it returns to the inbox (unassigned, new).
--               The phone of a student → a new lead tagged existing_student.
-- Returns the outcome and the lead it created or merged into.

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
  p_language public.app_language default null
)
returns table (outcome public.intake_outcome, lead_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  form public.lead_forms;
  existing public.leads;
  new_id uuid;
  lead_tags text[] := '{}';
  result public.intake_outcome;
begin
  select * into form from public.lead_forms f where f.id = p_form_id;
  if not found or form.archived_at is not null or form.status <> 'live' then
    insert into public.intake_log (channel, form_id, outcome, detail, ip_hash)
    values (p_channel, case when found then p_form_id end, 'invalid', 'form_closed', p_ip_hash);
    return query select 'invalid'::public.intake_outcome, null::uuid;
    return;
  end if;

  -- One at a time per visitor and per phone, always in this order.
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('intake:visitor:' || p_form_id || ':' || p_ip_hash, 0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('intake:phone:' || p_phone, 0));

  if (
    p_ip_hash is not null and (
      select count(*) from public.intake_log l
      where l.form_id = p_form_id and l.ip_hash = p_ip_hash
        and l.received_at > now() - interval '10 minutes'
        and l.outcome in ('created', 'merged', 'spam')
    ) >= 5
  ) or (
    select count(*) from public.intake_log l
    join public.leads d on d.id = l.lead_id
    where d.phone = p_phone and l.received_at > now() - interval '1 day'
      and l.outcome in ('created', 'merged')
  ) >= 3 then
    insert into public.intake_log (channel, form_id, outcome, ip_hash)
    values (p_channel, p_form_id, 'rate_limited', p_ip_hash);
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
    insert into public.lead_activities (lead_id, kind, body)
    values (existing.id, 'form_resubmitted', form.name);
    -- Back to the inbox: nobody's, and new again. A lead on a trial keeps its
    -- stage, since the trial lesson is still booked.
    update public.leads d
    set assigned_to = null, taken_at = null,
        status = case when d.status = 'trial' then d.status else 'new'::public.lead_status end
    where d.id = existing.id;
  else
    result := 'created';
    if form.source_tag is not null and btrim(form.source_tag) <> '' then
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
      form_id, answers, submitted_language, tags
    )
    values (
      btrim(p_full_name), p_phone,
      (case p_channel when 'form' then 'web_form' when 'meta' then 'facebook' else 'website' end)::public.lead_source,
      coalesce(nullif(btrim(p_subject), ''), form.subject),
      nullif(btrim(p_preferred_time), ''), nullif(btrim(p_notes), ''),
      form.id, p_answers, p_language, lead_tags
    )
    returning id into new_id;
  end if;

  insert into public.form_daily_stats (form_id, day, submissions)
  values (form.id, public.tashkent_today(), 1)
  on conflict (form_id, day) do update set submissions = public.form_daily_stats.submissions + 1;

  insert into public.intake_log (channel, form_id, outcome, lead_id, ip_hash)
  values (p_channel, form.id, result, new_id, p_ip_hash);

  return query select result, new_id;
end;
$$;

-- Spam and answers that did not pass the checks: logged, nothing else.
create function public.intake_reject(
  p_channel public.intake_channel,
  p_form_id uuid,
  p_outcome public.intake_outcome,
  p_detail text,
  p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('spam', 'invalid', 'error') then
    raise exception 'Not a rejection' using errcode = '22023';
  end if;
  insert into public.intake_log (channel, form_id, outcome, detail, ip_hash)
  values (p_channel, (select f.id from public.lead_forms f where f.id = p_form_id), p_outcome, left(p_detail, 500), p_ip_hash);
end;
$$;

-- Only the server's own key reaches these.
revoke execute on function
  public.public_form(text),
  public.form_count_view(uuid),
  public.intake_submit(public.intake_channel, uuid, text, text, text, text, text, text, jsonb, public.app_language),
  public.intake_reject(public.intake_channel, uuid, public.intake_outcome, text, text)
from public, anon, authenticated;

grant execute on function
  public.public_form(text),
  public.form_count_view(uuid),
  public.intake_submit(public.intake_channel, uuid, text, text, text, text, text, text, jsonb, public.app_language),
  public.intake_reject(public.intake_channel, uuid, public.intake_outcome, text, text)
to service_role;

-- The log is kept 90 days.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'intake-log-prune', '40 19 * * *',
      $job$delete from public.intake_log where received_at < now() - interval '90 days'$job$
    );
  end if;
end;
$$;
