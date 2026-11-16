-- Archiving finance records. docs/SPEC.md → "Screens → Finance",
-- "Payments and balance", "Roles and permissions".
--
-- The owner can archive a payment, a charge, an expense or a teacher payout
-- that should not have been entered. Nothing is deleted: the row stays, marked
-- with archived_at, and drops out of every list, balance, total and report.
--   payments          archiving also voids the payment, which is what already
--                     takes it out of every total
--   charges           left out of balances, debt and "billed"; a monthly fee
--                     that is archived can be generated again
--   expenses          already had archived_at; nothing changes here
--   teacher_payouts   left out of salaries; the month can be calculated again
--
-- Custom error code raised below: EA001 only archived_at can be changed.

alter table public.payments add column archived_at timestamptz;
alter table public.charges add column archived_at timestamptz;
alter table public.teacher_payouts add column archived_at timestamptz;

-- Only the owner archives or restores a record.
create trigger guard_archive before insert or update on public.payments
  for each row execute function public.guard_archive();
create trigger guard_archive before insert or update on public.charges
  for each row execute function public.guard_archive();
create trigger guard_archive before insert or update on public.teacher_payouts
  for each row execute function public.guard_archive();

-- ──────────────────────────── Payments ────────────────────────────

-- An archived payment is a voided payment that is also hidden. Voiding is
-- what every balance and report already understands, so archiving one that
-- is not voided yet voids it first. Whoever voids is recorded by the
-- database, not taken from the request.
create function public.payments_void_and_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived_at is not null and old.archived_at is null and new.voided_at is null then
    new.voided_at := now();
    new.void_reason := 'Archived';
  end if;
  if new.voided_at is not null and old.voided_at is null and public.is_api_user() then
    new.voided_by := (select auth.uid());
  end if;
  return new;
end;
$$;

-- Runs before guard_payment_update (triggers fire in name order), which then
-- sees the void as part of this same change.
create trigger a_payments_void_and_archive before update on public.payments
  for each row execute function public.payments_void_and_archive();

-- The void no longer has to carry the owner's id in the request: the trigger
-- above sets it. That lets the owner archive a payment someone else voided.
drop policy payments_update on public.payments;
create policy payments_update on public.payments
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- ───────────────────────────── Charges ─────────────────────────────

-- A charge is still never edited. The one change allowed is archiving it,
-- by the owner.
grant update (archived_at) on public.charges to authenticated;

create policy charges_archive on public.charges
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

create function public.guard_charge_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'archived_at') is distinct from (to_jsonb(old) - 'archived_at') then
    raise exception 'A charge cannot be edited' using errcode = 'EA001';
  end if;
  return new;
end;
$$;

create trigger guard_charge_update before update on public.charges
  for each row execute function public.guard_charge_update();

-- One monthly fee per enrolment and month among the charges that count: an
-- archived fee does not stand in the way of generating the month again.
drop index public.charges_one_monthly_fee;
create unique index charges_one_monthly_fee on public.charges (enrollment_id, billing_month)
  where type = 'monthly_fee' and archived_at is null;

-- A balance is payments minus charges; archived charges are not charges.
create or replace view public.student_balances
with (security_invoker = true) as
with paid as (
  select student_id, sum(amount) as paid
  from public.payments
  where voided_at is null
  group by student_id
),
charged as (
  select
    student_id,
    sum(amount) as charged,
    coalesce(sum(-amount) filter (where amount < 0), 0) as credits
  from public.charges
  where archived_at is null
  group by student_id
),
-- Money in covers the oldest fees first.
running as (
  select
    student_id,
    billing_month,
    sum(amount) over (
      partition by student_id order by billing_month, created_at, id
    ) as fees_so_far
  from public.charges
  where amount > 0 and archived_at is null
)
select
  s.id as student_id,
  coalesce(c.charged, 0)::bigint as charged,
  coalesce(p.paid, 0)::bigint as paid,
  (coalesce(p.paid, 0) - coalesce(c.charged, 0))::bigint as balance,
  (
    select min(r.billing_month)
    from running r
    where r.student_id = s.id
      and r.fees_so_far > coalesce(p.paid, 0) + coalesce(c.credits, 0)
  ) as oldest_unpaid_month
from public.students s
left join paid p on p.student_id = s.id
left join charged c on c.student_id = s.id;

create or replace function public.preview_monthly_charges(p_month date)
 returns TABLE(enrollment_id uuid, student_id uuid, student_name text, group_id uuid, group_name text, base_amount bigint, discount_amount bigint, amount bigint)
