-- Edu CRM schema — docs/SPEC.md → "Data model".
-- Money is bigint whole soʻm. Timestamps are timestamptz; a billing month is
-- the date of its 1st day. Business records are never deleted: archived_at.

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────────── Enums ─────────────────────────────

create type public.user_role as enum ('owner', 'manager');
create type public.app_language as enum ('uz', 'ru', 'en');
create type public.lead_status as enum ('new', 'contacted', 'trial', 'won', 'lost');
create type public.lead_source as enum
  ('instagram', 'telegram', 'phone_call', 'walk_in', 'referral', 'website', 'other');
create type public.student_status as enum ('active', 'paused', 'left');
create type public.group_status as enum ('forming', 'active', 'finished');
create type public.enrollment_status as enum ('active', 'left');
create type public.lesson_status as enum ('scheduled', 'held', 'cancelled');
create type public.attendance_status as enum ('present', 'late', 'absent', 'excused');
create type public.pay_type as enum ('fixed_monthly', 'percent_of_revenue', 'per_lesson');
create type public.charge_type as enum ('monthly_fee', 'adjustment');
create type public.payment_method as enum ('cash', 'card', 'transfer');
create type public.expense_category as enum
  ('rent', 'utilities', 'marketing', 'supplies', 'other');
create type public.payout_status as enum ('draft', 'paid');
create type public.message_channel as enum ('telegram', 'sms');
create type public.message_type as enum
  ('payment_due', 'payment_overdue', 'lesson_reminder', 'custom');
create type public.message_status as enum ('queued', 'sent', 'failed', 'skipped');

-- ──────────────────────────── Helpers ────────────────────────────

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 22 random letters and digits for the Telegram deep link (?start=<code>).
create function public.generate_link_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  code text := '';
  byte int;
begin
  while length(code) < 22 loop
    byte := get_byte(extensions.gen_random_bytes(1), 0);
    -- 248 = 4 × 62: reject the tail so every character is equally likely.
    if byte < 248 then
      code := code || substr(alphabet, 1 + byte % 62, 1);
    end if;
  end loop;
  return code;
end;
$$;

-- ─────────────────────── People and access ───────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (btrim(full_name) <> ''),
  role public.user_role not null default 'manager',
  language public.app_language not null default 'uz',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.centre_settings (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one row can exist.
  singleton boolean not null default true unique check (singleton),
  centre_name text not null check (btrim(centre_name) <> ''),
  billing_day smallint not null default 1 check (billing_day between 1 and 28),
  due_day smallint not null default 5 check (due_day between 1 and 28),
  reminders_enabled boolean not null default true,
  lesson_reminder_hours smallint not null default 3 check (lesson_reminder_hours between 1 and 48),
  quiet_from time not null default '21:00',
  quiet_to time not null default '09:00',
  telegram_bot_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.centre_settings (centre_name) values ('Edu CRM');

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  type public.message_type not null,
  channel public.message_channel not null,
  language public.app_language not null,
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, channel, language)
);

-- ──────────────────────────── Teachers ───────────────────────────

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (btrim(full_name) <> ''),
  phone text not null check (phone ~ '^\+998\d{9}$'),
  subjects text[] not null default '{}',
  hired_on date,
  is_active boolean not null default true,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Owner only. The rate in effect on the 1st of a month pays that month.
create table public.teacher_pay_rates (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id),
  pay_type public.pay_type not null,
  amount bigint,            -- fixed monthly or per lesson, soʻm
  percent numeric(5, 2),    -- share of collected revenue
  effective_from date not null,
  created_at timestamptz not null default now(),
  unique (teacher_id, effective_from),
  constraint teacher_pay_rates_shape check (
    (pay_type in ('fixed_monthly', 'per_lesson')
      and amount is not null and amount > 0 and percent is null)
    or (pay_type = 'percent_of_revenue'
      and percent is not null and percent between 1 and 100 and amount is null)
  )
);

-- ─────────────────────── Students and groups ─────────────────────

