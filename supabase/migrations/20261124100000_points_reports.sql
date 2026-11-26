-- Points reports. docs/SPEC.md → "Points and rewards add-on → Screens →
-- Reports → Points tab". One function for the KPIs and one per chart.
--
-- Who sees what: the owner and a manager see everything. A teacher sees the
-- same report narrowed to the groups they teach: only points that count for
-- those groups, only the students enrolled in them, and only their own awards
-- and deductions. Anyone else is refused.
--
-- How the figures are defined, so they add up against points_ledger:
--   earned   = every row that is not a reward row, a teacher deduction or a
--              negative owner adjustment, corrections included (an attendance
--              mark changed back, an award undone);
--   deducted = teacher deductions (undone ones taken out) plus negative owner
--              adjustments, as a positive number;
--   spent    = reward_hold and reward_return rows, as a positive number.
--   earned − deducted is what the leaderboards count.
-- A period is whole Tashkent months, 1 to 36, as in the other reports.

-- The rows a caller's points report may count, each already labelled.
create function public.report_points_rows(p_from date, p_to date)
returns table (
  id uuid, student_id uuid, group_id uuid, created_by uuid, created_at timestamptz,
  source public.points_source, delta integer, kind text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  teacher uuid := public.my_teacher_id();
begin
  if not (public.is_staff() or teacher is not null) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform public.report_check_period(p_from, p_to);

  return query
  select l.id, l.student_id, l.group_id, l.created_by, l.created_at, l.source, l.delta,
         case
           when l.source in ('reward_hold', 'reward_return') then 'spent'
           when l.source = 'teacher_deduction' or (l.source = 'owner_adjustment' and l.delta < 0) then 'deducted'
           else 'earned'
         end
  from public.points_ledger l
  where l.created_at >= public.report_starts(p_from)
    and l.created_at < public.report_starts((p_to + interval '1 month')::date)
    and (
      teacher is null
      or exists (
        select 1 from public.groups g
        where g.id = l.group_id and g.teacher_id = teacher and g.archived_at is null and g.status in ('active', 'forming')
      )
    );
end;
$$;

-- The students a caller's points report is about: every active student for
-- staff, the students of their own groups for a teacher.
create function public.report_points_students()
returns table (student_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.full_name
  from public.students s
  where s.archived_at is null and s.status = 'active'
    and (
      public.is_staff()
      or exists (
        select 1 from public.enrollments e
        join public.groups g on g.id = e.group_id
        where e.student_id = s.id and e.status = 'active'
          and g.teacher_id = public.my_teacher_id() and g.archived_at is null and g.status in ('active', 'forming')
      )
    );
$$;

-- ─────────────────────────────── KPIs ───────────────────────────────

create function public.report_points_kpis(p_from date, p_to date)
returns table (
  earned bigint,
  deducted bigint,
  spent bigint,
  -- Every point not yet spent, today, whatever the period.
  unspent bigint,
  rewards_given integer,
  -- Active students with no points earned in the period.
  students_without_points integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  with r as (select * from public.report_points_rows(p_from, p_to)),
  s as (select * from public.report_points_students())
  select
    (select coalesce(sum(r.delta), 0) from r where r.kind = 'earned')::bigint,
    (select coalesce(-sum(r.delta), 0) from r where r.kind = 'deducted')::bigint,
    (select coalesce(-sum(r.delta), 0) from r where r.kind = 'spent')::bigint,
    (
      select coalesce(sum(l.delta), 0)
      from public.points_ledger l where l.student_id in (select s.student_id from s)
    )::bigint,
    (
      select count(*)
      from public.redemptions d
      where d.status = 'given'
        and d.handled_at >= public.report_starts(p_from)
        and d.handled_at < public.report_starts((p_to + interval '1 month')::date)
        and (public.is_staff() or d.student_id in (select s.student_id from s))
    )::integer,
    (
      select count(*) from s
      where not exists (select 1 from r where r.student_id = s.student_id and r.kind = 'earned' and r.delta > 0)
    )::integer;
end;
$$;

-- ──────────────── 1. Points earned by source per month ──────────────

create function public.report_points_by_source(p_from date, p_to date)
returns table (month date, source public.points_source, points bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select date_trunc('month', r.created_at at time zone 'Asia/Tashkent')::date, r.source, sum(r.delta)::bigint
  from public.report_points_rows(p_from, p_to) r
  where r.kind = 'earned'
  group by 1, 2
  having sum(r.delta) <> 0
  order by 1, 2;
$$;

-- ─────────────── 2. Awards and deductions per teacher ───────────────
-- By who gave them, to spot inflation. A teacher sees only themselves.

create function public.report_points_by_teacher(p_from date, p_to date)
returns table (user_id uuid, teacher_name text, awards bigint, deductions bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name,
         coalesce(sum(r.delta) filter (where r.source = 'teacher_award'), 0)::bigint,
         coalesce(-sum(r.delta) filter (where r.source = 'teacher_deduction'), 0)::bigint
  from public.report_points_rows(p_from, p_to) r
  join public.profiles p on p.id = r.created_by
  where r.source in ('teacher_award', 'teacher_deduction')
    and (public.is_staff() or r.created_by = (select auth.uid()))
  group by p.id, p.full_name
  order by 3 desc, p.full_name;
$$;

-- ────────────────────────── 3. Top 10 students ──────────────────────

create function public.report_points_top_students(p_from date, p_to date)
returns table (student_id uuid, student_name text, points bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.full_name, sum(r.delta)::bigint
  from public.report_points_rows(p_from, p_to) r
  join public.students s on s.id = r.student_id and s.archived_at is null
  where r.kind in ('earned', 'deducted')
  group by s.id, s.full_name
  having sum(r.delta) > 0
  order by 3 desc, s.full_name, s.id
  limit 10;
$$;

-- ──────────────────── 4. Rewards given by reward ────────────────────

create function public.report_rewards_given(p_from date, p_to date)
returns table (reward_name text, given integer, points bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    and (public.is_staff() or d.student_id in (select s.student_id from public.report_points_students() s))
  group by w.id, w.name
  order by 2 desc, w.name;
end;
$$;

-- ───────────── 5. Average points per student by group ───────────────
-- The points that count for the group in the period, over the students
-- enrolled in it now.

create function public.report_points_by_group(p_from date, p_to date)
returns table (group_id uuid, group_name text, students integer, points bigint, average numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_staff() or public.my_teacher_id() is not null) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform public.report_check_period(p_from, p_to);

  return query
  with r as (
    select x.group_id, sum(x.delta)::bigint as points
    from public.report_points_rows(p_from, p_to) x
    where x.kind in ('earned', 'deducted') and x.group_id is not null
    group by x.group_id
  )
  select g.id, g.name, m.students, coalesce(r.points, 0)::bigint,
         round(coalesce(r.points, 0)::numeric / m.students, 1)
  from public.groups g
  join lateral (
    select count(*)::integer as students
    from public.enrollments e where e.group_id = g.id and e.status = 'active'
  ) m on m.students > 0
  left join r on r.group_id = g.id
  where g.archived_at is null and g.status in ('active', 'forming')
    and (public.is_staff() or g.teacher_id = public.my_teacher_id())
  order by 5 desc, g.name;
end;
$$;

revoke execute on function
  public.report_points_rows(date, date),
  public.report_points_students()
from public, anon, authenticated;

revoke execute on function
  public.report_points_kpis(date, date),
  public.report_points_by_source(date, date),
  public.report_points_by_teacher(date, date),
  public.report_points_top_students(date, date),
  public.report_rewards_given(date, date),
  public.report_points_by_group(date, date)
from public, anon;

grant execute on function
  public.report_points_kpis(date, date),
  public.report_points_by_source(date, date),
  public.report_points_by_teacher(date, date),
  public.report_points_top_students(date, date),
  public.report_rewards_given(date, date),
  public.report_points_by_group(date, date)
to authenticated, service_role;
