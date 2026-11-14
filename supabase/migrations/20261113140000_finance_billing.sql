-- Finance billing: monthly fees, the billing-day job and the month summary.
-- docs/SPEC.md → "Business rules → Monthly billing", "Payments and balance".
--
-- Custom error code raised below: EF001 not the current month.

-- ───────────────────────── Fee history ───────────────────────────
-- "A changed group fee applies from the next billing month, never to charges
-- already created." groups.monthly_fee is the latest fee; this table says
-- from which month each fee counts.

create table public.group_fee_history (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  monthly_fee bigint not null check (monthly_fee >= 0),
  effective_month date not null check (extract(day from effective_month) = 1),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (group_id, effective_month)
);

alter table public.group_fee_history enable row level security;
grant select on public.group_fee_history to authenticated;

create policy group_fee_history_select on public.group_fee_history
  for select to authenticated
  using ((select public.is_staff()));

-- Fees of groups that already exist count from the beginning.
insert into public.group_fee_history (group_id, monthly_fee, effective_month)
select id, monthly_fee, date '2000-01-01' from public.groups;

-- Rows are written only here, never through the API.
create function public.groups_fee_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.group_fee_history (group_id, monthly_fee, effective_month, created_by)
    values (new.id, new.monthly_fee, date '2000-01-01', (select auth.uid()));
  elsif not exists (select 1 from public.charges c where c.group_id = new.id) then
    -- Nobody has been charged for this group yet, so there is nothing to
    -- protect: the change is a correction and counts from the start.
    delete from public.group_fee_history where group_id = new.id;
    insert into public.group_fee_history (group_id, monthly_fee, effective_month, created_by)
    values (new.id, new.monthly_fee, date '2000-01-01', (select auth.uid()));
  else
    -- From the 1st of next month. A second change in the same month replaces the first.
    insert into public.group_fee_history (group_id, monthly_fee, effective_month, created_by)
    values (
      new.id,
      new.monthly_fee,
      (date_trunc('month', public.tashkent_today()) + interval '1 month')::date,
      (select auth.uid())
    )
    on conflict (group_id, effective_month) do update
      set monthly_fee = excluded.monthly_fee,
          created_by = excluded.created_by,
          created_at = now();
  end if;
  return new;
end;
$$;

create trigger record_fee_on_create
  after insert on public.groups
  for each row execute function public.groups_fee_history();

create trigger record_fee_on_change
  after update of monthly_fee on public.groups
  for each row
  when (old.monthly_fee is distinct from new.monthly_fee)
  execute function public.groups_fee_history();

-- The group's fee for a billing month.
create function public.group_fee_for(p_group_id uuid, p_month date)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select h.monthly_fee
      from public.group_fee_history h
      where h.group_id = p_group_id and h.effective_month <= p_month
      order by h.effective_month desc
      limit 1
    ),
    (select g.monthly_fee from public.groups g where g.id = p_group_id)
  );
$$;

