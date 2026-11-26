-- Points engine. docs/SPEC.md → "Points and rewards add-on": "Point rules",
-- "Data model additions".
--
-- 1. points_settings (one row), point_presets and the append-only
--    points_ledger. Nobody writes to the ledger directly: only the functions
--    below do, and no role may update or delete a row.
-- 2. Automatic points, each with a unique dedupe_key so a job or a save can
--    run twice safely: attendance (the difference whenever a mark changes,
--    reversed when the lesson is cancelled), perfect month, fee paid on time,
--    and a friend who enrols.
-- 3. award_points() for teachers, undo_points() for the 10-second Undo, and
--    adjust_points() for the owner.
--
-- Custom error codes raised below:
--   EP001  the points programme is switched off
--   EP002  the number of points is not allowed
--   EP003  a reason is required
--   EP004  the teacher's daily limit for this student is reached (detail = points left today)
--   EP005  the student is not in this group
--   EP006  too late to undo, or already undone
--   EP007  the student does not have that many points (detail = balance)

create type public.points_source as enum (
  'attendance', 'perfect_month', 'on_time_payment', 'referral', 'teacher_award',
  'teacher_deduction', 'owner_adjustment', 'reward_hold', 'reward_return'
);
create type public.preset_kind as enum ('award', 'deduction');

-- ───────────────────────────── Settings ─────────────────────────────

create table public.points_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  enabled boolean not null default true,
  present integer not null default 2 check (present between 0 and 1000),
  late integer not null default 1 check (late between 0 and 1000),
  perfect_month integer not null default 10 check (perfect_month between 0 and 1000),
  perfect_month_min_lessons integer not null default 4 check (perfect_month_min_lessons between 1 and 31),
  on_time integer not null default 10 check (on_time between 0 and 1000),
  referral integer not null default 50 check (referral between 0 and 1000),
  max_per_action integer not null default 5 check (max_per_action between 1 and 100),
  teacher_daily_cap integer not null default 10 check (teacher_daily_cap between 1 and 1000),
  -- Nothing that happened before the programme existed earns points.
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.points_settings default values;

create trigger set_updated_at before update on public.points_settings
  for each row execute function public.set_updated_at();

alter table public.points_settings enable row level security;
grant select, update on public.points_settings to authenticated;

-- Teachers read the limits; only the owner changes anything.
create policy points_settings_select on public.points_settings
  for select to authenticated
  using ((select public.is_staff()) or (select public.my_teacher_id()) is not null);

create policy points_settings_update on public.points_settings
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- ───────────────────────────── Presets ──────────────────────────────

create table public.point_presets (
  id uuid primary key default gen_random_uuid(),
  kind public.preset_kind not null,
  -- Always positive: a deduction preset takes this many away.
  points integer not null check (points between 1 and 100),
  label_uz text not null check (btrim(label_uz) <> ''),
  label_ru text not null check (btrim(label_ru) <> ''),
  label_en text not null check (btrim(label_en) <> ''),
  sort integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.point_presets (kind, points, label_uz, label_ru, label_en, sort) values
  ('award', 2, 'Darsda faol', 'Активность на уроке', 'Active in class', 1),
  ('award', 2, 'Uy vazifasi bajarilgan', 'Домашнее задание выполнено', 'Homework done', 2),
  ('award', 5, 'Testdan aʼlo natija', 'Отличный результат теста', 'Great test result', 3),
  ('award', 3, 'Sinfdoshiga yordam berdi', 'Помог однокласснику', 'Helped a classmate', 4),
  ('deduction', 2, 'Uy vazifasi bajarilmagan', 'Домашнее задание не выполнено', 'Homework not done', 1),
  ('deduction', 3, 'Darsga xalaqit berdi', 'Мешал на уроке', 'Disrupted the lesson', 2),
  ('deduction', 2, 'Darsda telefon', 'Телефон на уроке', 'Phone in class', 3);

alter table public.point_presets enable row level security;
grant select, insert, update on public.point_presets to authenticated;

create policy point_presets_select on public.point_presets
  for select to authenticated
  using ((select public.is_staff()) or (select public.my_teacher_id()) is not null);

create policy point_presets_insert on public.point_presets
  for insert to authenticated
  with check ((select public.is_owner()));

create policy point_presets_update on public.point_presets
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- ────────────────────────────── Ledger ──────────────────────────────

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id),
  delta integer not null check (delta <> 0 and delta between -100000 and 100000),
  source public.points_source not null,
  -- The group the points count for; null counts for the centre only.
  group_id uuid references public.groups (id),
  lesson_id uuid references public.lessons (id) on delete set null,
  preset_id uuid references public.point_presets (id),
  reason text check (reason is null or btrim(reason) <> ''),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  -- Set on every automatic row and every undo, so it is posted once.
  dedupe_key text unique
);

