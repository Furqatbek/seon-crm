-- Groups: lesson generation, the first charge at enrolment, leaving and
-- transfers, and saving attendance.
-- docs/SPEC.md → "Joining mid-month", "Leaving and transfers",
-- "Lessons and attendance".
--
-- Custom error codes raised below (the app maps them to messages):
--   EC001 group is finished or archived      EC004 lesson has not happened yet
--   EC002 date outside the allowed range     EC005 student is not in the group
--   EC003 lesson is cancelled                EC006 transfer to the same group

-- ───────────────────────────── Helpers ───────────────────────────

create function public.tashkent_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Tashkent')::date;
$$;

-- Lessons are kept generated up to this day: 30 days ahead, and never less
-- than the whole of next month, so a first charge for this month or the next
-- can always count every lesson in it.
create function public.lesson_horizon()
returns date
language sql
stable
set search_path = ''
as $$
  select greatest(
    public.tashkent_today() + 30,
    (date_trunc('month', public.tashkent_today()) + interval '2 months' - interval '1 day')::date
  );
$$;

-- numerator / denominator, rounded to the nearest 1,000 soʻm, half up.
-- Mirrors roundToThousand() in src/lib/domain/proration.ts.
create function public.round_to_thousand(numerator bigint, denominator bigint default 1)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select ((numerator * 2 + denominator * 1000) / (denominator * 2000)) * 1000;
$$;

-- ─────────────────────── Lesson generation ───────────────────────

-- True when the request comes through the API as a visitor or a signed-in
-- user. Unlike is_api_user() this also works inside security definer
-- functions, where current_user is the function's owner.
create function public.is_user_request()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.role()), '') in ('authenticated', 'anon');
$$;