create table public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (btrim(full_name) <> ''),
  phone text not null check (phone ~ '^\+998\d{9}$'),
  parent_name text,
  parent_phone text check (parent_phone ~ '^\+998\d{9}$'),
  birth_date date,
  language public.app_language not null default 'uz',
  telegram_chat_id bigint,
  telegram_link_code text not null unique default public.generate_link_code()
    check (telegram_link_code ~ '^[A-Za-z0-9]{22}$'),
  status public.student_status not null default 'active',
  lead_id uuid,             -- → leads, added below (the two tables point at each other)
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  subject text not null check (btrim(subject) <> ''),
  level text,
  teacher_id uuid not null references public.teachers (id),
  monthly_fee bigint not null check (monthly_fee >= 0),
  -- 1 = Monday … 7 = Sunday
  days smallint[] not null
    check (cardinality(days) between 1 and 7 and days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  start_time time not null,
  duration_min integer not null default 90 check (duration_min between 15 and 480),
  room text,
  capacity integer check (capacity > 0),
  start_date date not null,
  end_date date,
  status public.group_status not null default 'forming',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  student_id uuid not null references public.students (id),
  joined_on date not null,
  left_on date,
  status public.enrollment_status not null default 'active',
  discount_kind text check (discount_kind in ('percent', 'amount')),
  discount_value bigint,    -- whole percent, or soʻm
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (left_on is null or left_on >= joined_on),
  check ((status = 'left') = (left_on is not null)),
  constraint enrollments_discount_shape check (
    (discount_kind is null and discount_value is null)
    or (discount_kind = 'percent' and discount_value between 1 and 100)
    or (discount_kind = 'amount' and discount_value > 0)
  )
);

-- A student is in a group at most once at a time; re-joining later is a new row.
create unique index enrollments_one_active
  on public.enrollments (group_id, student_id) where status = 'active';

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  -- Whoever taught it: the group's teacher or a substitute for this lesson.
  teacher_id uuid not null references public.teachers (id),
  lesson_date date not null,
  start_time time not null,
  status public.lesson_status not null default 'scheduled',
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, lesson_date, start_time),
  check (status <> 'cancelled' or btrim(coalesce(cancel_reason, '')) <> '')
);

create table public.attendance (
  id uuid not null unique default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.students (id),
  status public.attendance_status not null,
  note text,
  marked_by uuid references public.profiles (id),
  marked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (lesson_id, student_id)
);

-- ───────────────────────────── Leads ─────────────────────────────

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (btrim(full_name) <> ''),
  phone text not null check (phone ~ '^\+998\d{9}$'),
  source public.lead_source not null,
  subject_interest text,
  preferred_time text,
  status public.lead_status not null default 'new',
  lost_reason text,
  trial_group_id uuid references public.groups (id),
  trial_date date,
  next_contact_at timestamptz,
  assigned_to uuid references public.profiles (id),
  notes text,
  converted_student_id uuid references public.students (id),
  created_by uuid references public.profiles (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'lost' or btrim(coalesce(lost_reason, '')) <> '')
);

alter table public.students
  add constraint students_lead_id_fkey foreign key (lead_id) references public.leads (id);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  kind text not null check (kind in ('note', 'call', 'status_change')),
  body text,
  from_status public.lead_status,
  to_status public.lead_status,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (kind <> 'status_change' or to_status is not null)
);

-- ──────────────────────────── Finance ────────────────────────────

-- The ledger's debit side. Rows are never changed: a correction is a new
-- adjustment row (negative amount = credit).
create table public.charges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id),
  enrollment_id uuid references public.enrollments (id),
  group_id uuid references public.groups (id),
  billing_month date not null check (extract(day from billing_month) = 1),
  type public.charge_type not null,
  base_amount bigint not null default 0,
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  amount bigint not null,
  is_prorated boolean not null default false,
  lessons_counted integer check (lessons_counted >= 0),
  lessons_in_month integer check (lessons_in_month >= 0),
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (type <> 'monthly_fee' or (enrollment_id is not null and group_id is not null and amount >= 0)),
  check (type <> 'adjustment' or btrim(coalesce(note, '')) <> '')
);

-- One monthly fee per enrolment per month: generating a month twice adds nothing.
create unique index charges_one_monthly_fee
  on public.charges (enrollment_id, billing_month) where type = 'monthly_fee';

-- The ledger's credit side. Only the void columns ever change.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id),
  group_id uuid not null references public.groups (id),
  amount bigint not null check (amount > 0),
  method public.payment_method not null,
  paid_at timestamptz not null default now(),
  receipt_no bigint generated always as identity unique,
  note text,
  received_by uuid references public.profiles (id),
  voided_at timestamptz,
  void_reason text,
  voided_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint payments_void_shape check (
    (voided_at is null and void_reason is null and voided_by is null)
    or (voided_at is not null and btrim(coalesce(void_reason, '')) <> '')
  )
);

