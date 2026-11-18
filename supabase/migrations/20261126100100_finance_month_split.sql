-- The Finance month strip adds up. docs/SPEC.md → "Screens → Finance".
--
-- Before, the strip showed three figures that measure different things and
-- so never added up:
--   Collected = money received during the month, whatever it paid for
--               (older debts, next month's fee, a prepayment);
--   Billed    = the fees of that month;
--   Debt      = everything owed today, over all months.
--
-- Now the month's fees are split in two that always add up:
--   billed = paid + unpaid
-- A student's payments settle their charges oldest month first, so what is
-- still unpaid of a month is the part of that month's fees their payments
-- (all of them, up to today) have not reached:
--   unpaid(student, month) = min( fees of the month,
--                                 max(0, charged up to and including the month − paid in all) )
-- Credits are negative charges and reduce what is owed. Archived charges and
-- voided payments count nowhere. Students who left are included: their fee
-- for the month was billed, so it is either paid or unpaid.
--
-- Collected (money received in the month) and Debt today (all months,
-- without students who left) stay, as figures of their own.

drop function public.finance_month_summary(date);

create function public.finance_month_summary(p_month date)
returns table (
  billed bigint,
  paid bigint,
  unpaid bigint,
  collected bigint,
  debt bigint,
  expenses bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_billed bigint;
  v_unpaid bigint;
begin
  if public.is_user_request() and not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  with per_student as (
    select
      c.student_id,
      sum(c.amount) filter (where c.billing_month = p_month) as month_fees,
      sum(c.amount) as charged_so_far
    from public.charges c
    where c.archived_at is null and c.billing_month <= p_month
    group by c.student_id
  ),
  paid_in_all as (
    select p.student_id, sum(p.amount) as paid
    from public.payments p
    where p.voided_at is null
    group by p.student_id
  )
  select
    coalesce(sum(coalesce(s.month_fees, 0)), 0)::bigint,
    coalesce(sum(
      least(
        greatest(coalesce(s.month_fees, 0), 0),
        greatest(s.charged_so_far - coalesce(pa.paid, 0), 0)
      )
    ), 0)::bigint
  into v_billed, v_unpaid
  from per_student s
  left join paid_in_all pa on pa.student_id = s.student_id;

  return query select
    v_billed,
    v_billed - v_unpaid,
    v_unpaid,
    (
      select coalesce(sum(p.amount), 0)::bigint
      from public.payments p
      where p.voided_at is null
        and p.paid_at >= (p_month::timestamp at time zone 'Asia/Tashkent')
        and p.paid_at < ((p_month + interval '1 month')::timestamp at time zone 'Asia/Tashkent')
    ),
    (
      select coalesce(sum(-b.balance), 0)::bigint
      from public.student_balances b
      join public.students st on st.id = b.student_id
      where b.balance < 0 and st.status <> 'left'
    ),
    (
      select coalesce(sum(e.amount), 0)::bigint
      from public.expenses e
      where e.archived_at is null
        and e.spent_on >= p_month
        and e.spent_on < (p_month + interval '1 month')::date
    );
end;
$$;

revoke execute on function public.finance_month_summary(date) from public, anon;
grant execute on function public.finance_month_summary(date) to authenticated, service_role;
