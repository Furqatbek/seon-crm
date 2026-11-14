-- Hardening after the whole-app review against docs/SPEC.md.
--
-- 1. A group whose start date has come becomes active by itself, so it is billed.
-- 2. The centre's name can be shown before sign-in.
-- 3. A manager cannot move a lesson's date to get around the 7-day attendance
--    window, nor write a monthly fee for anything but an enrolment's first month.
-- 4. Reports leave out attendance marked on a lesson that was later cancelled,
--    as the group and student pages do.
-- 5. The message templates are part of the schema, not only of the demo data.

-- ─────────────── 1. Forming groups start on their day ─────────────

-- A new group with a start date ahead is saved as "forming". Nothing used to
-- move it on, and monthly billing only bills active groups.
create function public.activate_started_groups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if public.is_user_request() and not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.groups
  set status = 'active'
  where status = 'forming' and archived_at is null and start_date <= public.tashkent_today();
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke execute on function public.activate_started_groups() from public, anon;
grant execute on function public.activate_started_groups() to authenticated, service_role;

-- Groups that should have started already.
select public.activate_started_groups();

-- The billing day activates first, then bills.
create or replace function public.run_billing_day()
 returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := public.tashkent_today();
begin
  if public.is_user_request() and not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  -- A group whose start date has come is billed from its first billing day.
  perform public.activate_started_groups();
  if extract(day from today)::int <> (select billing_day from public.centre_settings limit 1) then
    return 0;
  end if;
  return public.generate_monthly_charges(date_trunc('month', today)::date);
end;
$$;

-- Daily at 00:05 Tashkent time, ahead of lessons and billing at 00:10.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('activate-groups-daily', '5 19 * * *', 'select public.activate_started_groups()');
  end if;
end;
$$;

-- ───────────────── 2. Centre name before sign-in ──────────────────

-- Only the name: the rest of centre_settings stays staff-only.
create function public.centre_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select centre_name from public.centre_settings limit 1;
$$;

revoke execute on function public.centre_name() from public;
grant execute on function public.centre_name() to anon, authenticated, service_role;

-- ───────────────── 3. What a manager cannot write ─────────────────

-- A lesson stays on its day and in its group. Only the owner moves one by
-- hand; a schedule change goes through rebuild_future_lessons(), which only
-- touches future lessons without attendance.
create function public.guard_lesson_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_api_user() and not public.is_owner()
     and (new.lesson_date is distinct from old.lesson_date or new.group_id is distinct from old.group_id)
  then
    raise exception 'Only the owner can move a lesson' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_lesson_update before update on public.lessons
  for each row execute function public.guard_lesson_update();

revoke execute on function public.guard_lesson_update() from public, anon, authenticated;

-- A manager sets the first-month amount at enrolment and nothing else: the
-- monthly fee they write must be for that enrolment's own student, group and
-- the month it joined in.
drop policy charges_insert on public.charges;

create policy charges_insert on public.charges
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select public.is_owner())
      or ((select public.is_staff()) and (
        (
          type = 'monthly_fee'
          and exists (
            select 1 from public.enrollments e
            where e.id = charges.enrollment_id
              and e.student_id = charges.student_id
              and e.group_id = charges.group_id
              and date_trunc('month', e.joined_on)::date = charges.billing_month
          )
        )
        -- a credit: negative, and the table already requires its note
        or (type = 'adjustment' and amount < 0)
      ))
    )
  );

-- ─────────── 4. Attendance in reports: not cancelled lessons ───────

