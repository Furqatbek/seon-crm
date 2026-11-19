-- Draft salaries follow the money by themselves.
--
-- A payout was worked out only when the owner pressed Calculate, so a payment
-- voided (or taken) afterwards left the draft showing the old share until
-- someone pressed Calculate again. Now, once a month has been calculated, its
-- draft payouts are refreshed whenever a payment for that month is taken,
-- voided or archived, or a lesson of that month is held, cancelled or given to
-- another teacher. Paid payouts stay locked, as before.

-- The calculation itself, without the "who is asking" checks: used by
-- Calculate and by the triggers below. Not callable through the API.
create function public.refresh_teacher_payouts(p_month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_end date := (p_month + interval '1 month')::date;
  changed integer;
begin
  with rate as (
    select t.id as teacher_id, r.pay_type, r.amount, r.percent
    from public.teachers t
    cross join lateral (
      select pr.pay_type, pr.amount, pr.percent
      from public.teacher_pay_rates pr
      where pr.teacher_id = t.id and pr.effective_from <= p_month
      order by pr.effective_from desc
      limit 1
    ) r
    where t.is_active and t.archived_at is null
  ),
  taught as (
    select l.teacher_id, l.group_id, count(*)::bigint as lessons
    from public.lessons l
    where l.status = 'held' and l.lesson_date >= p_month and l.lesson_date < month_end
    group by l.teacher_id, l.group_id
  ),
  collected as (
    select g.teacher_id, g.id as group_id, sum(p.amount)::bigint as collected
    from public.payments p
    join public.groups g on g.id = p.group_id
    where p.voided_at is null
      and p.paid_at >= (p_month::timestamp at time zone 'Asia/Tashkent')
      and p.paid_at < (month_end::timestamp at time zone 'Asia/Tashkent')
    group by g.teacher_id, g.id
  ),
  line as (
    select
      r.teacher_id, t.group_id, t.lessons, 0::bigint as collected,
      case when r.pay_type = 'per_lesson' then public.round_to_thousand(r.amount * t.lessons) end as amount
    from rate r
    join taught t on t.teacher_id = r.teacher_id
    where r.pay_type in ('fixed_monthly', 'per_lesson')
    union all
    select
      r.teacher_id, c.group_id, 0::bigint, c.collected,
      -- percent has two decimals: 12.5 % of x = x × 1250 ÷ 10000
      public.round_to_thousand(c.collected * (r.percent * 100)::bigint, 10000)
    from rate r
    join collected c on c.teacher_id = r.teacher_id
    where r.pay_type = 'percent_of_revenue'
  ),
  total as (
    select
      l.teacher_id,
      sum(l.lessons)::bigint as lessons,
      sum(l.collected)::bigint as collected,
      coalesce(sum(l.amount), 0)::bigint as amount,
      jsonb_agg(
        jsonb_build_object(
          'group_id', l.group_id,
          'group_name', g.name,
          'lessons', l.lessons,
          'collected', l.collected,
          'amount', l.amount
        )
        order by g.name, l.group_id
      ) as breakdown
    from line l
    join public.groups g on g.id = l.group_id
    group by l.teacher_id
  ),
  payout as (
    select
      r.teacher_id,
      r.pay_type,
      case when r.pay_type = 'percent_of_revenue' then coalesce(t.collected, 0) else coalesce(t.lessons, 0) end as basis,
      case when r.pay_type = 'percent_of_revenue' then r.percent else r.amount end as rate,
      case when r.pay_type = 'fixed_monthly' then r.amount else coalesce(t.amount, 0) end as calculated,
      coalesce(t.breakdown, '[]'::jsonb) as breakdown
    from rate r
    left join total t on t.teacher_id = r.teacher_id
  )
  insert into public.teacher_payouts as tp
    (teacher_id, month, pay_type, basis, rate, calculated, final_amount, breakdown)
  select p.teacher_id, p_month, p.pay_type, p.basis, p.rate, p.calculated, p.calculated, p.breakdown
  from payout p
  on conflict (teacher_id, month) where archived_at is null do update
    set pay_type = excluded.pay_type,
        basis = excluded.basis,
        rate = excluded.rate,
        calculated = excluded.calculated,
        breakdown = excluded.breakdown
    -- Paid payouts are locked: they are skipped, not refreshed.
    where tp.status = 'draft';

  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- Calculate: the owner's button. The same checks as before, then the calculation.
create or replace function public.calculate_teacher_payouts(p_month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_user_request() and not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'A month is the 1st day of the month' using errcode = '22023';
  end if;
  if p_month > date_trunc('month', public.tashkent_today())::date then
    raise exception 'The month has not started' using errcode = 'ES001';
  end if;
  return public.refresh_teacher_payouts(p_month);
end;
$$;

-- Refreshes a month's drafts, if that month has been calculated at all.
create function public.refresh_drafts_for(p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date := date_trunc('month', p_day)::date;
begin
  if exists (
    select 1 from public.teacher_payouts tp
    where tp.month = month_start and tp.status = 'draft' and tp.archived_at is null
  ) then
    perform public.refresh_teacher_payouts(month_start);
  end if;
end;
$$;

create function public.payouts_follow_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The month the money was received in, Tashkent time.
  perform public.refresh_drafts_for((new.paid_at at time zone 'Asia/Tashkent')::date);
  if tg_op = 'UPDATE' and date_trunc('month', old.paid_at at time zone 'Asia/Tashkent') <> date_trunc('month', new.paid_at at time zone 'Asia/Tashkent') then
    perform public.refresh_drafts_for((old.paid_at at time zone 'Asia/Tashkent')::date);
  end if;
  return null;
end;
$$;

create trigger z_payouts_follow_payment
  after insert or update of amount, group_id, paid_at, voided_at, archived_at on public.payments
  for each row execute function public.payouts_follow_payment();

create function public.payouts_follow_lesson()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_drafts_for(old.lesson_date);
    return null;
  end if;
  perform public.refresh_drafts_for(new.lesson_date);
  if tg_op = 'UPDATE' and date_trunc('month', old.lesson_date) <> date_trunc('month', new.lesson_date) then
    perform public.refresh_drafts_for(old.lesson_date);
  end if;
  return null;
end;
$$;

create trigger z_payouts_follow_lesson
  after insert or delete or update of status, teacher_id, lesson_date, group_id on public.lessons
  for each row execute function public.payouts_follow_lesson();

revoke execute on function
  public.refresh_teacher_payouts(date),
  public.refresh_drafts_for(date),
  public.payouts_follow_payment(),
  public.payouts_follow_lesson()
from public, anon, authenticated;

-- Drafts that are stale today: bring this month's and last month's up to date once.
select public.refresh_drafts_for(public.tashkent_today());
select public.refresh_drafts_for((date_trunc('month', public.tashkent_today()) - interval '1 day')::date);