create index points_ledger_student_idx on public.points_ledger (student_id, created_at);
create index points_ledger_group_idx on public.points_ledger (group_id, created_at) where group_id is not null;
create index points_ledger_author_idx on public.points_ledger (created_by, created_at) where created_by is not null;
create index points_ledger_attendance_idx on public.points_ledger (lesson_id, student_id) where source = 'attendance';

alter table public.points_ledger enable row level security;

-- Insert only, and only through the functions below.
revoke all on public.points_ledger from public, anon, authenticated, service_role;
grant select on public.points_ledger to authenticated, service_role;

create policy points_ledger_select on public.points_ledger
  for select to authenticated
  using ((select public.is_staff()));

-- ─────────────────────── Changed columns ────────────────────────────

alter table public.leads add column referred_by_student_id uuid references public.students (id);
alter table public.students add column leaderboard_hidden boolean not null default false;

-- ──────────────────────── Balances per student ──────────────────────
-- Earned (for ranking) leaves out reward rows; the balance counts every row.

create view public.student_points
with (security_invoker = true)
as
select
  s.id as student_id,
  coalesce(sum(l.delta), 0)::bigint as balance,
  coalesce(sum(l.delta) filter (
    where l.source not in ('reward_hold', 'reward_return')
      and l.created_at >= (date_trunc('month', public.tashkent_today())::timestamp at time zone 'Asia/Tashkent')
  ), 0)::bigint as earned_this_month,
  coalesce(sum(l.delta) filter (where l.source not in ('reward_hold', 'reward_return')), 0)::bigint as earned_all_time
from public.students s
left join public.points_ledger l on l.student_id = s.id
group by s.id;

grant select on public.student_points to authenticated;

-- ───────────────────────── Internal helpers ─────────────────────────

create function public.points_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.enabled from public.points_settings s), false);
$$;