-- Creates the missing lessons of a group between two days from its weekdays
-- and start time. Days that already have a lesson (held, cancelled or
-- scheduled) are left alone, so it can be run any number of times.
create function public.generate_lessons(p_group_id uuid, p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.groups;
  made integer;
begin
  if public.is_user_request() and not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into g from public.groups where id = p_group_id;
  if not found or g.archived_at is not null or g.status = 'finished' then
    return 0;
  end if;

  insert into public.lessons (group_id, teacher_id, lesson_date, start_time)
  select g.id, g.teacher_id, d::date, g.start_time
  from generate_series(
    greatest(p_from, g.start_date)::timestamp,
    least(p_to, coalesce(g.end_date, p_to))::timestamp,
    interval '1 day'
  ) as d
  where extract(isodow from d)::smallint = any (g.days)
    and not exists (
      select 1 from public.lessons l
      where l.group_id = g.id and l.lesson_date = d::date
    );

  get diagnostics made = row_count;
  return made;
end;
$$;

-- Schedule changes rebuild future lessons that have no attendance yet.
-- Lessons that were held or cancelled stay as they are.
create function public.rebuild_future_lessons(p_group_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_user_request() and not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  delete from public.lessons l
  where l.group_id = p_group_id
    and l.lesson_date >= public.tashkent_today()
    and l.status = 'scheduled'
    and not exists (select 1 from public.attendance a where a.lesson_id = l.id);

  return public.generate_lessons(p_group_id, public.tashkent_today(), public.lesson_horizon());
end;
$$;

-- The daily job: every open group gets its lessons up to the horizon.
create function public.generate_all_lessons()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
  made integer := 0;
begin
  if public.is_user_request() and not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  for g in
    select id from public.groups where archived_at is null and status <> 'finished'
  loop
    made := made + public.generate_lessons(g.id, public.tashkent_today(), public.lesson_horizon());
  end loop;
  return made;
end;
$$;

create function public.groups_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- From the start of this month, so a first charge can count the whole month.
  perform public.generate_lessons(
    new.id,
    date_trunc('month', public.tashkent_today())::date,
    public.lesson_horizon()
  );
  return new;
end;
$$;

create trigger generate_lessons_on_create
  after insert on public.groups
  for each row execute function public.groups_after_insert();

create function public.groups_after_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.rebuild_future_lessons(new.id);
  return new;
end;
$$;

create trigger rebuild_lessons_on_schedule_change
  after update on public.groups
  for each row
  when (
    old.days is distinct from new.days
    or old.start_time is distinct from new.start_time
    or old.teacher_id is distinct from new.teacher_id
    or old.start_date is distinct from new.start_date
    or old.end_date is distinct from new.end_date
    or old.status is distinct from new.status
    or old.archived_at is distinct from new.archived_at
  )
  execute function public.groups_after_schedule_change();

-- Groups that already exist get their lessons up to the horizon now.
select public.generate_all_lessons();

-- Daily at 00:10 Tashkent time (cron runs in UTC: 19:10 the day before).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule(
      'generate-lessons-daily',
      '10 19 * * *',
      'select public.generate_all_lessons()'
    );
  end if;
end;
$$;

-- ───────────────────────── First charge ──────────────────────────

-- What a student joining a group on a day should pay for that month.
-- Mirrors proposeFirstCharge() in src/lib/domain/proration.ts.
--   * joined after the month's first lesson → prorated by lessons left
--   * joined on or before it → the full month
--   * no lessons left (or none in the month) → nothing
-- Cancelled lessons are not counted.
create function public.propose_first_charge(
  p_group_id uuid,
  p_joined_on date,
  p_discount_kind text default null,
  p_discount_value bigint default null
)
returns table (
  billing_month date,
  base_amount bigint,
  discount_amount bigint,
  full_amount bigint,
  lessons_in_month integer,
  lessons_counted integer,
  is_prorated boolean,
  amount bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  fee bigint;
  month_start date := date_trunc('month', p_joined_on)::date;
  total integer;
  counted integer;
  first_lesson date;
  discount bigint;
  after_discount bigint;
  prorated boolean;
begin
  select g.monthly_fee into fee from public.groups g where g.id = p_group_id;
  if not found then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;

  if p_discount_kind = 'percent' and p_discount_value between 1 and 100 then
    discount := least(fee, public.round_to_thousand(fee * p_discount_value, 100));
  elsif p_discount_kind = 'amount' and p_discount_value > 0 then
    discount := least(fee, p_discount_value);
  elsif p_discount_kind is null then
    discount := 0;
  else
    raise exception 'Invalid discount' using errcode = '22023';
  end if;
  after_discount := fee - discount;

  select count(*), count(*) filter (where l.lesson_date >= p_joined_on), min(l.lesson_date)
  into total, counted, first_lesson
  from public.lessons l
  where l.group_id = p_group_id
    and l.status <> 'cancelled'
    and l.lesson_date >= month_start
    and l.lesson_date < (month_start + interval '1 month')::date;

  prorated := total > 0 and p_joined_on > first_lesson;

  return query select
    month_start,
    fee,
    discount,
    after_discount,
    total,
    counted,
    prorated,
    case
      when counted = 0 then 0::bigint
      when prorated then public.round_to_thousand(after_discount * counted, total)
      else after_discount
    end;
end;
$$;

-- ───────────────────────────── Enrol ─────────────────────────────

-- Enrols a student and creates the first charge in the same transaction.
--   p_charge_mode: 'prorated' (the proposal), 'full' (the whole month) or
--   'custom' (p_custom_amount, with a required note).
-- A charge row is always written, even for 0 soʻm, so generating the month's
-- fees later never bills this enrolment a second time.
-- Runs with the caller's rights: row level security decides who may do it.
create function public.enrol_student(
  p_student_id uuid,
  p_group_id uuid,
  p_joined_on date,
  p_discount_kind text default null,
  p_discount_value bigint default null,
  p_note text default null,
  p_charge_mode text default 'prorated',
  p_custom_amount bigint default null,
  p_charge_note text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  proposal record;
  student_status public.student_status;
  new_enrollment_id uuid;
  charge_amount bigint;
  charge_prorated boolean;
begin
  if p_charge_mode not in ('prorated', 'full', 'custom') then
    raise exception 'Unknown charge mode' using errcode = '22023';
  end if;
  -- This month (so the first charge is for a month still being billed) up to
  -- the last day lessons exist for.
  if p_joined_on < date_trunc('month', public.tashkent_today())::date
    or p_joined_on > public.lesson_horizon()
  then
    raise exception 'Join date is outside the allowed range' using errcode = 'EC002';
  end if;

  select s.status into student_status
  from public.students s
  where s.id = p_student_id and s.archived_at is null
  for update;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;

  perform 1 from public.groups g
  where g.id = p_group_id and g.archived_at is null and g.status <> 'finished';
  if not found then
    raise exception 'Group is closed' using errcode = 'EC001';
  end if;

  select * into proposal
  from public.propose_first_charge(p_group_id, p_joined_on, p_discount_kind, p_discount_value);

  if p_charge_mode = 'custom' then
    if p_custom_amount is null or p_custom_amount < 0 then
      raise exception 'Invalid custom amount' using errcode = '22023';
    end if;
    if btrim(coalesce(p_charge_note, '')) = '' then
      raise exception 'A custom amount needs a note' using errcode = '23514';
    end if;
    charge_amount := p_custom_amount;
    charge_prorated := false;
  elsif p_charge_mode = 'full' then
    charge_amount := proposal.full_amount;
    charge_prorated := false;
  else
    charge_amount := proposal.amount;
    charge_prorated := proposal.is_prorated;
  end if;

  insert into public.enrollments (group_id, student_id, joined_on, discount_kind, discount_value, note)
  values (p_group_id, p_student_id, p_joined_on, p_discount_kind, p_discount_value,
          nullif(btrim(coalesce(p_note, '')), ''))
  returning id into new_enrollment_id;

  insert into public.charges (
    student_id, enrollment_id, group_id, billing_month, type, base_amount, discount_amount,
    amount, is_prorated, lessons_counted, lessons_in_month, note, created_by
  )
  values (
    p_student_id, new_enrollment_id, p_group_id, proposal.billing_month, 'monthly_fee',
    proposal.base_amount, proposal.discount_amount, charge_amount, charge_prorated,
    proposal.lessons_counted, proposal.lessons_in_month,
    case when p_charge_mode = 'custom' then btrim(p_charge_note) end,
    (select auth.uid())
  );

  -- Someone who had left is a student again.
  if student_status = 'left' then
    update public.students set status = 'active' where id = p_student_id;
  end if;

  return new_enrollment_id;
end;
$$;

-- ──────────────────────── Leave and transfer ─────────────────────

-- Leaving a group sets left_on. Nothing is refunded automatically; a credit
-- is a negative charge and needs a note.
create function public.leave_group(
  p_enrollment_id uuid,
  p_left_on date,
  p_credit_amount bigint default null,
  p_credit_note text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  e public.enrollments;
begin
  select * into e from public.enrollments where id = p_enrollment_id and status = 'active' for update;
  if not found then
    raise exception 'Enrolment not found' using errcode = 'P0002';
  end if;
  if p_left_on < e.joined_on or p_left_on > public.tashkent_today() then
    raise exception 'Leave date is outside the allowed range' using errcode = 'EC002';
  end if;

  update public.enrollments set status = 'left', left_on = p_left_on where id = e.id;

  if coalesce(p_credit_amount, 0) < 0 then
    raise exception 'Invalid credit amount' using errcode = '22023';
  end if;
  if coalesce(p_credit_amount, 0) > 0 then
    insert into public.charges (
      student_id, enrollment_id, group_id, billing_month, type, amount, note, created_by
    )
    values (
      e.student_id, e.id, e.group_id, date_trunc('month', p_left_on)::date, 'adjustment',
      -p_credit_amount, nullif(btrim(coalesce(p_credit_note, '')), ''), (select auth.uid())
    );
  end if;
end;
$$;

-- A transfer leaves group A and enrols in group B on the same date, with the
-- optional credit for A and the first charge for B, in one transaction.
create function public.transfer_student(
  p_enrollment_id uuid,
  p_to_group_id uuid,
  p_on date,
  p_credit_amount bigint default null,
  p_credit_note text default null,
  p_discount_kind text default null,
  p_discount_value bigint default null,
  p_charge_mode text default 'prorated',
  p_custom_amount bigint default null,
  p_charge_note text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  e public.enrollments;
begin
  select * into e from public.enrollments where id = p_enrollment_id and status = 'active';
  if not found then
    raise exception 'Enrolment not found' using errcode = 'P0002';
  end if;
  if e.group_id = p_to_group_id then
    raise exception 'The student is already in this group' using errcode = 'EC006';
  end if;

  perform public.leave_group(p_enrollment_id, p_on, p_credit_amount, p_credit_note);
  return public.enrol_student(
    e.student_id, p_to_group_id, p_on, p_discount_kind, p_discount_value, null,
    p_charge_mode, p_custom_amount, p_charge_note
  );
end;
$$;

-- ─────────────────────────── Attendance ──────────────────────────

-- Saves a lesson's marks ([{ "student_id": …, "status": … }]) and marks the
-- lesson held. Runs with the caller's rights: the 7-day window for managers
-- is enforced by the attendance policies. Attendance never changes charges.
create function public.save_attendance(p_lesson_id uuid, p_marks jsonb)
returns void
language plpgsql
set search_path = ''
as $$
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
  select l.id, (m ->> 'student_id')::uuid, (m ->> 'status')::public.attendance_status,
         (select auth.uid()), now()
  from jsonb_array_elements(p_marks) as m
  on conflict (lesson_id, student_id) do update
    set status = excluded.status, marked_by = excluded.marked_by, marked_at = excluded.marked_at;

  update public.lessons set status = 'held' where id = l.id and status <> 'held';
end;
$$;

-- Restoring a cancelled lesson: held if it had been marked, scheduled if not.
create function public.restore_lesson(p_lesson_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.lessons l
  set cancel_reason = null,
      status = case
        when exists (select 1 from public.attendance a where a.lesson_id = l.id)
          then 'held'::public.lesson_status
        else 'scheduled'::public.lesson_status
      end
  where l.id = p_lesson_id and l.status = 'cancelled';
  if not found then
    raise exception 'Lesson not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ───────────────────────────── Grants ────────────────────────────

revoke execute on function
  public.is_user_request(),
  public.tashkent_today(),
  public.lesson_horizon(),
  public.round_to_thousand(bigint, bigint),
  public.generate_lessons(uuid, date, date),
  public.rebuild_future_lessons(uuid),
  public.generate_all_lessons(),
  public.propose_first_charge(uuid, date, text, bigint),
  public.enrol_student(uuid, uuid, date, text, bigint, text, text, bigint, text),
  public.leave_group(uuid, date, bigint, text),
  public.transfer_student(uuid, uuid, date, bigint, text, text, bigint, text, bigint, text),
  public.save_attendance(uuid, jsonb),
  public.restore_lesson(uuid)
from public, anon;

grant execute on function
  public.is_user_request(),
  public.tashkent_today(),
  public.lesson_horizon(),
  public.round_to_thousand(bigint, bigint),
  public.generate_lessons(uuid, date, date),
  public.rebuild_future_lessons(uuid),
  public.generate_all_lessons(),
  public.propose_first_charge(uuid, date, text, bigint),
  public.enrol_student(uuid, uuid, date, text, bigint, text, text, bigint, text),
  public.leave_group(uuid, date, bigint, text),
  public.transfer_student(uuid, uuid, date, bigint, text, text, bigint, text, bigint, text),
  public.save_attendance(uuid, jsonb),
  public.restore_lesson(uuid)
to authenticated, service_role;

revoke execute on function
  public.groups_after_insert(),
  public.groups_after_schedule_change()
from public, anon, authenticated;
