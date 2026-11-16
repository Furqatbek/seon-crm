-- Teacher login and coins. docs/SPEC.md → "Roles and permissions",
-- "Business rules → Coins", "Screens → My groups".
--
-- 1. A user can have the role "teacher", linked to one teacher record.
-- 2. "Staff" now means owner or manager only, so every existing policy and
--    function that asks is_staff() stays closed to a teacher.
-- 3. A teacher reaches data only through the functions below. Each one checks
--    that the group is the teacher's own, and returns students' names only:
--    no phones, parents, balances or payments.
-- 4. Coins: a ledger of points per student. Teachers give them in their own
--    groups; owner and manager give and spend them.
--
-- Custom error codes raised below:
--   ET001  attendance can no longer be changed (older than 7 days)
--   ET002  the number of coins is not allowed
--   ET003  a reason is required
--   ET004  the student does not have that many coins
--   ET005  the student is not in this group

-- ─────────────────── The link from a user to a teacher ───────────────────

alter table public.profiles add column teacher_id uuid references public.teachers (id);

-- One login per teacher.
create unique index profiles_teacher_key on public.profiles (teacher_id) where teacher_id is not null;

-- A teacher user always has a teacher record; nobody else has one.
alter table public.profiles add constraint profiles_teacher_link
  check ((role = 'teacher') = (teacher_id is not null));

-- ─────────────────────────── Who is calling ───────────────────────────

-- Staff: an active owner or manager. A teacher is not staff.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() in ('owner', 'manager'), false);
$$;

-- The caller's teacher record, or null when the caller is not an active teacher user.
create function public.my_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.teacher_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active and p.role = 'teacher';
$$;

-- A teacher's own group: they teach it, and it is running or about to start.
create function public.teacher_owns_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.teacher_id = public.my_teacher_id()
      and g.archived_at is null
      and g.status in ('active', 'forming')
  );
$$;

-- ───────────────────────────── Profiles ─────────────────────────────

-- Staff read every profile. A teacher reads their own, nothing else.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using ((select public.is_staff()) or ((select public.app_role()) is not null and id = (select auth.uid())));

-- The owner edits anyone; everyone else their own name and language.
drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using ((select public.is_owner()) or ((select public.app_role()) is not null and id = (select auth.uid())))
  with check ((select public.is_owner()) or ((select public.app_role()) is not null and id = (select auth.uid())));

-- Only the owner changes a role, the active flag or the linked teacher.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_api_user() and not public.is_owner() then
    if new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.teacher_id is distinct from old.teacher_id
    then
      raise exception 'Only the owner can change roles or deactivate users'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- The profile for a new auth user. As before, the role comes from app
-- metadata (service role only) or from the owner's invite. A teacher also
-- needs a teacher record that has no login yet; without one the profile is
-- left inactive.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_role_text text := new.raw_app_meta_data ->> 'role';
  invite_role_text text := new.raw_user_meta_data ->> 'role';
  language_text text := new.raw_user_meta_data ->> 'language';
  name_text text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  teacher_text text;
  role_text text;
  new_role public.user_role := 'manager';
  new_teacher uuid;
  active boolean := false;
begin
  if app_role_text in ('owner', 'manager', 'teacher') then
    role_text := app_role_text;
    teacher_text := new.raw_app_meta_data ->> 'teacher_id';
    active := true;
  elsif new.invited_at is not null then
    role_text := case when invite_role_text in ('owner', 'manager', 'teacher') then invite_role_text else 'manager' end;
    teacher_text := new.raw_user_meta_data ->> 'teacher_id';
    active := true;
  end if;

  if role_text = 'teacher' then
    if teacher_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select t.id into new_teacher
      from public.teachers t
      where t.id = teacher_text::uuid
        and t.archived_at is null
        and not exists (select 1 from public.profiles p where p.teacher_id = t.id);
    end if;
    if new_teacher is null then
      -- No usable teacher record: an inactive profile the owner can sort out.
      role_text := 'manager';
      active := false;
    end if;
  end if;

  if role_text is not null then
    new_role := role_text::public.user_role;
  end if;

  insert into public.profiles (id, full_name, role, teacher_id, language, is_active)
  values (
    new.id,
    coalesce(name_text, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'User'),
    new_role,
    new_teacher,
    case when language_text in ('uz', 'ru', 'en')
      then language_text::public.app_language else 'uz' end,
    active
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ─────────────────────────────── Coins ───────────────────────────────

-- A ledger: above zero is coins earned, below zero is coins spent. Rows are
-- never changed or removed; a mistake is corrected with another row.
create table public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id),
  -- Where the coins were earned. Spending belongs to the student, not a group.
  group_id uuid references public.groups (id),
  amount integer not null check (amount <> 0 and amount between -100000 and 100000),
  reason text check (reason is null or btrim(reason) <> ''),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index coin_transactions_student_idx on public.coin_transactions (student_id);