-- Attendance points of one student at one lesson: posts the difference
-- between what the mark is worth now and what was already posted.
create function public.points_sync_attendance(p_lesson_id uuid, p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.points_settings;
  l public.lessons;
  target integer := 0;
  posted integer;
  rows_so_far integer;
begin
  select * into cfg from public.points_settings;
  if not found or not cfg.enabled then
    return;
  end if;
  select * into l from public.lessons where id = p_lesson_id;
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

  insert into public.points_ledger (student_id, delta, source, group_id, lesson_id, created_by, dedupe_key)
  values (
    p_student_id, target - posted, 'attendance', l.group_id, l.id, (select auth.uid()),
    'attendance:' || l.id || ':' || p_student_id || case when rows_so_far = 0 then '' else ':' || rows_so_far end
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

create function public.points_on_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.points_sync_attendance(old.lesson_id, old.student_id);
    return old;
  end if;
  -- Saving the same mark again posts nothing, even after a point value changed.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  perform public.points_sync_attendance(new.lesson_id, new.student_id);
  return new;
end;
$$;

create trigger points_on_attendance
  after insert or update of status or delete on public.attendance
  for each row execute function public.points_on_attendance();

-- Cancelling a lesson reverses its attendance points; restoring it posts them again.
create function public.points_on_lesson_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  student uuid;
begin
  for student in
    select a.student_id from public.attendance a where a.lesson_id = new.id
    union
    select p.student_id from public.points_ledger p where p.source = 'attendance' and p.lesson_id = new.id
  loop
    perform public.points_sync_attendance(new.id, student);
  end loop;
  return new;
end;
$$;

create trigger points_on_lesson_status
  after update of status on public.lessons
  for each row
  when (old.status is distinct from new.status and 'cancelled' in (old.status, new.status))
  execute function public.points_on_lesson_status();

-- ─────────────────────────── Perfect month ──────────────────────────
-- Per student and group: at least the minimum number of held lessons marked
-- in that month and none of them Absent. Late and Excused are allowed.

create function public.points_post_perfect_month(p_month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.points_settings;
  posted integer;
begin
  select * into cfg from public.points_settings;
  if not found or not cfg.enabled or cfg.perfect_month = 0 then
    return 0;
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'A month is the 1st day of the month' using errcode = '22023';
  end if;
  -- Only a month that is over, and not one from before the programme started.
  if p_month >= date_trunc('month', public.tashkent_today())::date
     or p_month < date_trunc('month', (cfg.started_at at time zone 'Asia/Tashkent'))::date then
    return 0;
  end if;

  insert into public.points_ledger (student_id, delta, source, group_id, dedupe_key)
  select
    a.student_id, cfg.perfect_month, 'perfect_month', l.group_id,
    'perfect_month:' || l.group_id || ':' || a.student_id || ':' || to_char(p_month, 'YYYY-MM')
  from public.attendance a
  join public.lessons l on l.id = a.lesson_id
  join public.students s on s.id = a.student_id and s.archived_at is null
  where l.status = 'held'
    and l.lesson_date >= p_month
    and l.lesson_date < (p_month + interval '1 month')::date
  group by a.student_id, l.group_id
  having count(*) >= cfg.perfect_month_min_lessons
     and count(*) filter (where a.status = 'absent') = 0
  on conflict (dedupe_key) do nothing;

  get diagnostics posted = row_count;
  return posted;
end;
$$;

-- ─────────────────────────── Fee paid on time ───────────────────────
-- From the day after the due day: a student whose monthly fee for that month
-- was charged by the end of the due day, and whose payments by then covered
-- everything charged up to that month.

create function public.points_post_on_time(p_month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.points_settings;
  due_end timestamptz;
  posted integer;
begin
  select * into cfg from public.points_settings;
  if not found or not cfg.enabled or cfg.on_time = 0 then
    return 0;
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'A month is the 1st day of the month' using errcode = '22023';
  end if;

  -- The first moment of the day after the due day, Tashkent time.
  select ((p_month + c.due_day)::timestamp at time zone 'Asia/Tashkent') into due_end
  from public.centre_settings c;
  if due_end is null or now() < due_end or due_end < cfg.started_at then
    return 0;
  end if;

  insert into public.points_ledger (student_id, delta, source, dedupe_key)
  select
    s.id, cfg.on_time, 'on_time_payment',
    'on_time:' || s.id || ':' || to_char(p_month, 'YYYY-MM')
  from public.students s
  where s.archived_at is null
    and exists (
      select 1 from public.charges c
      where c.student_id = s.id and c.billing_month = p_month and c.type = 'monthly_fee'
        and c.amount > 0 and c.archived_at is null and c.created_at < due_end
    )
    and (
      select coalesce(sum(p.amount), 0) from public.payments p
      where p.student_id = s.id and p.voided_at is null and p.paid_at < due_end
    ) >= (
      select coalesce(sum(c.amount), 0) from public.charges c
      where c.student_id = s.id and c.billing_month <= p_month
        and c.archived_at is null and c.created_at < due_end
    )
  on conflict (dedupe_key) do nothing;

  get diagnostics posted = row_count;
  return posted;
end;
$$;

-- The daily job, 00:20 Tashkent time. Safe to run any number of times.
create function public.points_daily()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  this_month date := date_trunc('month', public.tashkent_today())::date;
begin
  perform public.points_post_perfect_month((this_month - interval '1 month')::date);
  perform public.points_post_on_time(this_month);
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('points-daily', '20 19 * * *', 'select public.points_daily()');
  end if;
end;
$$;

-- ────────────────────────── A friend enrols ─────────────────────────
-- When the referred student's first payment that is not voided is recorded,
-- the student who referred them gets the referral points, once.

create function public.points_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.points_settings;
  referrer uuid;
  friend text;
begin
  if new.voided_at is not null then
    return new;
  end if;
  select * into cfg from public.points_settings;
  if not found or not cfg.enabled or cfg.referral = 0 then
    return new;
  end if;

  select l.referred_by_student_id, s.full_name into referrer, friend
  from public.students s
  join public.leads l on l.id = s.lead_id
  join public.students r on r.id = l.referred_by_student_id and r.archived_at is null
  where s.id = new.student_id and l.referred_by_student_id <> s.id;
  if referrer is null then
    return new;
  end if;

  if exists (
    select 1 from public.payments p
    where p.student_id = new.student_id and p.id <> new.id and p.voided_at is null
  ) then
    return new;
  end if;

  insert into public.points_ledger (student_id, delta, source, reason, dedupe_key)
  values (referrer, cfg.referral, 'referral', friend, 'referral:' || new.student_id)
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

create trigger points_on_payment
  after insert on public.payments
  for each row execute function public.points_on_payment();

-- ───────────────────────── Teacher points ───────────────────────────
-- A teacher gives or takes 1 to max_per_action points, to a student of a
-- group they teach or of a lesson they teach today as a substitute. A preset
-- carries its own points and label; a custom amount needs a reason. A
-- deduction is reduced to the student's balance. Returns what was posted.

create function public.award_points(
  p_student_id uuid,
  p_group_id uuid,
  p_points integer,
  p_preset_id uuid default null,
  p_reason text default null,
  p_lesson_id uuid default null
)
returns table (ledger_id uuid, applied integer, balance bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.points_settings;
  teacher uuid := public.my_teacher_id();
  preset public.point_presets;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  points integer := p_points;
  day_start timestamptz := (public.tashkent_today()::timestamp at time zone 'Asia/Tashkent');
  used integer;
  current_balance bigint;
  new_id uuid;
begin
  if teacher is null then
    raise exception 'Only a teacher awards points this way' using errcode = '42501';
  end if;
  select * into cfg from public.points_settings;
  if not found or not cfg.enabled then
    raise exception 'The points programme is switched off' using errcode = 'EP001';
  end if;

  if not (
    public.teacher_owns_group(p_group_id)
    or exists (
      select 1 from public.lessons l
      where l.id = p_lesson_id and l.group_id = p_group_id and l.teacher_id = teacher
        and l.status <> 'cancelled' and l.lesson_date = public.tashkent_today()
    )
  ) then
    raise exception 'Not your group' using errcode = '42501';
  end if;
  if p_lesson_id is not null and not exists (
    select 1 from public.lessons l where l.id = p_lesson_id and l.group_id = p_group_id
  ) then
    raise exception 'The lesson is not in this group' using errcode = '22023';
  end if;

  if p_preset_id is not null then
    select * into preset from public.point_presets
    where id = p_preset_id and is_active and archived_at is null;
    if not found then
      raise exception 'Preset not found' using errcode = 'P0002';
    end if;
    points := case when preset.kind = 'award' then preset.points else -preset.points end;
    reason := null;
  elsif reason is null then
    raise exception 'Say what the points are for' using errcode = 'EP003';
  end if;

  if points is null or points = 0 or abs(points) > cfg.max_per_action then
    raise exception 'A teacher gives or takes 1 to % points at a time', cfg.max_per_action using errcode = 'EP002';
  end if;

  -- One change at a time per student, so two awards cannot both pass the checks.
  perform 1 from public.students s where s.id = p_student_id and s.archived_at is null for update;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.enrollments e
    where e.group_id = p_group_id and e.student_id = p_student_id and e.status = 'active'
  ) then
    raise exception 'The student is not in this group' using errcode = 'EP005';
  end if;

  select coalesce(sum(p.delta), 0) into current_balance
  from public.points_ledger p where p.student_id = p_student_id;

  if points < 0 then
    -- Never below zero: the deduction is reduced to what the student has.
    points := -least(-points, greatest(current_balance, 0))::integer;
    if points = 0 then
      return query select null::uuid, 0, current_balance;
      return;
    end if;
  end if;

  -- Today's total from this teacher to this student, undone rows taken out.
  select coalesce(abs(sum(p.delta)), 0) into used
  from public.points_ledger p
  where p.student_id = p_student_id and p.created_by = (select auth.uid())
    and p.created_at >= day_start
    and p.source = (case when points > 0 then 'teacher_award' else 'teacher_deduction' end)::public.points_source;
  if used + abs(points) > cfg.teacher_daily_cap then
    raise exception 'The daily limit for this student is reached'
      using errcode = 'EP004', detail = greatest(cfg.teacher_daily_cap - used, 0)::text;
  end if;

  insert into public.points_ledger (student_id, delta, source, group_id, lesson_id, preset_id, reason, created_by)
  values (
    p_student_id, points,
    (case when points > 0 then 'teacher_award' else 'teacher_deduction' end)::public.points_source,
    p_group_id, p_lesson_id, p_preset_id, reason, (select auth.uid())
  )
  returning id into new_id;

  return query select new_id, points, current_balance + points;
end;
$$;

-- Undo: the teacher's own award or deduction, within a few seconds of giving
-- it (the button shows for 10 seconds; 5 more allow for a slow connection).
-- Posts a reversing row and returns the student's balance.
create function public.undo_points(p_ledger_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  original public.points_ledger;
  new_balance bigint;
begin
  select * into original from public.points_ledger
  where id = p_ledger_id and created_by = (select auth.uid())
    and source in ('teacher_award', 'teacher_deduction') and dedupe_key is null;
  if not found then
    raise exception 'Nothing to undo' using errcode = 'P0002';
  end if;
  if original.created_at < now() - interval '15 seconds' then
    raise exception 'Too late to undo' using errcode = 'EP006';
  end if;

  perform 1 from public.students s where s.id = original.student_id for update;

  insert into public.points_ledger
    (student_id, delta, source, group_id, lesson_id, preset_id, reason, created_by, dedupe_key)
  values
    (original.student_id, -original.delta, original.source, original.group_id, original.lesson_id,
     original.preset_id, original.reason, (select auth.uid()), 'undo:' || original.id)
  on conflict (dedupe_key) do nothing;
  if not found then
    raise exception 'Already undone' using errcode = 'EP006';
  end if;

  select coalesce(sum(p.delta), 0) into new_balance
  from public.points_ledger p where p.student_id = original.student_id;
  return new_balance;
end;
$$;

-- Owner adjustment: any amount, with a reason. Never below zero.
create function public.adjust_points(p_student_id uuid, p_delta integer, p_reason text, p_group_id uuid default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  current_balance bigint;
begin
  if not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not public.points_enabled() then
    raise exception 'The points programme is switched off' using errcode = 'EP001';
  end if;
  if p_delta is null or p_delta = 0 or p_delta not between -100000 and 100000 then
    raise exception 'The number of points is not allowed' using errcode = 'EP002';
  end if;
  if reason is null then
    raise exception 'A reason is required' using errcode = 'EP003';
  end if;

  perform 1 from public.students s where s.id = p_student_id and s.archived_at is null for update;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(p.delta), 0) into current_balance
  from public.points_ledger p where p.student_id = p_student_id;
  if current_balance + p_delta < 0 then
    raise exception 'The student has only % points', current_balance
      using errcode = 'EP007', detail = current_balance::text;
  end if;

  insert into public.points_ledger (student_id, delta, source, group_id, reason, created_by)
  values (p_student_id, p_delta, 'owner_adjustment', p_group_id, reason, (select auth.uid()));
  return current_balance + p_delta;
end;
$$;

-- ───────────────────── What a teacher may read ──────────────────────

-- This month's points of each student in one of the teacher's groups
-- (attendance and teacher points there). Staff may ask for any group.
create function public.group_month_points(p_group_id uuid)
returns table (student_id uuid, points bigint)
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
  select e.student_id, coalesce(sum(p.delta), 0)::bigint
  from public.enrollments e
  left join public.points_ledger p
    on p.student_id = e.student_id and p.group_id = e.group_id
   and p.source not in ('reward_hold', 'reward_return')
   and p.created_at >= (date_trunc('month', public.tashkent_today())::timestamp at time zone 'Asia/Tashkent')
  where e.group_id = p_group_id and e.status = 'active'
  group by e.student_id;
end;
$$;

-- History: every point the calling teacher gave or took this month, newest first.
create function public.teacher_points_history()
returns table (
  id uuid, created_at timestamptz, student_name text, group_name text,
  delta integer, preset_id uuid, reason text, is_undo boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.created_at, s.full_name, g.name, p.delta, p.preset_id, p.reason,
         p.dedupe_key is not null
  from public.points_ledger p
  join public.students s on s.id = p.student_id
  left join public.groups g on g.id = p.group_id
  where public.my_teacher_id() is not null
    and p.created_by = (select auth.uid())
    and p.source in ('teacher_award', 'teacher_deduction')
    and p.created_at >= (date_trunc('month', public.tashkent_today())::timestamp at time zone 'Asia/Tashkent')
  order by p.created_at desc, p.id;
$$;

-- ───────────────────────────── Grants ───────────────────────────────

revoke execute on function
  public.points_enabled(),
  public.points_sync_attendance(uuid, uuid),
  public.points_on_attendance(),
  public.points_on_lesson_status(),
  public.points_on_payment(),
  public.points_post_perfect_month(date),
  public.points_post_on_time(date),
  public.points_daily()
from public, anon, authenticated;

grant execute on function
  public.points_post_perfect_month(date),
  public.points_post_on_time(date),
  public.points_daily()
to service_role;

revoke execute on function
  public.award_points(uuid, uuid, integer, uuid, text, uuid),
  public.undo_points(uuid),
  public.adjust_points(uuid, integer, text, uuid),
  public.group_month_points(uuid),
  public.teacher_points_history()
from public, anon;

grant execute on function
  public.award_points(uuid, uuid, integer, uuid, text, uuid),
  public.undo_points(uuid),
  public.adjust_points(uuid, integer, text, uuid),
  public.group_month_points(uuid),
  public.teacher_points_history()
to authenticated, service_role;