-- Owner only.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category public.expense_category not null,
  amount bigint not null check (amount > 0),
  spent_on date not null,
  note text,
  created_by uuid references public.profiles (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Owner only.
create table public.teacher_payouts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id),
  month date not null check (extract(day from month) = 1),
  pay_type public.pay_type not null,
  basis bigint not null default 0 check (basis >= 0),   -- lessons taught, or soʻm collected
  rate numeric(14, 2) not null check (rate >= 0),       -- soʻm, or percent
  calculated bigint not null default 0 check (calculated >= 0),
  bonus bigint not null default 0 check (bonus >= 0),
  deduction bigint not null default 0 check (deduction >= 0),
  final_amount bigint not null,
  breakdown jsonb not null default '[]'::jsonb,         -- per group
  status public.payout_status not null default 'draft',
  paid_at timestamptz,
  paid_by uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, month),
  check (final_amount = calculated + bonus - deduction),
  check ((status = 'paid') = (paid_at is not null))
);

-- ───────────────────────── Notifications ─────────────────────────

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id),
  channel public.message_channel not null,
  type public.message_type not null,
  recipient text not null,
  body text not null,
  status public.message_status not null default 'queued',
  error text,
  dedupe_key text unique,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ──────────────────────────── Indexes ────────────────────────────

create index leads_status_idx on public.leads (status);
create index leads_phone_idx on public.leads (phone);
create index leads_next_contact_idx on public.leads (next_contact_at) where next_contact_at is not null;
create index leads_assigned_to_idx on public.leads (assigned_to);
create index leads_trial_idx on public.leads (trial_group_id, trial_date) where trial_group_id is not null;
create index leads_converted_student_idx on public.leads (converted_student_id) where converted_student_id is not null;
create index lead_activities_lead_idx on public.lead_activities (lead_id, created_at);
create index students_phone_idx on public.students (phone);
create index students_parent_phone_idx on public.students (parent_phone) where parent_phone is not null;
create index students_status_idx on public.students (status);
create index students_telegram_chat_idx on public.students (telegram_chat_id) where telegram_chat_id is not null;
create index students_lead_idx on public.students (lead_id) where lead_id is not null;
create index groups_teacher_idx on public.groups (teacher_id);
create index groups_status_idx on public.groups (status);
create index enrollments_student_idx on public.enrollments (student_id);
create index enrollments_group_idx on public.enrollments (group_id);
create index lessons_date_idx on public.lessons (lesson_date);
create index lessons_teacher_idx on public.lessons (teacher_id, lesson_date);
create index attendance_student_idx on public.attendance (student_id);
create index charges_student_idx on public.charges (student_id, billing_month);
create index charges_month_idx on public.charges (billing_month);
create index charges_group_idx on public.charges (group_id);
create index payments_student_idx on public.payments (student_id);
create index payments_group_idx on public.payments (group_id, paid_at);
create index payments_paid_at_idx on public.payments (paid_at);
create index expenses_spent_on_idx on public.expenses (spent_on);
create index teacher_payouts_month_idx on public.teacher_payouts (month);
create index messages_student_idx on public.messages (student_id, created_at);
create index messages_status_idx on public.messages (status) where status = 'queued';

-- ─────────────────────── updated_at triggers ─────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'centre_settings', 'message_templates', 'teachers', 'students', 'groups',
    'enrollments', 'lessons', 'leads', 'expenses', 'teacher_payouts'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- ───────────────────────────── View ──────────────────────────────

-- A balance is never stored: it is always payments minus charges.
-- security_invoker: the caller's row level security applies to the tables below.
create view public.student_balances
with (security_invoker = true) as
with paid as (
  select student_id, sum(amount) as paid
  from public.payments
  where voided_at is null
  group by student_id
),
charged as (
  select
    student_id,
    sum(amount) as charged,
    coalesce(sum(-amount) filter (where amount < 0), 0) as credits
  from public.charges
  group by student_id
),
-- Money in covers the oldest fees first.
running as (
  select
    student_id,
    billing_month,
    sum(amount) over (
      partition by student_id order by billing_month, created_at, id
    ) as fees_so_far
  from public.charges
  where amount > 0
)
select
  s.id as student_id,
  coalesce(c.charged, 0)::bigint as charged,
  coalesce(p.paid, 0)::bigint as paid,
  (coalesce(p.paid, 0) - coalesce(c.charged, 0))::bigint as balance,
  (
    select min(r.billing_month)
    from running r
    where r.student_id = s.id
      and r.fees_so_far > coalesce(p.paid, 0) + coalesce(c.credits, 0)
  ) as oldest_unpaid_month
from public.students s
left join paid p on p.student_id = s.id
left join charged c on c.student_id = s.id;
