-- Notifications: who the reminders job writes to, the Remind button for a
-- manager, and the cron job that calls the app every 15 minutes.
-- docs/SPEC.md → "Notifications".

-- ─────────────────── A manager may press Remind ───────────────────

-- Owner: any message. Manager: a one-off message to a student, and the
-- Remind button on Debtors (a payment_overdue message keyed "remind:…", at
-- most once per student per day). Delivery status is still written only by
-- the server with the service role.
drop policy messages_insert on public.messages;

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    status = 'queued'
    and sent_at is null
    and (
      (select public.is_owner())
      or (
        (select public.is_staff())
        and (type = 'custom' or (type = 'payment_overdue' and dedupe_key like 'remind:%'))
      )
    )
  );

-- ─────────────── What the reminders job needs to read ─────────────
-- Called by the server with the service role only.

-- Students who owe money today, how to reach them, and the recent billing
-- months they have a monthly fee for.
create function public.notify_debtors()
returns table (
  student_id uuid,
  full_name text,
  language public.app_language,
  telegram_chat_id bigint,
  parent_phone text,
  phone text,
  debt bigint,
  charged_months text[]
)
language sql
stable
set search_path = ''
as $$
  select
    s.id, s.full_name, s.language, s.telegram_chat_id, s.parent_phone, s.phone,
    -b.balance,
    coalesce(
      (
        select array_agg(distinct to_char(c.billing_month, 'YYYY-MM'))
        from public.charges c
        where c.student_id = s.id and c.type = 'monthly_fee'
          and c.billing_month >= (date_trunc('month', public.tashkent_today()) - interval '1 month')::date
      ),
      '{}'
    )
  from public.student_balances b
  join public.students s on s.id = b.student_id
  where b.balance < 0 and s.archived_at is null
  order by s.id;
$$;

-- Lessons still scheduled on the given days, with every active student of
-- the group who has Telegram linked (lesson reminders are Telegram only).
create function public.notify_lessons(p_days date[])
returns table (
  lesson_id uuid,
  group_name text,
  lesson_date date,
  start_time time,
  student_id uuid,
  full_name text,
  language public.app_language,
  telegram_chat_id bigint,
  parent_phone text,
  phone text
)
language sql
stable
set search_path = ''
as $$
  select
    l.id, g.name, l.lesson_date, l.start_time,
    s.id, s.full_name, s.language, s.telegram_chat_id, s.parent_phone, s.phone
  from public.lessons l
  join public.groups g on g.id = l.group_id
  join public.enrollments e on e.group_id = l.group_id and e.status = 'active' and e.joined_on <= l.lesson_date
  join public.students s on s.id = e.student_id
  where l.status = 'scheduled'
    and l.lesson_date = any (p_days)
    and s.status = 'active' and s.archived_at is null
    and s.telegram_chat_id is not null
  order by l.lesson_date, l.start_time, l.id, s.id;
$$;

revoke execute on function public.notify_debtors(), public.notify_lessons(date[])
from public, anon, authenticated;
grant execute on function public.notify_debtors(), public.notify_lessons(date[]) to service_role;

-- ───────────────────── Every 15 minutes: reminders ─────────────────

-- Calls POST <app_url>/api/jobs/reminders with the cron secret. Both are kept
-- in Supabase Vault under the names 'app_url' and 'cron_secret'; until they
-- are set the job does nothing.
create function public.call_reminders_job()
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

  select ds.decrypted_secret into app_url from vault.decrypted_secrets ds where ds.name = 'app_url';
  select ds.decrypted_secret into secret from vault.decrypted_secrets ds where ds.name = 'cron_secret';
  if coalesce(app_url, '') = '' or coalesce(secret, '') = '' then
    return null;
  end if;

  select net.http_post(
    url := rtrim(app_url, '/') || '/api/jobs/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  ) into request_id;
  return request_id;
end;
$$;

revoke execute on function public.call_reminders_job() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('reminders-every-15-minutes', '*/15 * * * *', 'select public.call_reminders_job()');
  end if;
end;
$$;
