-- Vouchers and free open lessons. docs/STUDENT_APP_SPEC.md → "Rules →
-- Vouchers", "Rules → Free open lessons" and "Data model" (OFFER AND PAYMENTS).
--
-- An App user's first finished mock exam gives them one voucher, drawn at
-- random by the weights in Settings → Vouchers, and the app offers a free
-- open lesson. Staff type the voucher's code into the enrol sheet: a percent
-- or a fixed voucher takes its amount off the first charge after proration,
-- never below 0; a trial voucher gives its days without charge before the
-- monthly fee starts. Each code works once.

create type public.voucher_type as enum ('percent', 'fixed', 'trial_week');
create type public.voucher_status as enum ('issued', 'redeemed', 'expired');
create type public.open_lesson_booking_status as enum ('booked', 'cancelled', 'came', 'no_show');

-- ───────────────────────────── Settings ───────────────────────────────

create table public.voucher_settings (
  id boolean primary key default true check (id),
  percent_enabled boolean not null default true,
  percent_weight integer not null default 1 check (percent_weight between 0 and 100),
  -- Whole percent off the first month.
  percent_value integer not null default 20 check (percent_value between 1 and 100),
  fixed_enabled boolean not null default true,
  fixed_weight integer not null default 1 check (fixed_weight between 0 and 100),
  -- Whole soʻm off the first month.
  fixed_value bigint not null default 100000 check (fixed_value > 0),
  trial_enabled boolean not null default true,
  trial_weight integer not null default 1 check (trial_weight between 0 and 100),
  -- Days without charge.
  trial_value integer not null default 7 check (trial_value between 1 and 31),
  valid_days integer not null default 14 check (valid_days between 1 and 90),
  updated_at timestamptz not null default now()
);

insert into public.voucher_settings default values;

create trigger set_updated_at before update on public.voucher_settings
  for each row execute function public.set_updated_at();

alter table public.voucher_settings enable row level security;
revoke all on public.voucher_settings from public, anon, authenticated;
grant select, update on public.voucher_settings to authenticated;

create policy voucher_settings_select on public.voucher_settings for select to authenticated using ((select public.is_staff()));
create policy voucher_settings_update on public.voucher_settings for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

-- ───────────────────────────── Vouchers ───────────────────────────────

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^KOR-[2-9A-HJ-NP-Z]{5}$'),
  -- One per person, ever. The voucher stays when the account is deleted.
  profile_id uuid unique references public.profiles (id) on delete set null,
  lead_id uuid references public.leads (id),
  type public.voucher_type not null,
  -- Percent, soʻm, or days, by the type.
  value bigint not null check (value > 0),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status public.voucher_status not null default 'issued',
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles (id) on delete set null,
  enrollment_id uuid references public.enrollments (id),
  constraint vouchers_redeemed_shape check ((status = 'redeemed') = (redeemed_at is not null) and (status = 'redeemed') = (enrollment_id is not null))
);

create index vouchers_lead_idx on public.vouchers (lead_id);
create index vouchers_open_idx on public.vouchers (expires_at) where status = 'issued';

alter table public.vouchers enable row level security;
revoke all on public.vouchers from public, anon, authenticated;
grant select on public.vouchers to authenticated;

-- The owner and managers see every voucher; an App user sees their own.
-- Nobody writes one through the API: issuing and redeeming are functions.
create policy vouchers_select on public.vouchers for select to authenticated
  using ((select public.is_staff()) or profile_id = (select auth.uid()));

-- A lead's timeline says what happened with its voucher and its open lesson.
alter table public.lead_activities drop constraint lead_activities_kind_check;
alter table public.lead_activities add constraint lead_activities_kind_check
  check (kind in (
    'note', 'call', 'status_change', 'form_resubmitted', 'app_signup',
    'voucher_issued', 'voucher_redeemed',
    'open_lesson_booked', 'open_lesson_cancelled', 'open_lesson_came', 'open_lesson_no_show'
  ));

-- One of the enabled types, by weight; null when none can be drawn.
create function public.draw_voucher_type()
returns public.voucher_type
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.voucher_settings;
  percent integer;
  fixed integer;
  trial integer;
  pick double precision;