language plpgsql
stable
set search_path = ''
as $$
begin
  if public.is_user_request() and not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'A billing month is the 1st of a month' using errcode = '22023';
  end if;

  return query
  select
    e.id,
    s.id,
    s.full_name,
    g.id,
    g.name,
    f.fee,
    public.discount_amount(f.fee, e.discount_kind, e.discount_value),
    f.fee - public.discount_amount(f.fee, e.discount_kind, e.discount_value)
  from public.enrollments e
  join public.students s on s.id = e.student_id
  join public.groups g on g.id = e.group_id
  cross join lateral (select public.group_fee_for(g.id, p_month) as fee) f
  where e.status = 'active'
    and e.joined_on < (p_month + interval '1 month')::date
    and g.status = 'active'
    and g.archived_at is null
    and g.start_date < (p_month + interval '1 month')::date
    and s.status = 'active'
    and s.archived_at is null
    and not exists (
      select 1 from public.charges c
      where c.enrollment_id = e.id and c.billing_month = p_month and c.type = 'monthly_fee'
        and c.archived_at is null
    )
  order by g.name, s.full_name;
end;
$$;

create or replace function public.generate_monthly_charges(p_month date)
 returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  created integer;
begin
  if public.is_user_request() and not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'A billing month is the 1st of a month' using errcode = '22023';
  end if;
  -- People bill the current month only. Who is billed is decided from how
  -- enrolments, students and groups stand today, which says nothing reliable
  -- about an earlier month and nothing yet about a later one.
  if public.is_user_request() and p_month <> date_trunc('month', public.tashkent_today())::date then
    raise exception 'Only the current month can be billed' using errcode = 'EF001';
  end if;

  insert into public.charges (
    student_id, enrollment_id, group_id, billing_month, type, base_amount, discount_amount,
    amount, is_prorated, created_by
  )
  select
    p.student_id, p.enrollment_id, p.group_id, p_month, 'monthly_fee', p.base_amount,
    p.discount_amount, p.amount, false, (select auth.uid())
  from public.preview_monthly_charges(p_month) p
  on conflict (enrollment_id, billing_month) where type = 'monthly_fee' and archived_at is null do nothing;

  get diagnostics created = row_count;
  return created;
end;
$$;

create or replace function public.finance_month_summary(p_month date)
 returns TABLE(collected bigint, billed bigint, debt bigint, expenses bigint)
language plpgsql
stable
set search_path = ''
as $$
begin
  if public.is_user_request() and not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query select
    (
      select coalesce(sum(p.amount), 0)::bigint
      from public.payments p
      where p.voided_at is null
        and p.paid_at >= (p_month::timestamp at time zone 'Asia/Tashkent')
        and p.paid_at < ((p_month + interval '1 month')::timestamp at time zone 'Asia/Tashkent')
    ),
    (select coalesce(sum(c.amount), 0)::bigint from public.charges c where c.billing_month = p_month and c.archived_at is null),
    (select coalesce(sum(-b.balance), 0)::bigint from public.student_balances b where b.balance < 0),
    (
      select coalesce(sum(e.amount), 0)::bigint
      from public.expenses e
      where e.archived_at is null
        and e.spent_on >= p_month
        and e.spent_on < (p_month + interval '1 month')::date
    );
end;
$$;

create or replace function public.report_debt_age()
 returns TABLE(bucket text, amount bigint, students integer)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  with debtor as (
    select b.student_id, -b.balance as debt
    from public.student_balances b
    where b.balance < 0
  ),
  owed as (
    select
      d.student_id, d.debt, c.amount, c.billing_month,
      coalesce(sum(c.amount) over (
        partition by d.student_id
        order by c.billing_month desc, c.created_at desc, c.id
        rows between unbounded preceding and 1 preceding
      ), 0) as newer
    from debtor d
    join public.charges c on c.student_id = d.student_id and c.amount > 0 and c.archived_at is null
  ),
  part as (
    select
      o.student_id,
      least(o.amount, o.debt - o.newer) as unpaid,
      public.tashkent_today() - o.billing_month as age
    from owed o
    where o.debt > o.newer
  ),
  aged as (
    select
      case when p.age <= 30 then '0_30' when p.age <= 60 then '31_60' else 'over_60' end as bucket,
      p.student_id, p.unpaid
    from part p
  )
  select
    b.bucket,
    coalesce(sum(a.unpaid), 0)::bigint,
    count(distinct a.student_id)::integer
  from unnest(array['0_30', '31_60', 'over_60']) with ordinality as b (bucket, position)
  left join aged a on a.bucket = b.bucket
  group by b.bucket, b.position
  order by b.position;
