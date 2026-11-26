-- What stands behind a teacher's share, group by group, for the Salaries tab:
-- how many students were learning in the month, how many of them paid, how
-- many learn with a discount, and how much discount the month's fees carry.
-- Read-only and worked out when asked: it explains a payout, it is not part of it.
--
--   students        enrolled in the group at any time in the month
--   paid_students   of those, with a payment for the group received in the
--                   month (the same payments the share is a percent of)
--   discounted      of those, enrolled with a discount
--   discount_total  the discounts on the month's charges for the group

create function public.payout_group_facts(p_month date)
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
  with learner as (
    select distinct e.group_id, e.student_id,
           bool_or(e.discount_kind is not null and coalesce(e.discount_value, 0) > 0) over (partition by e.group_id, e.student_id) as has_discount
    from public.enrollments e
    where e.joined_on < month_end and (e.left_on is null or e.left_on >= p_month)
  ),
  payer as (
    select distinct p.group_id, p.student_id
    from public.payments p
    where p.voided_at is null and p.group_id is not null
      and p.paid_at >= (p_month::timestamp at time zone 'Asia/Tashkent')
      and p.paid_at < (month_end::timestamp at time zone 'Asia/Tashkent')
  ),
  discount as (
    select c.group_id, sum(c.discount_amount)::bigint as total
    from public.charges c
    where c.billing_month = p_month and c.archived_at is null and c.group_id is not null
    group by c.group_id
  )
  select g.id,
         (select count(*) from learner l where l.group_id = g.id)::integer,
         (select count(*) from learner l join payer p on p.group_id = l.group_id and p.student_id = l.student_id where l.group_id = g.id)::integer,
         (select count(*) from learner l where l.group_id = g.id and l.has_discount)::integer,
         coalesce((select d.total from discount d where d.group_id = g.id), 0)::bigint
  from public.groups g;
end;
$$;

revoke execute on function public.payout_group_facts(date) from public, anon;
grant execute on function public.payout_group_facts(date) to authenticated, service_role;
