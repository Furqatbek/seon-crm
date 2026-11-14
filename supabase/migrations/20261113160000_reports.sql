-- Reports: one function for the KPI row and one per chart.
-- docs/SPEC.md → "Screens → Reports". A period is whole months, from the 1st
-- of p_from to the end of the month of p_to. Every money figure uses the same
-- rule as Finance: collected = non-voided payments received in the Tashkent
-- month, expenses = non-archived expenses spent in it, salaries = that
-- month's payouts, debt = balances below zero today.
--
-- All run with the caller's rights. The money functions are the owner's;
-- a manager gets the lead, attendance and student-count parts only.
--
-- Custom error code raised below: ER001 the period is not valid.

create function public.report_check_period(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null
     or extract(day from p_from) <> 1 or extract(day from p_to) <> 1
     or p_from > p_to or p_to >= (p_from + interval '36 months') then
    raise exception 'A period is 1 to 36 whole months' using errcode = 'ER001';
  end if;
end;
$$;

-- Start and end (exclusive) of a period as instants in Tashkent time.
create function public.report_starts(p_from date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select p_from::timestamp at time zone 'Asia/Tashkent'; $$;

create function public.report_ends(p_to date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select (p_to + interval '1 month')::timestamp at time zone 'Asia/Tashkent'; $$;

-- Students with a running enrolment on a day.
create function public.report_active_students(p_day date)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(distinct e.student_id)::integer
  from public.enrollments e
  where e.joined_on <= p_day and (e.left_on is null or e.left_on > p_day);
$$;

-- ─────────────────────────── KPI row ─────────────────────────────

-- For a manager the money figures are null.
create function public.report_kpis(p_from date, p_to date)
returns table (
  collected bigint,
  expenses bigint,
  salaries bigint,
  costs bigint,          -- expenses + salaries
  profit bigint,
  total_debt bigint,
  active_students integer,
  new_leads integer,
  won_leads integer,
  lead_conversion numeric,
  attendance_rate numeric
)
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
  where ls.lesson_date >= p_from and ls.lesson_date < month_after;

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

-- ──────────────── 1. Collected vs expenses by month ───────────────

create function public.report_collected_vs_expenses(p_from date, p_to date)
returns table (month date, collected bigint, expenses bigint, salaries bigint, costs bigint)
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
        where tp.month = m.month::date
      ) as salaries
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 month') as m (month)
  ) x
  order by x.month;
end;
$$;

-- ─────────────── 2. Revenue by group and by subject ───────────────

-- dimension 'group': one row per group; 'subject': one row per subject.
-- Both add up to Collected for the period.
create function public.report_revenue(p_from date, p_to date)
returns table (dimension text, name text, collected bigint)
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
  with paid as (
    select g.id, g.name, g.subject, sum(p.amount)::bigint as collected
    from public.payments p
    join public.groups g on g.id = p.group_id
    where p.voided_at is null
      and p.paid_at >= public.report_starts(p_from) and p.paid_at < public.report_ends(p_to)
    group by g.id
  )
  select x.dimension, x.name, x.collected
  from (
    select 'group'::text as dimension, paid.name, paid.collected, paid.id::text as tie from paid
    union all
    select 'subject', paid.subject, sum(paid.collected)::bigint, paid.subject from paid group by paid.subject
  ) x
  order by x.dimension, x.collected desc, x.name, x.tie;
end;
$$;

-- ─────────── 3. Lead funnel by stage, split by source ─────────────

-- Leads created in the period, by the stage they are in now. dimension
-- 'stage': one row per stage, in funnel order; 'source': one row per source
-- with how many of its leads were won.
create function public.report_lead_funnel(p_from date, p_to date)
returns table (dimension text, key text, leads integer, won integer)
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
  with created as (
    select l.status, l.source
    from public.leads l
    where l.archived_at is null
      and l.created_at >= public.report_starts(p_from) and l.created_at < public.report_ends(p_to)
  )
  select x.dimension, x.key, x.leads, x.won
  from (
    select
      'stage'::text as dimension, st.status::text as key,
      count(c.status)::integer as leads,
      (count(c.status) filter (where st.status = 'won'))::integer as won,
      array_position(enum_range(null::public.lead_status), st.status) as position
    from unnest(enum_range(null::public.lead_status)) as st (status)
    left join created c on c.status = st.status
    group by st.status
    union all
    select
      'source', so.source::text,
      count(c.source)::integer,
      (count(c.source) filter (where c.status = 'won'))::integer,
      array_position(enum_range(null::public.lead_source), so.source)
    from unnest(enum_range(null::public.lead_source)) as so (source)
    left join created c on c.source = so.source
    group by so.source
  ) x
  order by x.dimension desc, x.position;
end;
$$;

-- ───────── 4. Active students over time, joins and leaves ─────────

-- Per month: students with a running enrolment at the end of the month
-- (today, for the month in progress), students whose first enrolment started
-- in it, and students whose last enrolment ended in it.
create function public.report_students(p_from date, p_to date)
returns table (month date, active integer, joined integer, left_count integer)
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
  with span as (
    select
      e.student_id,
      min(e.joined_on) as first_joined,
      -- Null while any enrolment is still running.
      case when bool_and(e.left_on is not null) then max(e.left_on) end as last_left
    from public.enrollments e
    group by e.student_id
  )
  select
    m.month::date,
    public.report_active_students(least((m.month + interval '1 month')::date - 1, public.tashkent_today())),
    (select count(*)::integer from span s
      where s.first_joined >= m.month::date and s.first_joined < (m.month + interval '1 month')::date),
    (select count(*)::integer from span s
      where s.last_left >= m.month::date and s.last_left < (m.month + interval '1 month')::date)
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 month') as m (month)
  order by 1;
end;
$$;

-- ─────────────────── 5. Attendance rate by group ──────────────────

-- rate = (present + late) ÷ (present + late + absent); excused is left out.
create function public.report_attendance(p_from date, p_to date)
returns table (group_id uuid, group_name text, present integer, late integer, absent integer, excused integer, rate numeric)
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
  where ls.lesson_date >= p_from and ls.lesson_date < (p_to + interval '1 month')::date
  group by g.id
  order by 7 desc nulls last, g.name, g.id;
end;
$$;

-- ───────────────────────── 6. Debt by age ─────────────────────────

-- Today's debt by how old it is. Payments cover the oldest charges first, so
-- what a student still owes sits on their newest charges; each part is aged
-- from the 1st of the month it was billed for. The three rows add up to the
-- Debt in Finance.
create function public.report_debt_age()
returns table (bucket text, amount bigint, students integer)
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
    join public.charges c on c.student_id = d.student_id and c.amount > 0
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

-- ───────────────────────────── Grants ────────────────────────────

revoke execute on function
  public.report_check_period(date, date),
  public.report_starts(date),
  public.report_ends(date),
  public.report_active_students(date),
  public.report_kpis(date, date),
  public.report_collected_vs_expenses(date, date),
  public.report_revenue(date, date),
  public.report_lead_funnel(date, date),
  public.report_students(date, date),
  public.report_attendance(date, date),
  public.report_debt_age()
from public, anon;

grant execute on function
  public.report_check_period(date, date),
  public.report_starts(date),
  public.report_ends(date),
  public.report_active_students(date),
  public.report_kpis(date, date),
  public.report_collected_vs_expenses(date, date),
  public.report_revenue(date, date),
  public.report_lead_funnel(date, date),
  public.report_students(date, date),
  public.report_attendance(date, date),
  public.report_debt_age()
to authenticated, service_role;