create index coin_transactions_group_idx on public.coin_transactions (group_id) where group_id is not null;

alter table public.coin_transactions enable row level security;

-- Staff read the ledger. Nobody writes to it directly: add_coins() does.
grant select on public.coin_transactions to authenticated;

create policy coin_transactions_select on public.coin_transactions
  for select to authenticated
  using ((select public.is_staff()));

-- Gives or spends coins and returns the student's new balance.
--   Teacher: 1 to 10 coins at a time, to a student of their own group.
--   Owner, manager: any amount; taking coins away needs a reason and cannot
--   go below zero.
create function public.add_coins(p_student_id uuid, p_group_id uuid, p_amount integer, p_reason text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  balance bigint;
begin
  if public.my_teacher_id() is not null then
    if p_group_id is null or not public.teacher_owns_group(p_group_id) then
      raise exception 'Not your group' using errcode = '42501';
    end if;
    if p_amount is null or p_amount not between 1 and 10 then
      raise exception 'A teacher gives 1 to 10 coins at a time' using errcode = 'ET002';
    end if;
  elsif public.is_staff() then
    if p_amount is null or p_amount = 0 or p_amount not between -100000 and 100000 then
      raise exception 'The number of coins is not allowed' using errcode = 'ET002';
    end if;
    if p_amount < 0 and reason is null then
      raise exception 'Say what the coins were spent on' using errcode = 'ET003';
    end if;
  else
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  -- One change at a time per student, so two spends cannot both pass the check.
  perform 1 from public.students s where s.id = p_student_id and s.archived_at is null for update;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;

  if p_amount > 0 or p_group_id is not null then
    if p_group_id is null or not exists (
      select 1 from public.enrollments e
      where e.group_id = p_group_id and e.student_id = p_student_id and e.status = 'active'
    ) then
      raise exception 'The student is not in this group' using errcode = 'ET005';
    end if;
  end if;

  select coalesce(sum(c.amount), 0) into balance
  from public.coin_transactions c where c.student_id = p_student_id;
  if balance + p_amount < 0 then
    raise exception 'The student has only % coins', balance using errcode = 'ET004', detail = balance::text;
  end if;

  insert into public.coin_transactions (student_id, group_id, amount, reason, created_by)
  values (p_student_id, case when p_amount > 0 then p_group_id end, p_amount, reason, (select auth.uid()));

  return balance + p_amount;
end;
$$;

-- The students of a group with their coins. "earned" is what they earned in
-- this group and decides the rank; "balance" is what they can still spend.
-- For staff, and for the group's own teacher. Names only.
create function public.group_coins(p_group_id uuid)
returns table (student_id uuid, full_name text, earned bigint, balance bigint, rank integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_staff() or public.teacher_owns_group(p_group_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select
    s.id,
    s.full_name,
    coalesce(c.earned, 0)::bigint,
    coalesce(c.balance, 0)::bigint,
    rank() over (order by coalesce(c.earned, 0) desc)::integer
  from public.enrollments e
  join public.students s on s.id = e.student_id and s.archived_at is null
  left join lateral (
    select
      sum(t.amount) filter (where t.amount > 0 and t.group_id = p_group_id) as earned,
      sum(t.amount) as balance
    from public.coin_transactions t
    where t.student_id = s.id
  ) c on true
  where e.group_id = p_group_id and e.status = 'active'
  order by 5, s.full_name, s.id;
end;
$$;

-- ───────────────────── What a teacher can see and do ─────────────────────

-- The teacher's own groups.
create function public.teacher_groups()
returns table (
  id uuid, name text, subject text, level text, days smallint[], start_time time,
  duration_min integer, status public.group_status, room_number text, room_name text, students integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id, g.name, g.subject, g.level, g.days, g.start_time, g.duration_min, g.status,
    r.number, r.name,
    (select count(*) from public.enrollments e
       join public.students s on s.id = e.student_id and s.archived_at is null
     where e.group_id = g.id and e.status = 'active')::integer
  from public.groups g
  left join public.rooms r on r.id = g.room_id
  where public.teacher_owns_group(g.id)
  order by g.name, g.id;
$$;

-- The lessons of one of the teacher's groups: the last 7 days (attendance can
-- still be marked) and the next 14.
create function public.teacher_lessons(p_group_id uuid)
returns table (
  id uuid, lesson_date date, start_time time, status public.lesson_status,
  marked integer, can_mark boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    l.status <> 'cancelled' and l.lesson_date <= today
  from public.lessons l
  where l.group_id = p_group_id
    and l.lesson_date between today - 7 and today + 14
  order by l.lesson_date, l.start_time;
end;
$$;

-- A lesson the teacher may open: in their own group and not older than 7 days.
create function public.teacher_lesson(p_lesson_id uuid)
returns table (group_id uuid, lesson_date date, start_time time, status public.lesson_status, can_mark boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select l.group_id, l.lesson_date, l.start_time, l.status,
         l.status <> 'cancelled' and l.lesson_date <= public.tashkent_today()
  from public.lessons l
  where l.id = p_lesson_id
    and public.teacher_owns_group(l.group_id)
    and l.lesson_date >= public.tashkent_today() - 7;
$$;

-- Its attendance sheet: who was in the group that day, and their mark.
create function public.teacher_lesson_sheet(p_lesson_id uuid)
returns table (student_id uuid, full_name text, mark public.attendance_status)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.full_name, a.status
  from public.teacher_lesson(p_lesson_id) l
  join public.enrollments e on e.group_id = l.group_id
    and e.joined_on <= l.lesson_date
    and (e.left_on is null or e.left_on >= l.lesson_date)
  join public.students s on s.id = e.student_id
  left join public.attendance a on a.lesson_id = p_lesson_id and a.student_id = s.id
  order by s.full_name, s.id;
$$;

-- Marks attendance for a lesson of the teacher's own group, today or up to
-- 7 days back. The rules of save_attendance() apply as they do for staff.
create function public.teacher_save_attendance(p_lesson_id uuid, p_marks jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
begin
  select * into l from public.lessons x where x.id = p_lesson_id;
  if not found or not public.teacher_owns_group(l.group_id) then
    raise exception 'Not your lesson' using errcode = '42501';
  end if;
  if l.lesson_date < public.tashkent_today() - 7 then
    raise exception 'Attendance can no longer be changed' using errcode = 'ET001';
  end if;
  perform public.save_attendance(p_lesson_id, p_marks);
end;
$$;

-- ───────────────────────────── Grants ─────────────────────────────

revoke execute on function
  public.my_teacher_id(),
  public.teacher_owns_group(uuid),
  public.add_coins(uuid, uuid, integer, text),
  public.group_coins(uuid),
  public.teacher_groups(),
  public.teacher_lessons(uuid),
  public.teacher_lesson(uuid),
  public.teacher_lesson_sheet(uuid),
  public.teacher_save_attendance(uuid, jsonb)
from public, anon;

grant execute on function
  public.my_teacher_id(),
  public.teacher_owns_group(uuid),
  public.add_coins(uuid, uuid, integer, text),
  public.group_coins(uuid),
  public.teacher_groups(),
  public.teacher_lessons(uuid),
  public.teacher_lesson(uuid),
  public.teacher_lesson_sheet(uuid),
  public.teacher_save_attendance(uuid, jsonb)
to authenticated, service_role;
