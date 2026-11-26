-- The shared inbox and staff alerts. docs/SPEC.md → "Lead forms add-on →
-- Shared inbox and staff alerts".
--
-- 1. leads.inbox_since: when a lead entered the inbox (it arrived, or the same
--    person sent a form again). In the inbox = inbox_since set, nobody's, new.
-- 2. take_lead(): Take and the owner's Assign. One UPDATE decides, so of two
--    people pressing Take together exactly one wins.
-- 3. Staff Telegram: a link code and two switches on profiles. The code and
--    the chat id are not readable through the API.
-- 4. messages: a row may now be for a member of staff instead of a student.
-- 5. report_lead_forms(): the lead funnel split by form.
-- 6. New leads reach open screens through Realtime, with row level security.

-- ───────────────────────────── The inbox ─────────────────────────────

alter table public.leads add column inbox_since timestamptz;

create index leads_inbox_idx on public.leads (inbox_since)
  where inbox_since is not null and assigned_to is null and status = 'new' and archived_at is null;

-- Leads that came through a form before this migration and are still nobody's.
update public.leads
set inbox_since = created_at
where form_id is not null and created_by is null and assigned_to is null and status = 'new' and archived_at is null;

-- Intake, as before, and now it also stamps the moment the lead enters the inbox.
create or replace function public.intake_submit(
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
    set assigned_to = null, taken_at = null, inbox_since = now(),
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
      form_id, answers, submitted_language, tags, inbox_since
    )
    values (
      btrim(p_full_name), p_phone,
      (case p_channel when 'form' then 'web_form' when 'meta' then 'facebook' else 'website' end)::public.lead_source,
      coalesce(nullif(btrim(p_subject), ''), form.subject),
      nullif(btrim(p_preferred_time), ''), nullif(btrim(p_notes), ''),
      form.id, p_answers, p_language, lead_tags, now()
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

-- What waits in the inbox, oldest first.
create function public.lead_inbox()
returns table (
  id uuid,
  full_name text,
  phone text,
  form_id uuid,
  form_name text,
  answers jsonb,
  submitted_language public.app_language,
  inbox_since timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.is_user_request() and not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select l.id, l.full_name, l.phone, l.form_id, f.name, l.answers, l.submitted_language, l.inbox_since
  from public.leads l
  left join public.lead_forms f on f.id = l.form_id
  where l.inbox_since is not null and l.assigned_to is null and l.status = 'new' and l.archived_at is null
  order by l.inbox_since, l.id;
end;
$$;

-- Take a lead from the inbox, or (the owner) give it to someone.
--   Signed-in staff: for themselves; the owner may name another person.
--   The server's own key (the Telegram bot): p_for is the person who pressed Take.
-- taken = false means somebody was faster; assigned_name says who.
create function public.take_lead(p_lead_id uuid, p_for uuid default null)
returns table (taken boolean, assigned_to uuid, assigned_name text, taken_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target uuid := p_for;
  moment timestamptz;
begin
  if public.is_user_request() then
    if not public.is_staff() then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    target := coalesce(p_for, caller);
    if target <> caller and not public.is_owner() then
      raise exception 'Only the owner assigns a lead to someone else' using errcode = '42501';
    end if;
  end if;
  if target is null or not exists (
    select 1 from public.profiles p where p.id = target and p.is_active and p.role in ('owner', 'manager')
  ) then
    raise exception 'Leads are taken by the owner and managers' using errcode = '22023';
  end if;

  -- The one statement that decides. A second Take waits here for the first,
  -- then finds the lead no longer free.
  update public.leads l
  set assigned_to = target, taken_at = now()
  where l.id = p_lead_id and l.archived_at is null
    and l.inbox_since is not null and l.assigned_to is null and l.status = 'new'
  returning l.taken_at into moment;

  if found then
    return query select true, target, (select p.full_name from public.profiles p where p.id = target), moment;
    return;
  end if;

  if not exists (select 1 from public.leads l where l.id = p_lead_id and l.archived_at is null) then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;
  return query
  select false, l.assigned_to, p.full_name, l.taken_at
  from public.leads l left join public.profiles p on p.id = l.assigned_to
  where l.id = p_lead_id;
end;
$$;

-- ─────────────────────────── Staff Telegram ──────────────────────────

alter table public.profiles
  add column telegram_chat_id bigint unique,
  add column staff_link_code text not null unique default public.generate_link_code(),
  add column alerts_on boolean not null default true,
  add column alert_sound boolean not null default true;

-- The link code is a key to someone's alerts, and the chat id is private:
-- neither is readable or writable through the API. A person gets their own
-- link from my_telegram_link(); the bot links and unlinks with the server's key.
revoke select, update on public.profiles from authenticated;
grant select (id, full_name, role, language, is_active, created_at, updated_at, teacher_id, alerts_on, alert_sound)
  on public.profiles to authenticated;
grant update (full_name, role, language, is_active, teacher_id, alerts_on, alert_sound)
  on public.profiles to authenticated;

create function public.my_telegram_link()
returns table (code text, linked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.staff_link_code, p.telegram_chat_id is not null
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active and p.role in ('owner', 'manager');
$$;

create function public.unlink_my_telegram()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set telegram_chat_id = null where id = (select auth.uid());
$$;

-- ───────────────────────────── Messages ──────────────────────────────
-- An alert to staff is logged like every other message, under its dedupe key.

alter table public.messages
  alter column student_id drop not null,
  add column staff_id uuid references public.profiles (id),
  add column lead_id uuid references public.leads (id) on delete set null,
  add constraint messages_for_someone check (num_nonnulls(student_id, staff_id) = 1);

create index messages_lead_idx on public.messages (lead_id) where lead_id is not null;

-- ───────────────────── Report: the funnel by form ────────────────────
-- Per form, in the period: views, leads that came through it, how many were
-- taken, how many became students, leads ÷ views, and the median minutes
-- from entering the inbox to Take.

create function public.report_lead_forms(p_from date, p_to date)
returns table (
  form_id uuid,
  form_name text,
  views bigint,
  leads bigint,
  taken bigint,
  won bigint,
  conversion numeric,
  median_take_minutes numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform public.report_check_period(p_from, p_to);

  return query
  select f.id, f.name, v.views, l.leads, l.taken, l.won,
         case when v.views > 0 then round(l.leads * 100.0 / v.views, 1) end,
         round(l.median::numeric, 1)
  from public.lead_forms f
  cross join lateral (
    select coalesce(sum(s.views), 0)::bigint as views
    from public.form_daily_stats s
    where s.form_id = f.id and s.day >= p_from and s.day < (p_to + interval '1 month')::date
  ) v
  cross join lateral (
    select count(*)::bigint as leads,
           count(d.taken_at)::bigint as taken,
           count(*) filter (where d.status = 'won')::bigint as won,
           percentile_cont(0.5) within group (
             order by extract(epoch from d.taken_at - coalesce(d.inbox_since, d.created_at)) / 60
           ) filter (where d.taken_at is not null) as median
    from public.leads d
    where d.form_id = f.id and d.archived_at is null
      and d.created_at >= public.report_starts(p_from) and d.created_at < public.report_ends(p_to)
  ) l
  where f.archived_at is null or l.leads > 0 or v.views > 0
  order by l.leads desc, v.views desc, f.name;
end;
$$;

-- ───────────────────────────── Grants ───────────────────────────────

revoke execute on function
  public.lead_inbox(),
  public.take_lead(uuid, uuid),
  public.my_telegram_link(),
  public.unlink_my_telegram(),
  public.report_lead_forms(date, date)
from public, anon;

grant execute on function
  public.lead_inbox(),
  public.take_lead(uuid, uuid),
  public.my_telegram_link(),
  public.unlink_my_telegram(),
  public.report_lead_forms(date, date)
to authenticated, service_role;

-- ───────────────────────────── Realtime ─────────────────────────────
-- Open screens hear about new and taken leads. Row level security applies:
-- only the owner and managers receive anything.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads') then
    alter publication supabase_realtime add table public.leads;
  end if;
end;
$$;
