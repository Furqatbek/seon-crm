-- The salary information line missed a student who learns free of charge
-- when the grant was given as a custom amount of 0 at enrolment: such a charge
-- keeps the full fee as its base and records no discount. A discount is now
-- whatever a month's fee was charged below its full amount:
--
--   discounted      enrolled with a discount, or charged less than the fee this month
--   discount_total  the sum of (fee − what was charged) over the month's fee charges

create or replace function public.payout_group_facts(p_month date)
returns table (group_id uuid, students integer, paid_students integer, discounted integer, discount_total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  month_end date := (p_month + interval '1 month')::date;
begin
  if not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'A month is the 1st day of the month' using errcode = '22023';
  end if;

  return query
  with reduced as (
    -- A month's fee charged below its full amount, however that came about:
    -- a discount on the enrolment, or a custom amount typed in (a grant: 0).
    select c.group_id, c.student_id, sum(greatest(c.base_amount - c.amount, c.discount_amount, 0))::bigint as total
    from public.charges c
    where c.billing_month = p_month and c.archived_at is null and c.group_id is not null and c.type = 'monthly_fee'
    group by c.group_id, c.student_id
  ),
  learner as (
    select e.group_id, e.student_id,
           bool_or(e.discount_kind is not null and coalesce(e.discount_value, 0) > 0)
           or exists (select 1 from reduced r where r.group_id = e.group_id and r.student_id = e.student_id and r.total > 0) as has_discount
    from public.enrollments e
    where e.joined_on < month_end and (e.left_on is null or e.left_on >= p_month)
    group by e.group_id, e.student_id
  ),
  payer as (
    select distinct p.group_id, p.student_id
    from public.payments p
    where p.voided_at is null and p.group_id is not null
      and p.paid_at >= (p_month::timestamp at time zone 'Asia/Tashkent')
      and p.paid_at < (month_end::timestamp at time zone 'Asia/Tashkent')
  ),
  discount as (
    select r.group_id, sum(r.total)::bigint as total
    from reduced r
    group by r.group_id
  )
  select g.id,
         (select count(*) from learner l where l.group_id = g.id)::integer,
         (select count(*) from learner l join payer p on p.group_id = l.group_id and p.student_id = l.student_id where l.group_id = g.id)::integer,
         (select count(*) from learner l where l.group_id = g.id and l.has_discount)::integer,
         coalesce((select d.total from discount d where d.group_id = g.id), 0)::bigint
  from public.groups g;
end;
$$;