end;
$$;

create or replace function public.notify_debtors()
 returns TABLE(student_id uuid, full_name text, language app_language, telegram_chat_id bigint, parent_phone text, phone text, debt bigint, charged_months text[])
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
        where c.student_id = s.id and c.type = 'monthly_fee' and c.archived_at is null
          and c.billing_month >= (date_trunc('month', public.tashkent_today()) - interval '1 month')::date
      ),
      '{}'
    )
  from public.student_balances b
  join public.students s on s.id = b.student_id
  where b.balance < 0 and s.archived_at is null
  order by s.id;
$$;

create or replace function public.list_adjustments(p_month date, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 returns TABLE(kind text, happened_at timestamp with time zone, student_id uuid, student_name text, group_name text, amount bigint, receipt_no bigint, by_name text, reason text, total bigint)
language plpgsql
stable
set search_path = ''
as $$
declare
  starts timestamptz := p_month::timestamp at time zone 'Asia/Tashkent';
  ends timestamptz := (p_month + interval '1 month')::timestamp at time zone 'Asia/Tashkent';
begin
  if public.is_user_request() and not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  with entry as (
    select
      'credit'::text as kind, c.created_at as happened_at, c.student_id, c.group_id,
      -c.amount as amount, null::bigint as receipt_no, c.created_by as by_id, c.note as reason,
      c.id
    from public.charges c
    where c.type = 'adjustment' and c.amount < 0 and c.archived_at is null
      and c.created_at >= starts and c.created_at < ends
    union all
    select
      'void'::text, p.voided_at, p.student_id, p.group_id,
      p.amount, p.receipt_no, p.voided_by, p.void_reason,
      p.id
    from public.payments p
    where p.voided_at >= starts and p.voided_at < ends and p.archived_at is null
  )
  select
    e.kind, e.happened_at, e.student_id, s.full_name, g.name, e.amount, e.receipt_no,
    pr.full_name, e.reason, count(*) over ()
  from entry e
  join public.students s on s.id = e.student_id
  left join public.groups g on g.id = e.group_id
  left join public.profiles pr on pr.id = e.by_id
  order by e.happened_at desc, e.id
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
end;
$$;

-- ───────────────────────── Teacher payouts ─────────────────────────

-- One payout per teacher and month among those that count: once a payout is
-- archived, Calculate makes a fresh draft for that month.
alter table public.teacher_payouts drop constraint teacher_payouts_teacher_id_month_key;
create unique index teacher_payouts_teacher_id_month_key on public.teacher_payouts (teacher_id, month)
  where archived_at is null;

-- A paid payout is locked, and so is an archived one. The one change a paid
-- payout allows is being archived.
create or replace function public.guard_payout_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is not null then
    raise exception 'An archived payout cannot be changed' using errcode = '42501';
  end if;
  if old.status = 'paid'
     and (to_jsonb(new) - 'archived_at' - 'updated_at') is distinct from (to_jsonb(old) - 'archived_at' - 'updated_at') then
    raise exception 'A paid payout cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.calculate_teacher_payouts(p_month date)
 returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_end date := (p_month + interval '1 month')::date;
  changed integer;
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
    where tp.month >= p_from and tp.month <= p_to and tp.archived_at is null;

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

create or replace function public.report_collected_vs_expenses(p_from date, p_to date)
 returns TABLE(month date, collected bigint, expenses bigint, salaries bigint, costs bigint)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform public.report_check_period(p_from, p_to);

  return query
  select x.month, x.collected, x.expenses, x.salaries, x.expenses + x.salaries
  from (
    select
      m.month::date as month,
      (
        select coalesce(sum(p.amount), 0)::bigint
        from public.payments p
        where p.voided_at is null
          and p.paid_at >= public.report_starts(m.month::date)
          and p.paid_at < public.report_ends(m.month::date)
      ) as collected,
      (
        select coalesce(sum(e.amount), 0)::bigint
        from public.expenses e
        where e.archived_at is null
          and e.spent_on >= m.month::date and e.spent_on < (m.month + interval '1 month')::date
      ) as expenses,
      (
        select coalesce(sum(tp.final_amount), 0)::bigint
        from public.teacher_payouts tp
        where tp.month = m.month::date and tp.archived_at is null
      ) as salaries
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 month') as m (month)
  ) x
  order by x.month;
end;
$$;

revoke execute on function public.payments_void_and_archive(), public.guard_charge_update()
from public, anon, authenticated;
