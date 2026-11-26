-- Fixes from the review of Phases 13–18 against docs/SPEC.md → "Points and
-- rewards add-on". Each function below is its current definition with only
-- the change described above it.

-- ── 1. Corrections go through while the programme is off ──
-- "Off" stops new points. Taking points back (a mark changed to Absent, a
-- lesson cancelled) is not a new point: without this, a lesson cancelled
-- while the programme was off kept its points for good.

CREATE OR REPLACE FUNCTION public.points_sync_attendance(p_lesson_id uuid, p_student_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cfg public.points_settings;
  l public.lessons;
  target integer := 0;
  posted integer;
  rows_so_far integer;
begin
  select * into cfg from public.points_settings;
  if not found then
    return;
  end if;
  select * into l from public.lessons where id = p_lesson_id for update;
  if not found then
    return;
  end if;

  if l.status <> 'cancelled' then
    select case a.status when 'present' then cfg.present when 'late' then cfg.late else 0 end
    into target
    from public.attendance a
    where a.lesson_id = p_lesson_id and a.student_id = p_student_id;
    target := coalesce(target, 0);
  end if;

  select coalesce(sum(p.delta), 0), count(*) into posted, rows_so_far
  from public.points_ledger p
  where p.source = 'attendance' and p.lesson_id = p_lesson_id and p.student_id = p_student_id;

  if target = posted then
    return;
  end if;
  -- Switched off: nothing new is given, but what is no longer deserved is taken back.
  if not cfg.enabled and target > posted then
    return;
  end if;

  insert into public.points_ledger (student_id, delta, source, group_id, lesson_id, created_by, dedupe_key)
  values (
    p_student_id, target - posted, 'attendance', l.group_id, l.id, (select auth.uid()),
    'attendance:' || l.id || ':' || p_student_id || case when rows_so_far = 0 then '' else ':' || rows_so_far end
  )
  on conflict (dedupe_key) do nothing;
end;
$function$
;

-- ── 2. Fee on time when the due day is the last day of the month ──
-- With due day 28, February's due day ends as March starts, and the job then
-- only looked at March. It now also asks about last month; the dedupe key
-- makes that safe.

CREATE OR REPLACE FUNCTION public.points_daily()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  this_month date := date_trunc('month', public.tashkent_today())::date;
begin
  perform public.points_post_perfect_month((this_month - interval '1 month')::date);
  perform public.points_post_on_time((this_month - interval '1 month')::date);
  perform public.points_post_on_time(this_month);
end;
$function$
;

-- ── 3. Rewards: a request is made once, and stock returns only if it was taken ──
-- request_key: the bot passes the confirm message it answers, so a second
-- press of Yes (or the same update delivered twice) finds the first request.
-- took_stock: a request made while stock was unlimited took no unit, so
-- rejecting it later must not add one.

alter table public.redemptions
  add column request_key text unique,
  add column took_stock boolean not null default true;

update public.redemptions d set took_stock = false
from public.rewards w where w.id = d.reward_id and w.stock is null;

drop function public.request_reward(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.request_reward(p_student_id uuid, p_reward_id uuid, p_via text DEFAULT 'desk'::text, p_requested_by text DEFAULT 'staff'::text, p_request_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  via text := coalesce(p_via, 'desk');
  asked_by text := coalesce(p_requested_by, 'staff');
  reward public.rewards;
  current_balance bigint;
  new_id uuid;
begin
  if public.is_user_request() then
    -- A person signed in: only staff, and only at the desk.
    if not public.is_staff() then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    via := 'desk';
    asked_by := 'staff';
  end if;
  if via not in ('bot', 'desk') or asked_by not in ('student', 'parent', 'staff') then
    raise exception 'Unknown way of asking' using errcode = '22023';
  end if;

  -- The student first, then the reward: every caller locks in this order.
  perform 1 from public.students s where s.id = p_student_id and s.archived_at is null for update;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  -- Asked twice (Yes pressed again, an update delivered twice): the first request stands.
  if p_request_key is not null then
    select d.id into new_id from public.redemptions d where d.request_key = p_request_key;
    if found then
      return new_id;
    end if;
  end if;
  select * into reward from public.rewards where id = p_reward_id for update;
  if not found or not reward.is_active or reward.archived_at is not null then
    raise exception 'The reward is not on offer' using errcode = 'ER005';
  end if;

  select coalesce(sum(p.delta), 0) into current_balance
  from public.points_ledger p where p.student_id = p_student_id;
  if current_balance < reward.cost then
    raise exception 'The student has only % points', current_balance
      using errcode = 'ER001', detail = current_balance::text;
  end if;
  if reward.stock is not null and reward.stock < 1 then
    raise exception 'Out of stock' using errcode = 'ER002';
  end if;

  insert into public.redemptions (student_id, reward_id, cost, via, requested_by, created_by, request_key, took_stock)
  values (p_student_id, reward.id, reward.cost, via, asked_by, (select auth.uid()), p_request_key, reward.stock is not null)
  returning id into new_id;

  insert into public.points_ledger (student_id, delta, source, redemption_id, reason, created_by, dedupe_key)
  values (p_student_id, -reward.cost, 'reward_hold', new_id, reward.name, (select auth.uid()), 'reward_hold:' || new_id);

  if reward.stock is not null then
    update public.rewards set stock = stock - 1 where id = reward.id;
  end if;

  return new_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_redemption(p_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS redemption_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  why text := nullif(btrim(coalesce(p_note, '')), '');
  r public.redemptions;
  next_status public.redemption_status;
begin
  if public.is_user_request() and not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('give', 'reject', 'cancel') then
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  next_status := case p_action when 'give' then 'given' when 'reject' then 'rejected' else 'cancelled' end;
  if next_status <> 'given' and why is null then
    raise exception 'A reason is required' using errcode = 'ER004';
  end if;

  -- Find the student without a lock, then lock in the usual order.
  select * into r from public.redemptions where id = p_id;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  perform 1 from public.students s where s.id = r.student_id for update;
  perform 1 from public.rewards w where w.id = r.reward_id for update;
  select * into r from public.redemptions where id = p_id for update;
  if r.status <> 'requested' then
    raise exception 'The request was already handled' using errcode = 'ER003';
  end if;

  update public.redemptions
  set status = next_status, handled_by = (select auth.uid()), handled_at = now(), note = why
  where id = r.id;

  if next_status <> 'given' then
    insert into public.points_ledger (student_id, delta, source, redemption_id, reason, created_by, dedupe_key)
    values (r.student_id, r.cost, 'reward_return', r.id, why, (select auth.uid()), 'reward_return:' || r.id);
    update public.rewards set stock = stock + 1 where id = r.reward_id and stock is not null and r.took_stock;
  end if;

  return next_status;
end;
$function$
;

revoke execute on function public.request_reward(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.request_reward(uuid, uuid, text, text, text) to authenticated, service_role;

-- ── 4. /top: the student's own place is counted like the list above it ──
-- The list leaves hidden students out; "your place" came from the full board,
-- so the two could disagree. A hidden student still gets their real place.

CREATE OR REPLACE FUNCTION public.bot_top(p_student_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'centre', coalesce((
      select jsonb_agg(jsonb_build_object('name', r.name, 'points', r.points, 'rank', r.place) order by r.line)
      from (
        select public.tv_name(b.full_name) as name, b.points,
               (rank() over (order by b.points desc))::integer as place,
               row_number() over (order by b.points desc, b.full_name, b.student_id) as line
        from public.leaderboard_rows('centre', null, 'month', null) b
        where not b.hidden and b.points > 0
      ) r
      where r.line <= 10
    ), '[]'::jsonb),
    'own', (
      select jsonb_build_object('rank', r.place, 'points', r.points)
      from (
        select b.student_id, b.points, (rank() over (order by b.points desc))::integer as place
        from public.leaderboard_rows('centre', null, 'month', null) b
        where not b.hidden or b.student_id = p_student_id
      ) r
      where r.student_id = p_student_id
    ),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('name', g.name, 'rows', top.list, 'own', own.place) order by g.name)
      from public.enrollments e
      join public.groups g on g.id = e.group_id
      cross join lateral (
        select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'points', r.points, 'rank', r.place) order by r.line), '[]'::jsonb) as list
        from (
          select public.tv_name(b.full_name) as name, b.points,
                 (rank() over (order by b.points desc))::integer as place,
                 row_number() over (order by b.points desc, b.full_name, b.student_id) as line
          from public.leaderboard_rows('group', g.id, 'month', null) b
          where not b.hidden and b.points > 0
        ) r
        where r.line <= 5
      ) top
      cross join lateral (
        select jsonb_build_object('rank', r.place, 'points', r.points) as place
        from (
          select b.student_id, b.points, (rank() over (order by b.points desc))::integer as place
          from public.leaderboard_rows('group', g.id, 'month', null) b
          where not b.hidden or b.student_id = p_student_id
        ) r
        where r.student_id = p_student_id
      ) own
      where e.student_id = p_student_id and e.status = 'active'
    ), '[]'::jsonb)
  );