-- The soʻm taken off a fee by an enrolment's discount. A percent discount is
-- rounded to 1,000; never more than the fee. Mirrors discountAmount() in
-- src/lib/domain/proration.ts.
create function public.discount_amount(p_fee bigint, p_kind text, p_value bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind = 'percent' and p_value between 1 and 100
      then least(p_fee, public.round_to_thousand(p_fee * p_value, 100))
    when p_kind = 'amount' and p_value > 0 then least(p_fee, p_value)
    else 0
  end;
$$;

-- The first charge at enrolment uses the fee of the month joined, too.
create or replace function public.propose_first_charge(
  p_group_id uuid,
  p_joined_on date,
  p_discount_kind text default null,
  p_discount_value bigint default null
)
returns table (
  billing_month date,
  base_amount bigint,
  discount_amount bigint,
  full_amount bigint,
  lessons_in_month integer,
  lessons_counted integer,
  is_prorated boolean,
  amount bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  fee bigint;
  month_start date := date_trunc('month', p_joined_on)::date;
  total integer;
  counted integer;
  first_lesson date;
  discount bigint;
  after_discount bigint;
  prorated boolean;
begin
  perform 1 from public.groups g where g.id = p_group_id;
  if not found then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;
  fee := public.group_fee_for(p_group_id, month_start);

  if p_discount_kind is not null
    and not (
      (p_discount_kind = 'percent' and p_discount_value between 1 and 100)
      or (p_discount_kind = 'amount' and p_discount_value > 0)
    )
  then
    raise exception 'Invalid discount' using errcode = '22023';
  end if;
  discount := public.discount_amount(fee, p_discount_kind, p_discount_value);
  after_discount := fee - discount;

  select count(*), count(*) filter (where l.lesson_date >= p_joined_on), min(l.lesson_date)
  into total, counted, first_lesson
  from public.lessons l
  where l.group_id = p_group_id
    and l.status <> 'cancelled'
    and l.lesson_date >= month_start
    and l.lesson_date < (month_start + interval '1 month')::date;

  prorated := total > 0 and p_joined_on > first_lesson;

  return query select
    month_start,
    fee,
    discount,
    after_discount,
    total,
    counted,
    prorated,
    case
      when counted = 0 then 0::bigint
      when prorated then public.round_to_thousand(after_discount * counted, total)
      else after_discount
    end;
end;
$$;

-- ─────────────────────── Monthly charges ─────────────────────────

-- The monthly fees that are still missing for a month: one per active
-- enrolment in an active group, for a student who is active (not paused, not
-- left). Amount = the month's group fee minus the enrolment discount.
-- Owner only; this is also the preview shown before generating.
create function public.preview_monthly_charges(p_month date)
returns table (
  enrollment_id uuid,
  student_id uuid,
  student_name text,
  group_id uuid,
  group_name text,
  base_amount bigint,
  discount_amount bigint,
  amount bigint
)
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
    )
  order by g.name, s.full_name;
end;
$$;

-- Creates the missing monthly fees for a month. Running it twice creates
-- nothing new: the unique index on (enrolment, month) guarantees it even if
-- two runs overlap. Returns how many charges were created.
create function public.generate_monthly_charges(p_month date)
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
  on conflict (enrollment_id, billing_month) where type = 'monthly_fee' do nothing;

  get diagnostics created = row_count;
  return created;
end;
$$;

-- How many fees are missing for a month and what they add up to. The preview
-- list can be cut short by the API's row limit; these totals cannot.
create function public.preview_monthly_charges_summary(p_month date)
returns table (charges integer, total bigint)
language sql
stable
set search_path = ''
as $$
  select count(*)::integer, coalesce(sum(p.amount), 0)::bigint
  from public.preview_monthly_charges(p_month) p;
$$;

-- The daily job: on the centre's billing day, bill the current month.
create function public.run_billing_day()
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
  if extract(day from today)::int <> (select billing_day from public.centre_settings limit 1) then
    return 0;
  end if;
  return public.generate_monthly_charges(date_trunc('month', today)::date);
end;
$$;

-- Daily at 00:10 Tashkent time (cron runs in UTC: 19:10 the day before).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'monthly-charges-billing-day',
      '10 19 * * *',
      'select public.run_billing_day()'
    );
  end if;
end;
$$;

-- ───────────────────────── Month summary ─────────────────────────

-- The owner's month strip: collected and billed for a month, and the debt
-- outstanding now. Voided payments are left out of every total.
create function public.finance_month_summary(p_month date)
returns table (collected bigint, billed bigint, debt bigint)
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
    (select coalesce(sum(-b.balance), 0)::bigint from public.student_balances b where b.balance < 0);
end;
$$;

-- ──────────────────────────── Debtors ────────────────────────────

-- Students in debt, largest debt first, one page at a time, with their
-- groups and last payment. A student is a debtor when the balance is below
-- zero after the due day of the current month, or when a fee from an earlier
-- month is still unpaid. Mirrors balanceState() in src/lib/domain/ledger.ts.
-- Runs with the caller's rights.
create function public.list_debtors(p_limit integer default 50, p_offset integer default 0)
returns table (
  student_id uuid,
  full_name text,
  phone text,
  balance bigint,
  oldest_unpaid_month date,
  last_payment_at timestamptz,
  groups jsonb,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  with today as (
    select
      public.tashkent_today() as day,
      date_trunc('month', public.tashkent_today())::date as month_start,
      (select due_day from public.centre_settings limit 1) as due_day
  )
  select
    s.id,
    s.full_name,
    s.phone,
    b.balance,
    b.oldest_unpaid_month,
    (
      select max(p.paid_at) from public.payments p
      where p.student_id = s.id and p.voided_at is null
    ),
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name)
        from public.enrollments e
        join public.groups g on g.id = e.group_id
        where e.student_id = s.id and e.status = 'active'
      ),
      '[]'::jsonb
    ),
    count(*) over ()
  from public.student_balances b
  join public.students s on s.id = b.student_id
  cross join today t
  where b.balance < 0
    and s.archived_at is null
    and (
      extract(day from t.day)::int > t.due_day
      or (b.oldest_unpaid_month is not null and b.oldest_unpaid_month < t.month_start)
    )
  order by b.balance, s.full_name, s.id
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

-- ───────────────────────────── Grants ────────────────────────────

revoke execute on function
  public.group_fee_for(uuid, date),
  public.discount_amount(bigint, text, bigint),
  public.preview_monthly_charges(date),
  public.preview_monthly_charges_summary(date),
  public.list_debtors(integer, integer),
  public.generate_monthly_charges(date),
  public.run_billing_day(),
  public.finance_month_summary(date)
from public, anon;

grant execute on function
  public.group_fee_for(uuid, date),
  public.discount_amount(bigint, text, bigint),
  public.preview_monthly_charges(date),
  public.preview_monthly_charges_summary(date),
  public.list_debtors(integer, integer),
  public.generate_monthly_charges(date),
  public.run_billing_day(),
  public.finance_month_summary(date)
to authenticated, service_role;

revoke execute on function public.groups_fee_history() from public, anon, authenticated;
