-- Finance owner tools: teacher payouts, expenses in the month strip, and the
-- adjustments list. docs/SPEC.md → "Business rules → Teacher salaries",
-- "Screens → Finance". Everything here is the owner's.
--
-- Custom error codes raised below:
--   ES001  the month has not started
--   ES002  a deduction larger than the payout

-- ───────────────────────── Payout rules ──────────────────────────

-- A bonus or a deduction always says why.
alter table public.teacher_payouts
  add constraint teacher_payouts_adjustment_note check (
    (bonus = 0 and deduction = 0) or btrim(coalesce(note, '')) <> ''
  );

-- The amount to pay always follows from its parts, whoever writes the row.
-- A person cannot take off more than there is to pay; a recalculation may
-- leave it below zero, and then the payout cannot be marked paid.
create function public.teacher_payouts_final_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.final_amount := new.calculated + new.bonus - new.deduction;
  if new.final_amount < 0 and (public.is_api_user() or new.status = 'paid') then
    raise exception 'The deduction is larger than the payout' using errcode = 'ES002';
  end if;
  return new;
end;
$$;

create trigger teacher_payouts_final_amount before insert or update on public.teacher_payouts
  for each row execute function public.teacher_payouts_final_amount();

-- ─────────────────────── Calculate payouts ───────────────────────

-- Creates or refreshes the draft payout of every active teacher for a month,
-- at the rate in effect on the 1st of that month:
--   fixed monthly   the fixed amount
--   per lesson      amount × held lessons the teacher taught that month
--                   (a substitute's lesson pays the substitute)
--   % of revenue    percent × non-voided payments received that month for
--                   groups where they are the teacher
-- Each group's line is rounded to 1,000 soʻm and the payout is their sum.
-- A draft keeps its bonus, deduction and note. A paid payout is never touched.
-- Returns the number of payouts created or refreshed.
-- Mirrors calculateTeacherPayouts() in src/lib/domain/salary.ts.
create function public.calculate_teacher_payouts(p_month date)
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
  on conflict (teacher_id, month) do update
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

-- ───────────────────────── Month summary ─────────────────────────

-- The owner's month strip, now with the month's expenses.
drop function public.finance_month_summary(date);

create function public.finance_month_summary(p_month date)
returns table (collected bigint, billed bigint, debt bigint, expenses bigint)
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
    (select coalesce(sum(c.amount), 0)::bigint from public.charges c where c.billing_month = p_month),
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

-- ────────────────────────── Adjustments ──────────────────────────

-- Every credit and every voided payment of a month, newest first, with who
-- did it and why. A credit belongs to the month it was given in, a void to
-- the month the payment was voided in.
create function public.list_adjustments(p_month date, p_limit integer default 50, p_offset integer default 0)
returns table (
  kind text,
  happened_at timestamptz,
  student_id uuid,
  student_name text,
  group_name text,
  amount bigint,
  receipt_no bigint,
  by_name text,
  reason text,
  total bigint
)
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
    where c.type = 'adjustment' and c.amount < 0
      and c.created_at >= starts and c.created_at < ends
    union all
    select
      'void'::text, p.voided_at, p.student_id, p.group_id,
      p.amount, p.receipt_no, p.voided_by, p.void_reason,
      p.id
    from public.payments p
    where p.voided_at >= starts and p.voided_at < ends
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

-- ───────────────────────────── Grants ────────────────────────────

revoke execute on function
  public.calculate_teacher_payouts(date),
  public.finance_month_summary(date),
  public.list_adjustments(date, integer, integer)
from public, anon;

grant execute on function
  public.calculate_teacher_payouts(date),
  public.finance_month_summary(date),
  public.list_adjustments(date, integer, integer)
to authenticated, service_role;

revoke execute on function public.teacher_payouts_final_amount() from public, anon, authenticated;