create or replace function public.report_kpis(p_from date, p_to date)
 returns TABLE(collected bigint, expenses bigint, salaries bigint, costs bigint, profit bigint, total_debt bigint, active_students integer, new_leads integer, won_leads integer, lead_conversion numeric, attendance_rate numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  owner boolean := public.is_owner();
  starts timestamptz := public.report_starts(p_from);
  ends timestamptz := public.report_ends(p_to);
  month_after date := (p_to + interval '1 month')::date;
  v_collected bigint;
  v_expenses bigint;
  v_salaries bigint;
  v_debt bigint;
  v_leads integer;
  v_won integer;
  v_attended bigint;
  v_marked bigint;
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform public.report_check_period(p_from, p_to);

  if owner then
    select coalesce(sum(p.amount), 0) into v_collected
    from public.payments p
    where p.voided_at is null and p.paid_at >= starts and p.paid_at < ends;

    select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e
    where e.archived_at is null and e.spent_on >= p_from and e.spent_on < month_after;

    select coalesce(sum(tp.final_amount), 0) into v_salaries
    from public.teacher_payouts tp
    where tp.month >= p_from and tp.month <= p_to;

    select coalesce(sum(-b.balance), 0) into v_debt
    from public.student_balances b
    where b.balance < 0;
  end if;

  select count(*), count(*) filter (where l.status = 'won') into v_leads, v_won
  from public.leads l
  where l.archived_at is null and l.created_at >= starts and l.created_at < ends;

  select
    count(*) filter (where a.status in ('present', 'late')),
    count(*) filter (where a.status in ('present', 'late', 'absent'))
  into v_attended, v_marked
  from public.attendance a
  join public.lessons ls on ls.id = a.lesson_id
  where ls.status <> 'cancelled' and ls.lesson_date >= p_from and ls.lesson_date < month_after;

  return query select
    v_collected,
    v_expenses,
    v_salaries,
    v_expenses + v_salaries,
    v_collected - v_expenses - v_salaries,
    v_debt,
    public.report_active_students(least(month_after - 1, public.tashkent_today())),
    v_leads,
    v_won,
    case when v_leads > 0 then round(100.0 * v_won / v_leads, 1) end,
    case when v_marked > 0 then round(100.0 * v_attended / v_marked, 1) end;
end;
$$;

create or replace function public.report_attendance(p_from date, p_to date)
 returns TABLE(group_id uuid, group_name text, present integer, late integer, absent integer, excused integer, rate numeric)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform public.report_check_period(p_from, p_to);

  return query
  select
    g.id, g.name,
    (count(*) filter (where a.status = 'present'))::integer,
    (count(*) filter (where a.status = 'late'))::integer,
    (count(*) filter (where a.status = 'absent'))::integer,
    (count(*) filter (where a.status = 'excused'))::integer,
    case when count(*) filter (where a.status <> 'excused') > 0 then
      round(100.0 * count(*) filter (where a.status in ('present', 'late'))
            / count(*) filter (where a.status <> 'excused'), 1)
    end
  from public.attendance a
  join public.lessons ls on ls.id = a.lesson_id
  join public.groups g on g.id = ls.group_id
  where ls.status <> 'cancelled'
    and ls.lesson_date >= p_from and ls.lesson_date < (p_to + interval '1 month')::date
  group by g.id
  order by 7 desc nulls last, g.name, g.id;
end;
$$;

-- ───────────────────── 5. Message templates ───────────────────────

-- Every type × channel × language. SMS texts stay plain Latin with a straight
-- apostrophe (ʻ or Cyrillic make an SMS Unicode: 70 characters per part
-- instead of 160). Texts the owner has already edited are left alone.
insert into public.message_templates (type, channel, language, body)
select t.type::public.message_type, ch.channel::public.message_channel, t.language::public.app_language,
  case when ch.channel = 'telegram' and t.language = 'uz' then replace(t.body, '''', 'ʻ') else t.body end
from (values
  ('payment_due', 'uz', 'Assalomu alaykum! {student} uchun {month} oyi to''lovi: {amount} so''m. Iltimos, {due_date} gacha to''lang. {centre}'),
  ('payment_due', 'ru', 'Здравствуйте! Оплата за {month} для {student}: {amount} сум. Пожалуйста, оплатите до {due_date}. {centre}'),
  ('payment_due', 'en', 'Hello! The {month} fee for {student} is {amount} UZS. Please pay by {due_date}. {centre}'),
  ('payment_overdue', 'uz', 'Assalomu alaykum! {student} uchun {month} oyi to''lovi kechikdi. Qarz: {amount} so''m. Iltimos, to''lovni amalga oshiring. {centre}'),
  ('payment_overdue', 'ru', 'Здравствуйте! Оплата за {month} для {student} просрочена. Долг: {amount} сум. Пожалуйста, оплатите. {centre}'),
  ('payment_overdue', 'en', 'Hello! The {month} fee for {student} is overdue. Amount owed: {amount} UZS. Please pay as soon as you can. {centre}'),
  ('lesson_reminder', 'uz', 'Eslatma: {student}, bugun soat {time} da {group} darsi bor. {centre}'),
  ('lesson_reminder', 'ru', 'Напоминание: {student}, сегодня в {time} занятие в группе {group}. {centre}'),
  ('lesson_reminder', 'en', 'Reminder: {student} has a {group} lesson today at {time}. {centre}'),
  ('custom', 'uz', 'Assalomu alaykum, {student}! {centre}'),
  ('custom', 'ru', 'Здравствуйте, {student}! {centre}'),
  ('custom', 'en', 'Hello, {student}! {centre}')
) as t (type, language, body)
cross join (values ('telegram'), ('sms')) as ch (channel)
on conflict (type, channel, language) do nothing;
