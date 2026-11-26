-- The student app's Schedule. docs/STUDENT_APP_SPEC.md → "App behaviour →
-- More". A student reads lessons and their own groups directly, but not
-- teachers or rooms, so the week comes from one function that names both.
-- Cancelled lessons are included: the app strikes them through.

create function public.my_schedule(p_from date, p_to date)
returns table (
  lesson_id uuid, group_id uuid, group_name text, lesson_date date, start_time time,
  duration_min integer, status public.lesson_status, kind public.lesson_kind,
  exam_title text, cancel_reason text, room text, teacher text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Ask for up to two months at a time' using errcode = '22023';
  end if;
  return query
  select l.id, g.id, g.name, l.lesson_date, l.start_time, g.duration_min, l.status, l.kind,
         l.exam_title, l.cancel_reason, r.number, t.full_name
  from public.lessons l
  join public.groups g on g.id = l.group_id
  join public.teachers t on t.id = l.teacher_id
  left join public.rooms r on r.id = g.room_id
  where l.group_id in (select public.my_group_ids())
    and l.lesson_date between p_from and p_to
  order by l.lesson_date, l.start_time, g.name;
end;
$$;

revoke execute on function public.my_schedule(date, date) from public, anon;
grant execute on function public.my_schedule(date, date) to authenticated, service_role;
