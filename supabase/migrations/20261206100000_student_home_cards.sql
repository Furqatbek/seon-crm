-- Student Home, as the approved designs draw it. docs/STUDENT_APP_SPEC.md →
-- "App behaviour → Home". student_home() also returns:
--   * the teacher of the next lesson, and the group's room;
--   * next_exam: the next exam in the group, when it is not already "next",
--     for the exam card under the hero card;
--   * coins_week: coins earned since Monday (Tashkent), for "+12 this week";
--   * attendance for the current month, with how many lessons were marked;
--   * today: the Tashkent date, so the app reads the balance as the CRM does.

create or replace function public.student_home(p_group_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.my_student_id();
  chosen uuid;
  today date := public.tashkent_today();
  month_start date := date_trunc('month', public.tashkent_today())::date;
  week_start timestamptz := (date_trunc('week', public.tashkent_today()::timestamp)) at time zone 'Asia/Tashkent';
  next_id uuid;
  result jsonb;
begin
  if me is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select g.id into chosen
  from public.groups g
  where g.id in (select public.my_group_ids())
  order by (g.id = p_group_id) desc, g.name, g.id
  limit 1;

  -- The next lesson or exam that is not cancelled.
  select l.id into next_id
  from public.lessons l
  where l.group_id = chosen and l.status <> 'cancelled'
    and (l.lesson_date + l.start_time) at time zone 'Asia/Tashkent' > now()
  order by l.lesson_date, l.start_time
  limit 1;

  select jsonb_build_object(
    'student', jsonb_build_object('id', s.id, 'full_name', s.full_name),
    'today', today,
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'subject', g.subject, 'level', g.level) order by g.name, g.id)
      from public.groups g where g.id in (select public.my_group_ids())
    ), '[]'::jsonb),
    'group_id', chosen,
    'next', (select public.student_home_lesson(next_id)),
    'next_exam', (
      select public.student_home_lesson(l.id)
      from public.lessons l
      where l.group_id = chosen and l.status <> 'cancelled' and l.kind = 'exam' and l.id is distinct from next_id
        and (l.lesson_date + l.start_time) at time zone 'Asia/Tashkent' > now()
      order by l.lesson_date, l.start_time
      limit 1
    ),
    -- This month's place in the group, among linked students.
    'rank', (
      select jsonb_build_object('rank', b.rank, 'of', b.total)
      from (
        select x.rank, x.is_me, count(*) over () as total
        from public.app_leaderboard('group', chosen, 'month') x
      ) b
      where chosen is not null and b.is_me
    ),
    'coins', (select coalesce(sum(l.delta), 0) from public.points_ledger l where l.student_id = me),
    -- Earned since Monday; spending on rewards is not earning.
    'coins_week', (
      select coalesce(sum(l.delta), 0) from public.points_ledger l
      where l.student_id = me and l.created_at >= week_start
        and l.source not in ('reward_hold', 'reward_return')
    ),
    'balance', jsonb_build_object(
      'amount', b.balance,
      'oldest_unpaid_month', b.oldest_unpaid_month,
      'due_day', (select c.due_day from public.centre_settings c)
    ),
    -- This month: (present + late) ÷ (present + late + absent), as in the CRM; null with no marks.
    'attendance', (
      select jsonb_build_object(
        'present', count(*) filter (where a.status = 'present'),
        'late', count(*) filter (where a.status = 'late'),
        'absent', count(*) filter (where a.status = 'absent'),
        'excused', count(*) filter (where a.status = 'excused'),
        'marked', count(*),
        'rate', case when count(*) filter (where a.status <> 'excused') = 0 then null
          else round(100.0 * count(*) filter (where a.status in ('present', 'late'))
                     / count(*) filter (where a.status <> 'excused'))::integer end
      )
      from public.attendance a
      join public.lessons l on l.id = a.lesson_id and l.status <> 'cancelled'
      where a.student_id = me and l.group_id = chosen and l.lesson_date >= month_start
    ),
    'unread', (
      select count(*) from public.notifications n
      where n.profile_id = (select auth.uid()) and n.read_at is null
    )
  ) into result
  from public.students s
  join public.student_balances b on b.student_id = s.id
  where s.id = me;

  return result;
end;
$$;

-- One lesson as a Home card shows it. Internal: student_home() decides whose it is.
create function public.student_home_lesson(p_lesson_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'kind', l.kind, 'exam_title', l.exam_title,
    'starts_at', (l.lesson_date + l.start_time) at time zone 'Asia/Tashkent',
    'duration_min', g.duration_min, 'room', r.number, 'teacher', t.full_name
  )
  from public.lessons l
  join public.groups g on g.id = l.group_id
  join public.teachers t on t.id = l.teacher_id
  left join public.rooms r on r.id = g.room_id
  where l.id = p_lesson_id;
$$;

revoke execute on function public.student_home_lesson(uuid) from public, anon, authenticated;