$function$
;

-- ── 5. Points report: what a teacher may see, and unspent for everyone ──
-- Spending and balances do not belong to a group, so a teacher's report has
-- none of them: spent, unspent and rewards given are null for a teacher, and
-- the rewards chart is empty. For staff, unspent is every point in the
-- ledger, including those of students who are paused or have left.

CREATE OR REPLACE FUNCTION public.report_points_kpis(p_from date, p_to date)
 RETURNS TABLE(earned bigint, deducted bigint, spent bigint, unspent bigint, rewards_given integer, students_without_points integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  with r as (select * from public.report_points_rows(p_from, p_to)),
  s as (select * from public.report_points_students())
  select
    (select coalesce(sum(r.delta), 0) from r where r.kind = 'earned')::bigint,
    (select coalesce(-sum(r.delta), 0) from r where r.kind = 'deducted')::bigint,
    case when public.is_staff() then (select coalesce(-sum(r.delta), 0) from r where r.kind = 'spent')::bigint end,
    case when public.is_staff() then (select coalesce(sum(l.delta), 0) from public.points_ledger l)::bigint end,
    case when public.is_staff() then (
      select count(*)
      from public.redemptions d
      where d.status = 'given'
        and d.handled_at >= public.report_starts(p_from)
        and d.handled_at < public.report_starts((p_to + interval '1 month')::date)
    )::integer end,
    (
      select count(*) from s
      where not exists (select 1 from r where r.student_id = s.student_id and r.kind = 'earned' and r.delta > 0)
    )::integer;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.report_rewards_given(p_from date, p_to date)
 RETURNS TABLE(reward_name text, given integer, points bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (public.is_staff() or public.my_teacher_id() is not null) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform public.report_check_period(p_from, p_to);

  return query
  select w.name, count(*)::integer, sum(d.cost)::bigint
  from public.redemptions d
  join public.rewards w on w.id = d.reward_id
  where d.status = 'given'
    and d.handled_at >= public.report_starts(p_from)
    and d.handled_at < public.report_starts((p_to + interval '1 month')::date)
    and public.is_staff()
  group by w.id, w.name
  order by 2 desc, w.name;
end;
$function$
;

-- ── 6. A teacher sees how many lessons they taught this month ──
-- Held lessons they taught, their own groups' and those they substituted in.
-- Never pay rates or payouts.

create function public.teacher_lessons_this_month()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.lessons l
  where l.teacher_id = public.my_teacher_id()
    and l.status = 'held'
    and l.lesson_date >= date_trunc('month', public.tashkent_today())::date
    and l.lesson_date < (date_trunc('month', public.tashkent_today()) + interval '1 month')::date;
$$;

revoke execute on function public.teacher_lessons_this_month() from public, anon;
grant execute on function public.teacher_lessons_this_month() to authenticated, service_role;
