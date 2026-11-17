-- 1. A student who left is no longer chased for money: their debt leaves the
--    Debtors list, the Finance and Reports debt totals, the debt-age report
--    and the automatic reminders. The balance itself is unchanged and still
--    shows on the student's own page.
-- 2. Graduated: a student status set by hand. Like leaving, it ends every
--    active enrolment today, so billing stops. A graduate who still owes
--    stays a debtor. Enrolling a graduate again makes them active.
--
-- Every function below is its current definition with only those changes.

create function public.mark_student_graduated(p_student_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Tashkent')::date;
begin
  update public.students
  set status = 'graduated'
  where id = p_student_id and archived_at is null;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;

  update public.enrollments
  set status = 'left', left_on = greatest(joined_on, today)
  where student_id = p_student_id and status = 'active';
end;
$$;

revoke execute on function public.mark_student_graduated(uuid) from public, anon;
grant execute on function public.mark_student_graduated(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enrol_student(p_student_id uuid, p_group_id uuid, p_joined_on date, p_discount_kind text DEFAULT NULL::text, p_discount_value bigint DEFAULT NULL::bigint, p_note text DEFAULT NULL::text, p_charge_mode text DEFAULT 'prorated'::text, p_custom_amount bigint DEFAULT NULL::bigint, p_charge_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  proposal record;
  student_status public.student_status;
  new_enrollment_id uuid;
  charge_amount bigint;
  charge_prorated boolean;
begin
  if p_charge_mode not in ('prorated', 'full', 'custom') then
    raise exception 'Unknown charge mode' using errcode = '22023';
  end if;
  -- This month (so the first charge is for a month still being billed) up to
  -- the last day lessons exist for.
  if p_joined_on < date_trunc('month', public.tashkent_today())::date
    or p_joined_on > public.lesson_horizon()
  then
    raise exception 'Join date is outside the allowed range' using errcode = 'EC002';
  end if;

  select s.status into student_status
  from public.students s
  where s.id = p_student_id and s.archived_at is null
  for update;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;

  perform 1 from public.groups g
  where g.id = p_group_id and g.archived_at is null and g.status <> 'finished';
  if not found then
    raise exception 'Group is closed' using errcode = 'EC001';
  end if;

  select * into proposal
  from public.propose_first_charge(p_group_id, p_joined_on, p_discount_kind, p_discount_value);

  if p_charge_mode = 'custom' then
    if p_custom_amount is null or p_custom_amount < 0 then
      raise exception 'Invalid custom amount' using errcode = '22023';
    end if;
    if btrim(coalesce(p_charge_note, '')) = '' then
      raise exception 'A custom amount needs a note' using errcode = '23514';
    end if;
    charge_amount := p_custom_amount;
    charge_prorated := false;
  elsif p_charge_mode = 'full' then
    charge_amount := proposal.full_amount;
    charge_prorated := false;
  else
    charge_amount := proposal.amount;
    charge_prorated := proposal.is_prorated;
  end if;

  insert into public.enrollments (group_id, student_id, joined_on, discount_kind, discount_value, note)
  values (p_group_id, p_student_id, p_joined_on, p_discount_kind, p_discount_value,
          nullif(btrim(coalesce(p_note, '')), ''))
  returning id into new_enrollment_id;

  insert into public.charges (
    student_id, enrollment_id, group_id, billing_month, type, base_amount, discount_amount,
    amount, is_prorated, lessons_counted, lessons_in_month, note, created_by
  )
  values (
    p_student_id, new_enrollment_id, p_group_id, proposal.billing_month, 'monthly_fee',
    proposal.base_amount, proposal.discount_amount, charge_amount, charge_prorated,
    proposal.lessons_counted, proposal.lessons_in_month,
    case when p_charge_mode = 'custom' then btrim(p_charge_note) end,
    (select auth.uid())
  );

  -- Someone who had left is a student again.
  if student_status in ('left', 'graduated') then
    update public.students set status = 'active' where id = p_student_id;
  end if;

  return new_enrollment_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_month_summary(p_month date)
 RETURNS TABLE(collected bigint, billed bigint, debt bigint, expenses bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
    (select coalesce(sum(-b.balance), 0)::bigint from public.student_balances b join public.students s on s.id = b.student_id where b.balance < 0 and s.status <> 'left'),
    (
      select coalesce(sum(e.amount), 0)::bigint
      from public.expenses e
      where e.archived_at is null
        and e.spent_on >= p_month
        and e.spent_on < (p_month + interval '1 month')::date
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_debtors(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(student_id uuid, full_name text, phone text, balance bigint, oldest_unpaid_month date, last_payment_at timestamp with time zone, groups jsonb, total bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
    and s.status <> 'left'
    and s.archived_at is null
    and (
      extract(day from t.day)::int > t.due_day
      or (b.oldest_unpaid_month is not null and b.oldest_unpaid_month < t.month_start)
    )
  order by b.balance, s.full_name, s.id
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$function$
;

CREATE OR REPLACE FUNCTION public.notify_debtors()
 RETURNS TABLE(student_id uuid, full_name text, language app_language, telegram_chat_id bigint, parent_phone text, phone text, debt bigint, charged_months text[])
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
  where b.balance < 0 and s.archived_at is null and s.status <> 'left'
  order by s.id;
$function$
;

CREATE OR REPLACE FUNCTION public.report_debt_age()
 RETURNS TABLE(bucket text, amount bigint, students integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  return query
  with debtor as (
    select b.student_id, -b.balance as debt
    from public.student_balances b
    join public.students s on s.id = b.student_id
    where b.balance < 0 and s.status <> 'left'
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
$function$
;

CREATE OR REPLACE FUNCTION public.report_kpis(p_from date, p_to date)
 RETURNS TABLE(collected bigint, expenses bigint, salaries bigint, costs bigint, profit bigint, total_debt bigint, active_students integer, new_leads integer, won_leads integer, lead_conversion numeric, attendance_rate numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
    join public.students s on s.id = b.student_id
    where b.balance < 0 and s.status <> 'left';
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
$function$
;

