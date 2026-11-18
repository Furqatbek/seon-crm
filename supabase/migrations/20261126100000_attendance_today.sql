-- Attendance is marked on the day of the lesson, by anyone, and a student is
-- listed once. docs/SPEC.md → "Business rules → Lessons and attendance".
--
-- 1. A student taken out of a group and put back the same day has two
--    enrolments that both cover that day's lesson. The teacher's list showed
--    them twice, and saving two marks for one student failed. They are now
--    listed once, and a mark sent twice is saved once.
-- 2. Nobody marks or changes attendance for a past or a future day: not a
--    teacher, a manager or the owner. (Before: a teacher and a manager had 7
--    days, the owner any time.)
--
-- Each function below is its current definition with only those changes.
-- Custom error code added: EC007, the lesson is not today.

CREATE OR REPLACE FUNCTION public.attendance_is_editable(p_lesson_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.lessons l
    where l.id = p_lesson_id
      and l.lesson_date = (now() at time zone 'Asia/Tashkent')::date
  );
$function$
;

-- The owner no longer passes without the check.
drop policy attendance_insert on public.attendance;
drop policy attendance_update on public.attendance;

create policy attendance_insert on public.attendance
  for insert to authenticated
  with check (marked_by = (select auth.uid()) and (select public.is_staff()) and public.attendance_is_editable(lesson_id));

create policy attendance_update on public.attendance
  for update to authenticated
  using ((select public.is_staff()) and public.attendance_is_editable(lesson_id))
  with check (marked_by = (select auth.uid()) and (select public.is_staff()) and public.attendance_is_editable(lesson_id));

CREATE OR REPLACE FUNCTION public.save_attendance(p_lesson_id uuid, p_marks jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  l public.lessons;
begin
  select * into l from public.lessons where id = p_lesson_id for update;
  if not found then
    raise exception 'Lesson not found' using errcode = 'P0002';
  end if;
  if l.status = 'cancelled' then
    raise exception 'The lesson is cancelled' using errcode = 'EC003';
  end if;
  if l.lesson_date > public.tashkent_today() then
    raise exception 'The lesson has not happened yet' using errcode = 'EC004';
  end if;
  if l.lesson_date < public.tashkent_today() then
    raise exception 'Attendance is marked on the day of the lesson' using errcode = 'EC007';
  end if;
  if jsonb_typeof(p_marks) is distinct from 'array' or jsonb_array_length(p_marks) = 0 then
    raise exception 'No marks given' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_marks) as m
    where not exists (
      select 1 from public.enrollments e
      where e.group_id = l.group_id
        and e.student_id = (m ->> 'student_id')::uuid
        and e.joined_on <= l.lesson_date
        and (e.left_on is null or e.left_on >= l.lesson_date)
    )
  ) then
    raise exception 'A student is not in this group on that day' using errcode = 'EC005';
  end if;

  insert into public.attendance (lesson_id, student_id, status, marked_by, marked_at)
  -- One mark per student: the last one sent wins.
  select distinct on ((m.mark ->> 'student_id')::uuid)
         l.id, (m.mark ->> 'student_id')::uuid, (m.mark ->> 'status')::public.attendance_status,
         (select auth.uid()), now()
  from jsonb_array_elements(p_marks) with ordinality as m (mark, position)
  order by (m.mark ->> 'student_id')::uuid, m.position desc
  on conflict (lesson_id, student_id) do update
    set status = excluded.status, marked_by = excluded.marked_by, marked_at = excluded.marked_at;

  update public.lessons set status = 'held' where id = l.id and status <> 'held';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.teacher_lessons(p_group_id uuid)
 RETURNS TABLE(id uuid, lesson_date date, start_time time without time zone, status lesson_status, marked integer, can_mark boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  today date := public.tashkent_today();
begin
  if not public.teacher_owns_group(p_group_id) then
    raise exception 'Not your group' using errcode = '42501';
  end if;
  return query
  select
    l.id, l.lesson_date, l.start_time, l.status,
    (select count(*) from public.attendance a where a.lesson_id = l.id)::integer,
    l.status <> 'cancelled' and l.lesson_date = today
  from public.lessons l
  where l.group_id = p_group_id
    and l.lesson_date between today - 7 and today + 14
  order by l.lesson_date, l.start_time;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.teacher_lesson(p_lesson_id uuid)
 RETURNS TABLE(group_id uuid, lesson_date date, start_time time without time zone, status lesson_status, can_mark boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select l.group_id, l.lesson_date, l.start_time, l.status,
         l.status <> 'cancelled' and l.lesson_date = public.tashkent_today()
  from public.lessons l
  where l.id = p_lesson_id
    and public.teacher_owns_group(l.group_id)
    and l.lesson_date >= public.tashkent_today() - 7;
$function$
;

CREATE OR REPLACE FUNCTION public.teacher_save_attendance(p_lesson_id uuid, p_marks jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  l public.lessons;
begin
  select * into l from public.lessons x where x.id = p_lesson_id;
  if not found or not public.teacher_owns_group(l.group_id) then
    raise exception 'Not your lesson' using errcode = '42501';
  end if;
  if l.lesson_date <> public.tashkent_today() then
    raise exception 'Attendance can no longer be changed' using errcode = 'ET001';
  end if;
  perform public.save_attendance(p_lesson_id, p_marks);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.teacher_lesson_sheet(p_lesson_id uuid)
 RETURNS TABLE(student_id uuid, full_name text, mark attendance_status)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- A student with two enrolments that cover the day is one student.
  select s.id, s.full_name, a.status
  from public.teacher_lesson(p_lesson_id) l
  join public.students s on exists (
    select 1 from public.enrollments e
    where e.student_id = s.id and e.group_id = l.group_id
      and e.joined_on <= l.lesson_date
      and (e.left_on is null or e.left_on >= l.lesson_date)
  )
  left join public.attendance a on a.lesson_id = p_lesson_id and a.student_id = s.id
  order by s.full_name, s.id;
$function$
;