begin
  select * into s from public.voucher_settings;
  percent := case when s.percent_enabled then s.percent_weight else 0 end;
  fixed := case when s.fixed_enabled then s.fixed_weight else 0 end;
  trial := case when s.trial_enabled then s.trial_weight else 0 end;
  if percent + fixed + trial = 0 then
    return null;
  end if;
  pick := random() * (percent + fixed + trial);
  if pick < percent then
    return 'percent';
  elsif pick < percent + fixed then
    return 'fixed';
  end if;
  return 'trial_week';
end;
$$;

revoke execute on function public.draw_voucher_type() from public, anon, authenticated;

-- "KOR-7F3K9": five characters that cannot be mistaken for one another when
-- read aloud or typed (no 0, 1, I, L or O).
create function public.voucher_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'KOR-' || string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::integer, 1), '')
  from generate_series(1, 5);
$$;

revoke execute on function public.voucher_code() from public, anon, authenticated;

-- Gives an App user their voucher: one per account and one per lead, ever.
-- Returns its id, or null when the person has had one or none can be drawn.
create function public.issue_voucher(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  s public.voucher_settings;
  kind public.voucher_type;
  new_code text;
  new_id uuid;
begin
  select * into p from public.profiles x where x.id = p_profile_id for update;
  if not found or p.role <> 'app_user' or not p.is_active then
    return null;
  end if;
  if exists (select 1 from public.vouchers v where v.profile_id = p.id or (p.lead_id is not null and v.lead_id = p.lead_id)) then
    return null;
  end if;
  kind := public.draw_voucher_type();
  if kind is null then
    return null;
  end if;
  select * into s from public.voucher_settings;
  loop
    new_code := public.voucher_code();
    exit when not exists (select 1 from public.vouchers v where v.code = new_code);
  end loop;
  insert into public.vouchers (code, profile_id, lead_id, type, value, expires_at)
  values (
    new_code, p.id, p.lead_id, kind,
    case kind when 'percent' then s.percent_value when 'fixed' then s.fixed_value else s.trial_value end,
    now() + make_interval(days => s.valid_days)
  )
  returning id into new_id;
  if p.lead_id is not null then
    insert into public.lead_activities (lead_id, kind, body) values (p.lead_id, 'voucher_issued', new_code);
  end if;
  return new_id;
end;
$$;

revoke execute on function public.issue_voucher(uuid) from public, anon, authenticated;

-- An attempt is over: an App user's first finished exam brings the voucher.
create function public.exam_attempt_voucher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.issue_voucher(new.profile_id);
  return null;
end;
$$;

revoke execute on function public.exam_attempt_voucher() from public, anon, authenticated;

create trigger exam_attempts_voucher
after update of status on public.exam_attempts
for each row when (old.status = 'in_progress' and new.status <> 'in_progress')
execute function public.exam_attempt_voucher();

-- Vouchers past their date are expired. Hourly.
create function public.expire_vouchers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
begin
  update public.vouchers set status = 'expired' where status = 'issued' and expires_at <= now();
  get diagnostics closed = row_count;
  return closed;
end;
$$;

revoke execute on function public.expire_vouchers() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('expire-vouchers', '7 * * * *', 'select public.expire_vouchers()');
  end if;
end;
$$;

-- What a percent or a fixed voucher takes off a charge: never more than the charge.
create function public.voucher_discount(p_charge bigint, p_type public.voucher_type, p_value bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_charge <= 0 then 0
    when p_type = 'percent' then least(p_charge, public.round_to_thousand(p_charge * p_value, 100))
    when p_type = 'fixed' then least(p_charge, p_value)
    else 0
  end;
$$;

-- The first charge of an enrolment with a voucher, for the enrol sheet's
-- preview and for enrol_student itself.
--   problem: null, or why the code cannot be used: unknown | redeemed | expired
--   percent, fixed: `amount` is the charge after proration minus the voucher.
--   trial_week: lessons are counted from `paid_from` (the join date plus the
--   voucher's days). When that day is in the next month, the joining month
--   costs nothing and `next_amount` is the next month's fee from that day
--   (null when that month's lessons are not on the timetable yet).
create function public.propose_voucher_charge(
  p_group_id uuid,
  p_joined_on date,
  p_discount_kind text,
  p_discount_value bigint,
  p_code text,
  p_charge_mode text default 'prorated'
)
returns table (
  code text,
  type public.voucher_type,
  value bigint,
  problem text,
  before_voucher bigint,
  voucher_discount bigint,
  amount bigint,
  is_prorated boolean,
  lessons_counted integer,
  paid_from date,
  next_month date,
  next_amount bigint,
  next_lessons_counted integer,
  next_lessons_in_month integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vouchers;
  first record;
  later record;
  base bigint;
  start_paid date;
begin
  if not public.is_staff() then
    raise exception 'Only the owner and managers use vouchers' using errcode = '42501';
  end if;
  select * into v from public.vouchers x where x.code = upper(btrim(coalesce(p_code, '')));
  select * into first from public.propose_first_charge(p_group_id, p_joined_on, p_discount_kind, p_discount_value);
  base := case when p_charge_mode = 'full' then first.full_amount else first.amount end;
  if v.id is null or v.status <> 'issued' or v.expires_at <= now() then
    return query select
      v.code, v.type, v.value,
      case when v.id is null then 'unknown' when v.status = 'redeemed' then 'redeemed' else 'expired' end,
      base, 0::bigint, base, (p_charge_mode <> 'full' and first.is_prorated), first.lessons_counted,
      null::date, null::date, null::bigint, null::integer, null::integer;
    return;
  end if;

  if v.type <> 'trial_week' then
    return query select
      v.code, v.type, v.value, null::text,
      base, public.voucher_discount(base, v.type, v.value), base - public.voucher_discount(base, v.type, v.value),
      (p_charge_mode <> 'full' and first.is_prorated), first.lessons_counted,
      null::date, null::date, null::bigint, null::integer, null::integer;
    return;
  end if;

  start_paid := p_joined_on + v.value::integer;
  select * into later from public.propose_first_charge(p_group_id, start_paid, p_discount_kind, p_discount_value);
  if later.billing_month = first.billing_month then
    return query select
      v.code, v.type, v.value, null::text,
      base, base - later.amount, later.amount, true, later.lessons_counted,
      start_paid, null::date, null::bigint, null::integer, null::integer;
  else
    return query select
      v.code, v.type, v.value, null::text,
      base, base, 0::bigint, true, 0,
      start_paid, later.billing_month,
      case when later.lessons_in_month > 0 then later.amount end,
      case when later.lessons_in_month > 0 then later.lessons_counted end,
      case when later.lessons_in_month > 0 then later.lessons_in_month end;
  end if;
end;
$$;

revoke execute on function public.propose_voucher_charge(uuid, date, text, bigint, text, text) from public, anon;
grant execute on function public.propose_voucher_charge(uuid, date, text, bigint, text, text) to authenticated;

-- Uses a code for an enrolment: once, by the owner or a manager.
--   EV001 no such code · EV002 already used · EV003 expired
create function public.redeem_voucher(p_code text, p_enrollment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vouchers;
begin
  if not public.is_staff() then
    raise exception 'Only the owner and managers use vouchers' using errcode = '42501';
  end if;
  select * into v from public.vouchers x where x.code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then
    raise exception 'No such voucher' using errcode = 'EV001';
  end if;
  if v.status = 'redeemed' then
    raise exception 'This voucher has been used' using errcode = 'EV002';
  end if;
  if v.status = 'expired' or v.expires_at <= now() then
    raise exception 'This voucher has expired' using errcode = 'EV003';
  end if;
  perform 1 from public.enrollments e where e.id = p_enrollment_id;
  if not found then
    raise exception 'No such enrolment' using errcode = 'P0002';
  end if;
  update public.vouchers
  set status = 'redeemed', redeemed_at = now(), redeemed_by = (select auth.uid()), enrollment_id = p_enrollment_id
  where id = v.id;
  if v.lead_id is not null then
    insert into public.lead_activities (lead_id, kind, body, created_by) values (v.lead_id, 'voucher_redeemed', v.code, (select auth.uid()));
  end if;
  return v.id;
end;
$$;

revoke execute on function public.redeem_voucher(text, uuid) from public, anon;
grant execute on function public.redeem_voucher(text, uuid) to authenticated;

-- Enrolment, now with an optional voucher code. Everything else is as it was
-- (20261119100100_left_debt_and_graduated.sql): the first charge is always written, even for
-- 0 soʻm. A voucher cannot be combined with a custom amount (EV004).
drop function public.enrol_student(uuid, uuid, date, text, bigint, text, text, bigint, text);

create function public.enrol_student(
  p_student_id uuid,
  p_group_id uuid,
  p_joined_on date,
  p_discount_kind text default null,
  p_discount_value bigint default null,
  p_note text default null,
  p_charge_mode text default 'prorated',
  p_custom_amount bigint default null,
  p_charge_note text default null,
  p_voucher_code text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  proposal record;
  offer record;
  student_status public.student_status;
  new_enrollment_id uuid;
  charge_amount bigint;
  charge_prorated boolean;
  charge_lessons integer;
  charge_text text;
  with_voucher boolean := btrim(coalesce(p_voucher_code, '')) <> '';
begin
  if p_charge_mode not in ('prorated', 'full', 'custom') then
    raise exception 'Unknown charge mode' using errcode = '22023';
  end if;
  if with_voucher and p_charge_mode = 'custom' then
    raise exception 'A voucher cannot be combined with a custom amount' using errcode = 'EV004';
  end if;
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
  charge_lessons := proposal.lessons_counted;

  if p_charge_mode = 'custom' then
    if p_custom_amount is null or p_custom_amount < 0 then
      raise exception 'Invalid custom amount' using errcode = '22023';
    end if;
    if btrim(coalesce(p_charge_note, '')) = '' then
      raise exception 'A custom amount needs a note' using errcode = '23514';
    end if;
    charge_amount := p_custom_amount;
    charge_prorated := false;
    charge_text := btrim(p_charge_note);
  elsif p_charge_mode = 'full' then
    charge_amount := proposal.full_amount;
    charge_prorated := false;
  else
    charge_amount := proposal.amount;
    charge_prorated := proposal.is_prorated;
  end if;

  if with_voucher then
    select * into offer
    from public.propose_voucher_charge(p_group_id, p_joined_on, p_discount_kind, p_discount_value, p_voucher_code, p_charge_mode);
    if offer.problem is not null then
      raise exception 'This voucher cannot be used: %', offer.problem
        using errcode = case offer.problem when 'unknown' then 'EV001' when 'redeemed' then 'EV002' else 'EV003' end;
    end if;
    charge_amount := offer.amount;
    charge_prorated := offer.is_prorated;
    charge_lessons := offer.lessons_counted;
    charge_text := 'Voucher ' || offer.code;
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
    charge_lessons, proposal.lessons_in_month, charge_text, (select auth.uid())
  );

  if with_voucher then
    -- A trial that runs into the next month: that month's fee starts on the
    -- first paid day, so the monthly run does not bill it in full.
    if offer.next_amount is not null then
      insert into public.charges (
        student_id, enrollment_id, group_id, billing_month, type, base_amount, discount_amount,
        amount, is_prorated, lessons_counted, lessons_in_month, note, created_by
      )
      select p_student_id, new_enrollment_id, p_group_id, offer.next_month, 'monthly_fee',
             public.group_fee_for(p_group_id, offer.next_month),
             public.discount_amount(public.group_fee_for(p_group_id, offer.next_month), p_discount_kind, p_discount_value),
             offer.next_amount, true, offer.next_lessons_counted, offer.next_lessons_in_month, charge_text, (select auth.uid());
    end if;
    perform public.redeem_voucher(p_voucher_code, new_enrollment_id);
  end if;

  -- Someone who had left is a student again.
  if student_status in ('left', 'graduated') then
    update public.students set status = 'active' where id = p_student_id;
  end if;

  return new_enrollment_id;
end;
$$;

revoke execute on function public.enrol_student(uuid, uuid, date, text, bigint, text, text, bigint, text, text) from public, anon;
grant execute on function public.enrol_student(uuid, uuid, date, text, bigint, text, text, bigint, text, text) to authenticated, service_role;

-- ─────────────────────────── Open lessons ─────────────────────────────

create table public.open_lesson_slots (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> '' and length(title) <= 120),
  -- Who it is for; null = every level.
  korean_level public.korean_level,
  -- 1 = Monday … 7 = Sunday.
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  duration_min integer not null default 60 check (duration_min between 15 and 240),
  room text check (room is null or length(room) <= 60),
  teacher_id uuid references public.teachers (id),
  seats integer not null check (seats between 1 and 200),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.open_lesson_slots
  for each row execute function public.set_updated_at();

create table public.open_lesson_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.open_lesson_slots (id),
  session_date date not null,
  -- Deleting the account in the app takes its bookings with it.
  profile_id uuid not null references public.profiles (id) on delete cascade,
  lead_id uuid references public.leads (id),
  status public.open_lesson_booking_status not null default 'booked',
  booked_at timestamptz not null default now(),
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz,
  unique (slot_id, session_date, profile_id)
);

-- One active booking per person: kept by book_open_lesson, since a booking
-- stays "booked" after its lesson until staff mark it.
create index open_lesson_bookings_profile_idx on public.open_lesson_bookings (profile_id) where status = 'booked';
create index open_lesson_bookings_session_idx on public.open_lesson_bookings (slot_id, session_date);

-- A lead on trial through an open lesson has no trial group.
alter table public.leads add column trial_open_lesson_slot_id uuid references public.open_lesson_slots (id);
alter table public.leads drop constraint leads_trial_shape;
alter table public.leads add constraint leads_trial_shape
  check (status <> 'trial' or (trial_date is not null and (trial_group_id is not null or trial_open_lesson_slot_id is not null)));

-- Archiving a slot is the owner's.
create function public.guard_open_lesson_slot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_api_user() and new.archived_at is distinct from old.archived_at and not public.is_owner() then
    raise exception 'Only the owner archives' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_open_lesson_slot before update on public.open_lesson_slots
  for each row execute function public.guard_open_lesson_slot();

alter table public.open_lesson_slots enable row level security;
alter table public.open_lesson_bookings enable row level security;
revoke all on public.open_lesson_slots, public.open_lesson_bookings from public, anon, authenticated;
grant select, insert, update on public.open_lesson_slots to authenticated;
grant select on public.open_lesson_bookings to authenticated;

-- The owner and managers set the slots; a teacher sees their own. The app
-- reads sessions through open_lessons().
create policy open_lesson_slots_select on public.open_lesson_slots for select to authenticated
  using ((select public.is_staff()) or teacher_id = (select public.my_teacher_id()));
create policy open_lesson_slots_insert on public.open_lesson_slots for insert to authenticated with check ((select public.is_staff()));
create policy open_lesson_slots_update on public.open_lesson_slots for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- Bookings: staff, the slot's teacher, and the person who booked. Written by functions only.
create policy open_lesson_bookings_select on public.open_lesson_bookings for select to authenticated
  using (
    (select public.is_staff())
    or profile_id = (select auth.uid())
    or exists (select 1 from public.open_lesson_slots s where s.id = slot_id and s.teacher_id = (select public.my_teacher_id()))
  );

-- When a session starts, in real time.
create function public.open_lesson_start(p_session_date date, p_start_time time)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (p_session_date + p_start_time) at time zone 'Asia/Tashkent';
$$;

-- The caller, when they are an App user. Internal.
create function public.open_lesson_person()
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles x where x.id = (select auth.uid()) and x.is_active and x.role = 'app_user';
  if not found then
    raise exception 'Open lessons are for app users' using errcode = '42501';
  end if;
  return p;
end;
$$;

revoke execute on function public.open_lesson_person() from public, anon, authenticated;

-- What the app shows: the sessions of the next 4 weeks that have not started,
-- with the seats left, and the caller's own booking.
create function public.open_lessons()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  today date := public.tashkent_today();
begin
  me := public.open_lesson_person();
  return jsonb_build_object(
    'server_now', now(),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slot_id', s.id, 'session_date', d.day, 'title', s.title, 'korean_level', s.korean_level,
        'starts_at', public.open_lesson_start(d.day, s.start_time), 'duration_min', s.duration_min,
        'room', s.room, 'teacher', t.full_name, 'seats', s.seats,
        'seats_left', greatest(0, s.seats - (
          select count(*) from public.open_lesson_bookings b
          where b.slot_id = s.id and b.session_date = d.day and b.status <> 'cancelled'))::integer
      ) order by public.open_lesson_start(d.day, s.start_time), s.title)
      from public.open_lesson_slots s
      cross join lateral (select day::date from generate_series(today, today + 27, interval '1 day') day) d
      left join public.teachers t on t.id = s.teacher_id
      where s.is_active and s.archived_at is null
        and extract(isodow from d.day) = s.weekday
        and public.open_lesson_start(d.day, s.start_time) > now()
    ), '[]'::jsonb),
    'booking', (
      select jsonb_build_object(
        'id', b.id, 'slot_id', s.id, 'session_date', b.session_date, 'title', s.title, 'korean_level', s.korean_level,
        'starts_at', public.open_lesson_start(b.session_date, s.start_time), 'duration_min', s.duration_min,
        'room', s.room, 'teacher', t.full_name,
        -- Cancelling closes 2 hours before the start.
        'cancel_until', public.open_lesson_start(b.session_date, s.start_time) - interval '2 hours')
      from public.open_lesson_bookings b
      join public.open_lesson_slots s on s.id = b.slot_id
      left join public.teachers t on t.id = s.teacher_id
      where b.profile_id = me.id and b.status = 'booked'
        and public.open_lesson_start(b.session_date, s.start_time) + make_interval(mins => s.duration_min) > now()
    )
  );
end;
$$;

revoke execute on function public.open_lessons() from public, anon;
grant execute on function public.open_lessons() to authenticated;

-- Books a seat. One active booking per person; the lead moves to Trial with
-- the date. Returns the booking's id.
--   EO001 no such session · EO002 no seats left · EO003 already has a booking
create function public.book_open_lesson(p_slot_id uuid, p_session_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  s public.open_lesson_slots;
  today date := public.tashkent_today();
  taken integer;
  booking uuid;
  lead uuid;
begin
  me := public.open_lesson_person();
  -- One booking at a time per person, and per slot for the seats.
  perform pg_advisory_xact_lock(hashtextextended('open-lesson:' || me.id::text, 0));
  select * into s from public.open_lesson_slots x where x.id = p_slot_id and x.is_active and x.archived_at is null for update;
  if not found or p_session_date is null or extract(isodow from p_session_date) <> s.weekday
    or p_session_date < today or p_session_date > today + 27
    or public.open_lesson_start(p_session_date, s.start_time) <= now()
  then
    raise exception 'No such open lesson' using errcode = 'EO001';
  end if;

  -- A booking whose lesson is over no longer holds the person back, marked or not.
  if exists (
    select 1 from public.open_lesson_bookings b join public.open_lesson_slots x on x.id = b.slot_id
    where b.profile_id = me.id and b.status = 'booked'
      and public.open_lesson_start(b.session_date, x.start_time) + make_interval(mins => x.duration_min) > now()
  ) then
    raise exception 'You already have a booking' using errcode = 'EO003';
  end if;

  select count(*) into taken from public.open_lesson_bookings b
  where b.slot_id = s.id and b.session_date = p_session_date and b.status <> 'cancelled' and b.profile_id <> me.id;
  if taken >= s.seats then
    raise exception 'No seats left' using errcode = 'EO002';
  end if;

  -- The person's lead: the open one they have, or a new one.
  if me.lead_id is null or not exists (
    select 1 from public.leads d where d.id = me.lead_id and d.archived_at is null and d.status in ('new', 'contacted', 'trial')
  ) then
    perform public.link_or_lead(me.id);
  end if;
  select d.id into lead from public.profiles x join public.leads d on d.id = x.lead_id
  where x.id = me.id and d.archived_at is null and d.status in ('new', 'contacted', 'trial');

  insert into public.open_lesson_bookings (slot_id, session_date, profile_id, lead_id)
  values (s.id, p_session_date, me.id, lead)
  on conflict (slot_id, session_date, profile_id)
  do update set status = 'booked', booked_at = now(), lead_id = excluded.lead_id, marked_by = null, marked_at = null
  returning id into booking;

  if lead is not null then
    update public.leads set status = 'trial', trial_date = p_session_date, trial_open_lesson_slot_id = s.id, trial_group_id = null where id = lead;
    -- The status change was the person's own doing: the timeline does not name a member of staff for it,
    -- and the account can still be deleted.
    update public.lead_activities set created_by = null where lead_id = lead and created_by = me.id;
    insert into public.lead_activities (lead_id, kind, body)
    values (lead, 'open_lesson_booked', s.title || ' · ' || to_char(p_session_date, 'YYYY-MM-DD') || ' ' || to_char(s.start_time, 'HH24:MI'));
  end if;
  return booking;
end;
$$;

revoke execute on function public.book_open_lesson(uuid, date) from public, anon;
grant execute on function public.book_open_lesson(uuid, date) to authenticated;

-- Cancels the caller's booking, up to 2 hours before the start (EO004 after).
create function public.cancel_open_lesson_booking(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  b public.open_lesson_bookings;
  s public.open_lesson_slots;
begin
  me := public.open_lesson_person();
  select * into b from public.open_lesson_bookings x where x.id = p_id and x.profile_id = me.id and x.status = 'booked' for update;
  if not found then
    raise exception 'No such booking' using errcode = 'P0002';
  end if;
  select * into s from public.open_lesson_slots x where x.id = b.slot_id;
  if now() > public.open_lesson_start(b.session_date, s.start_time) - interval '2 hours' then
    raise exception 'Too late to cancel' using errcode = 'EO004';
  end if;
  update public.open_lesson_bookings set status = 'cancelled' where id = b.id;
  if b.lead_id is not null then
    -- The trial was this lesson: the lead is back with the people to call.
    update public.leads set status = 'contacted', trial_date = null, trial_open_lesson_slot_id = null
    where id = b.lead_id and status = 'trial' and trial_open_lesson_slot_id = b.slot_id and trial_date = b.session_date;
    update public.lead_activities set created_by = null where lead_id = b.lead_id and created_by = me.id;
    insert into public.lead_activities (lead_id, kind, body)
    values (b.lead_id, 'open_lesson_cancelled', s.title || ' · ' || to_char(b.session_date, 'YYYY-MM-DD') || ' ' || to_char(s.start_time, 'HH24:MI'));
  end if;
end;
$$;

revoke execute on function public.cancel_open_lesson_booking(uuid) from public, anon;
grant execute on function public.cancel_open_lesson_booking(uuid) to authenticated;

-- Came or No-show, by the owner or a manager; 'booked' takes the mark back.
create function public.mark_open_lesson(p_booking_id uuid, p_status public.open_lesson_booking_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.open_lesson_bookings;
  s public.open_lesson_slots;
begin
  if not public.is_staff() then
    raise exception 'Only the owner and managers mark open lessons' using errcode = '42501';
  end if;
  if p_status = 'cancelled' then
    raise exception 'A booking is cancelled by the person who made it' using errcode = '22023';
  end if;
  select * into b from public.open_lesson_bookings x where x.id = p_booking_id and x.status <> 'cancelled' for update;
  if not found then
    raise exception 'No such booking' using errcode = 'P0002';
  end if;
  if b.status = p_status then
    return;
  end if;
  update public.open_lesson_bookings
  set status = p_status, marked_by = case when p_status = 'booked' then null else (select auth.uid()) end,
      marked_at = case when p_status = 'booked' then null else now() end
  where id = b.id;
  if b.lead_id is not null and p_status <> 'booked' then
    select * into s from public.open_lesson_slots x where x.id = b.slot_id;
    insert into public.lead_activities (lead_id, kind, body, created_by)
    values (b.lead_id, case p_status when 'came' then 'open_lesson_came' else 'open_lesson_no_show' end,
            s.title || ' · ' || to_char(b.session_date, 'YYYY-MM-DD') || ' ' || to_char(s.start_time, 'HH24:MI'), (select auth.uid()));
  end if;
end;
$$;

revoke execute on function public.mark_open_lesson(uuid, public.open_lesson_booking_status) from public, anon;
grant execute on function public.mark_open_lesson(uuid, public.open_lesson_booking_status) to authenticated;

-- Reports: vouchers by type, with how many were used to enrol.
create function public.voucher_report(p_from date, p_to date)
returns table (type public.voucher_type, issued integer, redeemed integer, expired integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select k.kind,
         count(v.id)::integer,
         (count(v.id) filter (where v.status = 'redeemed'))::integer,
         (count(v.id) filter (where v.status = 'expired' or (v.status = 'issued' and v.expires_at <= now())))::integer
  from unnest(enum_range(null::public.voucher_type)) as k (kind)
  left join public.vouchers v on v.type = k.kind
    and (v.issued_at at time zone 'Asia/Tashkent')::date between p_from and p_to
  group by k.kind
  order by k.kind;
end;
$$;

revoke execute on function public.voucher_report(date, date) from public, anon;
grant execute on function public.voucher_report(date, date) to authenticated;
