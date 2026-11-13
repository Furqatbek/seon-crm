-- Demo data for the DEV project only. Load it once into an empty database:
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
--
-- Logins (both use the same demo password, "EduCrm-demo-2026" unless you set
-- another one for this load: PGOPTIONS="-c seed.password=…" psql …):
--   owner@demo.educrm.uz    — owner
--   manager@demo.educrm.uz  — manager
--
-- Everything is dated relative to today, so the current month always has
-- lessons to mark, fees that are due and a few debtors. The data is
-- deterministic: loading it twice into two databases gives the same rows.
-- It refuses to run when the database already has students or leads.

begin;

do $$
begin
  if exists (select 1 from public.students) or exists (select 1 from public.leads) then
    raise exception 'seed.sql: this database already has data. It only loads into an empty one.';
  end if;
end;
$$;

-- ───────────────────────────── Helpers ─────────────────────────────

create function pg_temp.uid(kind int, n int) returns uuid
language sql immutable as $$
  select format('%s-0000-4000-8000-%s', lpad(kind::text, 8, '0'), lpad(n::text, 12, '0'))::uuid;
$$;

-- Stable pseudo-random number in 0 … 99 from any text.
create function pg_temp.pct(seed text) returns int
language sql immutable as $$
  select abs(hashtext(seed)) % 100;
$$;

-- Nearest 1,000 soʻm, half up (numerator / denominator, whole soʻm in).
create function pg_temp.round_1000(numerator bigint, denominator bigint default 1) returns bigint
language sql immutable as $$
  select ((numerator * 2 + denominator * 1000) / (denominator * 2000)) * 1000;
$$;

create function pg_temp.tashkent(d date, t time) returns timestamptz
language sql immutable as $$
  select (d + t) at time zone 'Asia/Tashkent';
$$;

create temp table seed_cfg on commit drop as
select
  today,
  m0,                                           -- 1st of the current month
  (m0 - interval '1 month')::date as m1,        -- last month
  (m0 - interval '2 months')::date as m2,       -- two months ago
  pg_temp.uid(1, 1) as owner_id,
  pg_temp.uid(1, 2) as manager_id,
  coalesce(nullif(current_setting('seed.password', true), ''), 'EduCrm-demo-2026') as password
from (
  select
    (now() at time zone 'Asia/Tashkent')::date as today,
    date_trunc('month', now() at time zone 'Asia/Tashkent')::date as m0
) d;

-- ───────────────────────────── Logins ──────────────────────────────
-- The on_auth_user_created trigger creates the two profiles from this metadata.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt(c.password, extensions.gen_salt('bf')), now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', u.role),
  jsonb_build_object('full_name', u.full_name, 'language', u.language),
  now(), now(), '', '', '', ''
from seed_cfg c,
  (values
    (pg_temp.uid(1, 1), 'owner@demo.educrm.uz', 'owner', 'Jasur Karimov', 'uz'),
    (pg_temp.uid(1, 2), 'manager@demo.educrm.uz', 'manager', 'Madina Yoʻldosheva', 'ru')
  ) as u (id, email, role, full_name, language);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.id in (pg_temp.uid(1, 1), pg_temp.uid(1, 2));

-- The bot name is a placeholder so the Telegram link and QR code have something
-- to show; Settings → Notifications replaces it with the real bot.
update public.centre_settings
set centre_name = 'Ziyo oʻquv markazi', telegram_bot_username = 'ziyo_markaz_demo_bot';

-- ──────────────────────────── Teachers ─────────────────────────────

insert into public.teachers (id, full_name, phone, subjects, hired_on, notes)
select pg_temp.uid(2, t.n), t.full_name, t.phone, t.subjects, (c.m0 - t.months * interval '1 month')::date, t.notes
from seed_cfg c,
  (values
    (1, 'Dilshod Rahimov', '+998901112201', array['Ingliz tili'], 30, 'CELTA sertifikati bor'),
    (2, 'Nodira Saidova', '+998931112202', array['Ingliz tili', 'IELTS'], 22, 'IELTS 8.0'),
    (3, 'Rustam Qodirov', '+998941112203', array['Matematika'], 18, null),
    (4, 'Gulnora Tosheva', '+998971112204', array['Rus tili'], 26, null),
    (5, 'Sardor Mirzayev', '+998991112205', array['Dasturlash'], 9, 'Faqat kechki guruhlar'),
    (6, 'Zilola Hamidova', '+998911112206', array['Matematika', 'Fizika'], 12, null)
  ) as t (n, full_name, phone, subjects, months, notes);

-- All three pay models, two teachers each. Two of them have a rate history;
-- the rise for teacher 6 starts mid-month, so it first pays next month.
insert into public.teacher_pay_rates (teacher_id, pay_type, amount, percent, effective_from)
select pg_temp.uid(2, r.n), r.pay_type::public.pay_type, r.amount, r.percent,
  (c.m0 - r.months_ago * interval '1 month' + r.day_offset * interval '1 day')::date
from seed_cfg c,
  (values
    (1, 'fixed_monthly', 6000000, null, 8, 0),
    (2, 'percent_of_revenue', null, 35, 8, 0),
    (2, 'percent_of_revenue', null, 40, 1, 0),
    (3, 'per_lesson', 120000, null, 8, 0),
    (4, 'fixed_monthly', 5000000, null, 8, 0),
    (5, 'percent_of_revenue', null, 45, 8, 0),
    (6, 'per_lesson', 90000, null, 8, 0),
    (6, 'per_lesson', 100000, null, 1, 14)
  ) as r (n, pay_type, amount, percent, months_ago, day_offset);

-- ───────────────────────────── Groups ──────────────────────────────
-- Nine running groups and one still forming.

insert into public.groups (
  id, name, subject, level, teacher_id, monthly_fee, days, start_time, duration_min,
  room, capacity, start_date, status
)
select
  pg_temp.uid(3, g.n), g.name, g.subject, g.level, pg_temp.uid(2, g.teacher), g.fee,
  g.days::smallint[], g.start_time::time, g.duration, g.room, 12,
  case when g.status = 'forming' then c.today + 14 else (c.m0 - interval '4 months')::date end,
  g.status::public.group_status
from seed_cfg c,
  (values
    (1, 'English A2', 'Ingliz tili', 'A2', 1, 500000, '{1,3,5}', '15:00', 90, '1-xona', 'active'),
    (2, 'English B1', 'Ingliz tili', 'B1', 1, 600000, '{2,4,6}', '16:30', 90, '1-xona', 'active'),
    (3, 'IELTS 6.5', 'IELTS', 'B2', 2, 900000, '{1,3,5}', '18:00', 120, '2-xona', 'active'),
    (4, 'English Kids', 'Ingliz tili', 'A1', 2, 400000, '{2,4,6}', '10:00', 60, '2-xona', 'active'),
    (5, 'Matematika 7-sinf', 'Matematika', '7-sinf', 3, 450000, '{1,3,5}', '14:00', 90, '3-xona', 'active'),
    (6, 'Matematika 9-sinf', 'Matematika', '9-sinf', 6, 500000, '{2,4,6}', '15:30', 90, '3-xona', 'active'),
    (7, 'Rus tili boshlangʻich', 'Rus tili', 'A1', 4, 450000, '{1,3,5}', '16:30', 90, '4-xona', 'active'),
    (8, 'Rus tili davomi', 'Rus tili', 'A2', 4, 500000, '{2,4,6}', '18:00', 90, '4-xona', 'active'),
    (9, 'Python dasturlash', 'Dasturlash', 'Boshlangʻich', 5, 800000, '{2,4}', '18:30', 120, '5-xona', 'active'),
    (10, 'Fizika abituriyent', 'Fizika', '11-sinf', 6, 700000, '{1,3,5}', '17:00', 90, '3-xona', 'forming')
  ) as g (n, name, subject, level, teacher, fee, days, start_time, duration, room, status);

-- ──────────────────────────── Students ─────────────────────────────
-- 80 students: 74 active, 3 paused (75–77), 3 left (78–80).

create temp table seed_names on commit drop as
select
  array['Aziz', 'Bekzod', 'Jasur', 'Sardor', 'Timur', 'Otabek', 'Sherzod', 'Ulugʻbek', 'Farrux',
        'Doniyor', 'Akmal', 'Shoxrux', 'Javohir', 'Islom', 'Abdulloh', 'Sanjar', 'Murod', 'Bobur',
        'Eldor', 'Kamron'] as male,
  array['Aziza', 'Dilnoza', 'Madina', 'Nigora', 'Shahzoda', 'Zarina', 'Malika', 'Sevara', 'Gulnoza',
        'Kamola', 'Nodira', 'Feruza', 'Laylo', 'Mohira', 'Diyora', 'Sabina', 'Munisa', 'Iroda',
        'Zilola', 'Barno'] as female,
  array['Karim', 'Rashid', 'Yusup', 'Sulton', 'Toshmat', 'Ergash', 'Nazar', 'Xolmat', 'Ismoil',
        'Abdulla', 'Hasan', 'Salim', 'Qodir', 'Usmon', 'Hamid', 'Sodiq', 'Tursun', 'Normat',
        'Olim', 'Rahim'] as family,
  array['90', '91', '93', '94', '97', '99'] as operators;

insert into public.students (
  id, full_name, phone, parent_name, parent_phone, birth_date, language,
  telegram_chat_id, status, notes, created_at
)
select
  pg_temp.uid(4, i),
  case when i % 2 = 1 then n.male[1 + ((i - 1) / 2) % 20] else n.female[1 + ((i - 1) / 2) % 20] end
    || ' ' || n.family[1 + ((i - 1) * 7 + ((i - 1) / 40) * 5 + 3) % 20]
    || case when i % 2 = 1 then 'ov' else 'ova' end,
  '+998' || n.operators[1 + i % 6] || lpad((1000000 + (i * 86243) % 8999999)::text, 7, '0'),
  case when i % 5 <> 0 then
    case when i % 3 = 0 then n.female[1 + (i * 3) % 20] else n.male[1 + (i * 3) % 20] end
      || ' ' || n.family[1 + ((i - 1) * 7 + ((i - 1) / 40) * 5 + 3) % 20]
      || case when i % 3 = 0 then 'ova' else 'ov' end
  end,
  case when i % 5 <> 0 then
    '+998' || n.operators[1 + (i + 2) % 6] || lpad((1000000 + (i * 51787) % 8999999)::text, 7, '0')
  end,
  date '2008-01-15' + (i * 97) % 3650,
  (case when i % 13 = 0 then 'en' when i % 4 = 0 then 'ru' else 'uz' end)::public.app_language,
  case when i % 5 in (1, 2) then 500000000 + i * 7919 end,
  (case when i >= 78 then 'left' when i >= 75 then 'paused' else 'active' end)::public.student_status,
  case when i = 75 then 'Yozgi taʼtilga ketgan, keyingi oy qaytadi'
       when i = 78 then 'Boshqa shaharga koʻchdi' end,
  pg_temp.tashkent((c.m0 - interval '3 months')::date - 10 + i % 20, '11:00')
from seed_cfg c, seed_names n, generate_series(1, 80) as i;

-- ─────────────────────────── Enrolments ────────────────────────────
-- Everyone has one group; every 8th student has a second one. Eight students
-- joined in the middle of last month and four in the middle of this month, so
-- their first fee is prorated. Some have a percent or a fixed discount.

insert into public.enrollments (
  id, group_id, student_id, joined_on, left_on, status, discount_kind, discount_value, note
)
select
  pg_temp.uid(5, i),
  pg_temp.uid(3, 1 + (i - 1) % 9),
  pg_temp.uid(4, i),
  case
    when i % 10 = 3 then c.m1 + 12
    when i % 10 = 7 and i < 40 then least(c.m0 + 6, c.today)
    else (c.m0 - interval '3 months')::date - 10 + i % 20
  end,
  case when i >= 78 then c.m1 + 20 end,
  (case when i >= 78 then 'left' else 'active' end)::public.enrollment_status,
  case when i % 9 = 4 then 'percent' when i % 17 = 5 then 'amount' end,
  case when i % 9 = 4 then (array[10, 15, 20])[1 + i % 3] when i % 17 = 5 then 50000 end,
  case when i % 9 = 4 then 'Aka-uka chegirmasi' when i % 17 = 5 then 'Doimiy oʻquvchi' end
from seed_cfg c, generate_series(1, 80) as i;

insert into public.enrollments (id, group_id, student_id, joined_on)
select
  pg_temp.uid(5, 100 + i),
  pg_temp.uid(3, 1 + (i + 3) % 9),
  pg_temp.uid(4, i),
  (c.m0 - interval '3 months')::date - 5 + i % 10
from seed_cfg c, generate_series(8, 72, 8) as i;

-- ───────────────────────────── Lessons ─────────────────────────────
-- From the start of two months ago to 30 days ahead. Past lessons were held,
-- about one in thirty was cancelled; today's and later ones are scheduled.

insert into public.lessons (group_id, teacher_id, lesson_date, start_time, status, cancel_reason)
select
  g.id, g.teacher_id, d::date, g.start_time,
  (case
    when d::date >= c.today then 'scheduled'
    when pg_temp.pct(g.id::text || d::date::text) < 3 then 'cancelled'
    else 'held'
  end)::public.lesson_status,
  case when d::date < c.today and pg_temp.pct(g.id::text || d::date::text) < 3 then
    (array['Oʻqituvchi kasal', 'Bayram kuni', 'Elektr yoʻq edi'])[1 + extract(day from d)::int % 3]
  end
from seed_cfg c
join public.groups g on g.status = 'active'
cross join generate_series(c.m2::timestamp, (c.today + 30)::timestamp, interval '1 day') as d
where extract(isodow from d)::smallint = any (g.days)
-- Creating a group already generated this month's lessons as scheduled; the
-- demo history replaces their status.
on conflict (group_id, lesson_date, start_time) do update
  set status = excluded.status, cancel_reason = excluded.cancel_reason;

-- Zilola Hamidova stood in for two of Rustam Qodirov's lessons last month.
update public.lessons l
set teacher_id = pg_temp.uid(2, 6)
from seed_cfg c
where l.id in (
  select id from public.lessons
  where group_id = pg_temp.uid(3, 5) and status = 'held' and lesson_date >= c.m1 and lesson_date < c.m0
  order by lesson_date
  limit 2
);

-- ─────────────────────────── Attendance ────────────────────────────

insert into public.attendance (lesson_id, student_id, status, note, marked_by, marked_at)
select
  l.id, e.student_id,
  (case
    when p < 84 then 'present' when p < 90 then 'late' when p < 97 then 'absent' else 'excused'
  end)::public.attendance_status,
  case when p >= 97 then 'Kasal, ota-onasi xabar berdi' end,
  c.manager_id,
  pg_temp.tashkent(l.lesson_date, l.start_time) + interval '95 minutes'
from seed_cfg c
join public.lessons l on l.status = 'held'
join public.enrollments e
  on e.group_id = l.group_id
  and e.joined_on <= l.lesson_date
  and (e.left_on is null or e.left_on >= l.lesson_date)
cross join lateral (select pg_temp.pct(l.id::text || e.student_id::text) as p) h;

-- ───────────────────────────── Charges ─────────────────────────────
-- One monthly fee per enrolment for each of the three months. Paused students
-- are not billed this month. Joining after the month's first lesson prorates
-- the first fee by lessons left (cancelled lessons are not counted).

insert into public.charges (
  student_id, enrollment_id, group_id, billing_month, type, base_amount, discount_amount,
  amount, is_prorated, lessons_counted, lessons_in_month, created_by, created_at
)
select
  e.student_id, e.id, e.group_id, m.month, 'monthly_fee', g.monthly_fee, f.discount,
  case when p.prorated
    then pg_temp.round_1000((g.monthly_fee - f.discount) * p.counted, p.total)
    else g.monthly_fee - f.discount end,
  p.prorated,
  case when p.prorated then p.counted end,
  case when p.prorated then p.total end,
  case when p.prorated then c.manager_id else c.owner_id end,
  case when p.prorated then pg_temp.tashkent(e.joined_on, '12:00') else pg_temp.tashkent(m.month, '00:10') end
from seed_cfg c
cross join lateral (values (c.m2), (c.m1), (c.m0)) as m (month)
join public.enrollments e
  on e.joined_on < (m.month + interval '1 month')::date
  and (e.left_on is null or e.left_on >= m.month)
join public.groups g on g.id = e.group_id
join public.students s on s.id = e.student_id
cross join lateral (
  select least(g.monthly_fee, case e.discount_kind
    when 'percent' then pg_temp.round_1000(g.monthly_fee * e.discount_value, 100)
    when 'amount' then e.discount_value
    else 0 end) as discount
) f
cross join lateral (
  select
    count(*) as total,
    count(*) filter (where l.lesson_date >= e.joined_on) as counted,
    e.joined_on > min(l.lesson_date) as prorated
  from public.lessons l
  where l.group_id = e.group_id
    and l.status <> 'cancelled'
    and l.lesson_date >= m.month
    and l.lesson_date < (m.month + interval '1 month')::date
) p
where p.total > 0
  and (not p.prorated or p.counted > 0)
  and not (s.status = 'paused' and m.month = c.m0);

-- Credits: a negative adjustment, always with a note.
insert into public.charges (student_id, enrollment_id, group_id, billing_month, type, amount, note, created_by, created_at)
select
  e.student_id, e.id, e.group_id, x.month, 'adjustment', x.amount, x.note, x.by,
  pg_temp.tashkent(x.month + 21, '15:30')
from seed_cfg c
cross join lateral (values
  (78, c.m1, -150000, 'Guruhdan chiqdi, qolgan darslar uchun qaytarildi', c.manager_id),
  (12, c.m1, -50000, 'Ikki dars oʻqituvchi sababli oʻtmadi', c.owner_id),
  (31, c.m2, -100000, 'Kasallik sababli bir hafta qatnashmadi', c.manager_id)
) as x (student_no, month, amount, note, by)
join public.enrollments e on e.id = pg_temp.uid(5, x.student_no);

-- ───────────────────────────── Payments ────────────────────────────
-- Two months ago almost everything was paid, last month most of it, this
-- month about three quarters: that leaves debtors of different ages. Receipt
-- numbers follow the payment date.

insert into public.payments (student_id, group_id, amount, method, paid_at, note, received_by, created_at)
select student_id, group_id, amount, method, paid_at, note, received_by, paid_at
from (
  select
    ch.student_id, ch.group_id,
    case when pay.part = 'full' then ch.amount else pg_temp.round_1000(ch.amount, 2) end as amount,
    (case when h.m < 60 then 'cash' when h.m < 85 then 'card' else 'transfer' end)::public.payment_method as method,
    -- Never before the charge it pays, never in the future.
    least(
      greatest(
        pg_temp.tashkent(greatest(ch.billing_month, ch.created_at::date) + h.d % 9, '09:00')
          + (h.m * 5) * interval '1 minute',
        ch.created_at + interval '30 minutes'
      ),
      now() - interval '1 hour'
    ) as paid_at,
    case when pay.part = 'half' then 'Qolganini keyingi hafta toʻlaydi' end as note,
    case when h.d < 80 then c.manager_id else c.owner_id end as received_by
  from seed_cfg c
  join public.charges ch on ch.type = 'monthly_fee' and ch.amount > 0
  cross join lateral (
    select
      pg_temp.pct('pay' || ch.enrollment_id::text || ch.billing_month::text) as p,
      pg_temp.pct('method' || ch.enrollment_id::text || ch.billing_month::text) as m,
      pg_temp.pct('day' || ch.enrollment_id::text || ch.billing_month::text) as d
  ) h
  cross join lateral (
    select case
      when ch.billing_month = c.m2 then case when h.p < 95 then 'full' end
      when ch.billing_month = c.m1 then case when h.p < 86 then 'full' when h.p < 92 then 'half' end
      else case when h.p < 74 then 'full' when h.p < 82 then 'half' end
    end as part
  ) pay
  where pay.part is not null

  union all

  -- Two payments typed in twice by mistake; the owner voids them below.
  select
    e.student_id, e.group_id, g.monthly_fee, 'cash'::public.payment_method,
    pg_temp.tashkent(c.m1 + 4, '17:45'), null, c.manager_id
  from seed_cfg c
  join public.enrollments e on e.id in (pg_temp.uid(5, 5), pg_temp.uid(5, 22))
  join public.groups g on g.id = e.group_id
) p
order by paid_at, student_id;

update public.payments p
set voided_at = p.paid_at + interval '1 day',
    void_reason = 'Ikki marta kiritilgan',
    voided_by = c.owner_id
from seed_cfg c
where p.paid_at = pg_temp.tashkent(c.m1 + 4, '17:45');

-- ───────────────────────────── Expenses ────────────────────────────

insert into public.expenses (category, amount, spent_on, note, created_by)
select x.category::public.expense_category, x.amount + x.step * k, (m.month + x.day_offset)::date, x.note, c.owner_id
from seed_cfg c
cross join lateral (values (c.m2, 0), (c.m1, 1), (c.m0, 2)) as m (month, k)
cross join (values
  ('rent', 12000000, 0, 1, 'Ijara'),
  ('marketing', 2000000, 250000, 4, 'Instagram reklamasi'),
  ('utilities', 1450000, 120000, 9, 'Elektr, suv, internet'),
  ('supplies', 650000, 40000, 11, 'Daftar, marker, printer boʻyogʻi'),
  ('marketing', 1200000, 0, 17, 'Banner va flayerlar'),
  ('other', 400000, 30000, 19, 'Tozalash xizmati')
) as x (category, amount, step, day_offset, note)
where (m.month + x.day_offset)::date <= c.today;

-- ────────────────────────────── Leads ──────────────────────────────
-- 40 leads, eight in every stage. The eight won leads are the students
-- 4, 9, … 39, linked both ways.

insert into public.leads (
  id, full_name, phone, source, subject_interest, preferred_time, status, lost_reason,
  trial_group_id, trial_date, next_contact_at, assigned_to, notes, converted_student_id,
  created_by, created_at, updated_at
)
select
  pg_temp.uid(6, i),
  coalesce(s.full_name,
    case when i % 2 = 0 then n.male[1 + (i - 1) % 20] else n.female[1 + (i - 1) % 20] end
      || ' ' || n.family[1 + ((i - 1) * 3 + ((i - 1) / 20) * 7 + 5) % 20]
      || case when i % 2 = 0 then 'ov' else 'ova' end),
  coalesce(s.phone, '+998' || n.operators[1 + (i + 1) % 6] || lpad((2000000 + (i * 73459) % 7999999)::text, 7, '0')),
  (array['instagram', 'telegram', 'phone_call', 'walk_in', 'referral', 'website', 'other'])[1 + i % 7]::public.lead_source,
  (array['Ingliz tili', 'IELTS', 'Matematika', 'Rus tili', 'Dasturlash'])[1 + i % 5],
  (array['Ertalab', 'Tushdan keyin', 'Kechqurun', 'Dam olish kunlari'])[1 + i % 4],
  st.status,
  case when st.status = 'lost' then
    (array['price', 'schedule', 'another_centre', 'no_answer', 'Boshqa shaharga koʻchib ketdi'])[1 + (i / 5) % 5]
  end,
  case when st.status = 'trial' then pg_temp.uid(3, 1 + i % 9) end,
  case when st.status = 'trial' then c.today + (i / 5) % 6 - 1 end,
  case when st.status in ('new', 'contacted', 'trial')
    then pg_temp.tashkent(c.today + i % 7 - 3, '10:00') end,
  case when i % 3 = 0 then c.owner_id else c.manager_id end,
  case when i % 4 = 1 then 'Narxini soʻradi, oʻylab koʻradi'
       when i % 4 = 2 then 'Akasi bizda oʻqiydi' end,
  s.id,
  c.manager_id,
  now() - (i * 2 + 1) * interval '1 day',
  now() - (i % 9) * interval '1 day'
from seed_cfg c
cross join seed_names n
cross join generate_series(1, 40) as i
cross join lateral (
  select (array['new', 'contacted', 'trial', 'won', 'lost'])[1 + (i - 1) % 5]::public.lead_status as status
) st
left join public.students s on st.status = 'won' and s.id = pg_temp.uid(4, i);

update public.students s
set lead_id = l.id
from public.leads l
where l.converted_student_id = s.id;

-- Timeline: a first note for everyone, then a call and the stage changes.
insert into public.lead_activities (lead_id, kind, body, from_status, to_status, created_by, created_at)
select l.id, a.kind, a.body, a.from_status::public.lead_status, a.to_status::public.lead_status,
  coalesce(l.assigned_to, c.manager_id), l.created_at + a.step * interval '6 hours'
from seed_cfg c
join public.leads l on true
cross join lateral (values
  (0, 'note', 'Birinchi murojaat: ' || l.subject_interest || ' boʻyicha soʻradi', null, null, true),
  (1, 'call', 'Qoʻngʻiroq qilindi, dars jadvali tushuntirildi', null, null, l.status <> 'new'),
  (2, 'status_change', null, 'new', 'contacted', l.status <> 'new'),
  (3, 'status_change', null, 'contacted', 'trial', l.status in ('trial', 'won')),
  (4, 'status_change', null, 'trial', 'won', l.status = 'won'),
  (4, 'status_change', l.lost_reason, 'contacted', 'lost', l.status = 'lost')
) as a (step, kind, body, from_status, to_status, applies)
where a.applies;

-- ─────────────────────── Message templates ─────────────────────────
-- Every type × channel × language. SMS texts stay plain Latin with a straight
-- apostrophe where they can (ʻ or Cyrillic make an SMS Unicode: 70 characters
-- per part instead of 160).

insert into public.message_templates (type, channel, language, body)
select t.type::public.message_type, ch.channel::public.message_channel, t.language::public.app_language,
  case when ch.channel = 'telegram' and t.language = 'uz' then replace(t.body, '''', 'ʻ') else t.body end
from (values
  ('payment_due', 'uz', 'Assalomu alaykum! {student} uchun {month} oyi to''lovi: {amount} so''m. Iltimos, {due_date} gacha to''lang. {centre}'),
  ('payment_due', 'ru', 'Здравствуйте! Оплата за {month} для {student}: {amount} сум. Пожалуйста, оплатите до {due_date}. {centre}'),
  ('payment_due', 'en', 'Hello! The {month} fee for {student} is {amount} UZS. Please pay by {due_date}. {centre}'),
  ('payment_overdue', 'uz', 'Assalomu alaykum! {student} uchun {month} oyi to''lovi kechikdi. Qarz: {amount} so''m. Iltimos, to''lovni amalga oshiring. {centre}'),
  ('payment_overdue', 'ru', 'Здравствуйте! Оплата за {month} для {student} просрочена. Долг: {amount} сум. Пожалуйста, оплатите. {centre}'),
  ('payment_overdue', 'en', 'Hello! The {month} fee for {student} is overdue. Amount owed: {amount} UZS. Please pay as soon as you can. {centre}'),
  ('lesson_reminder', 'uz', 'Eslatma: {student}, bugun soat {time} da {group} darsi bor. {centre}'),
  ('lesson_reminder', 'ru', 'Напоминание: {student}, сегодня в {time} занятие в группе {group}. {centre}'),
  ('lesson_reminder', 'en', 'Reminder: {student} has a {group} lesson today at {time}. {centre}'),
  ('custom', 'uz', 'Assalomu alaykum, {student}! {centre}'),
  ('custom', 'ru', 'Здравствуйте, {student}! {centre}'),
  ('custom', 'en', 'Hello, {student}! {centre}')
) as t (type, language, body)
cross join (values ('telegram'), ('sms')) as ch (channel);

commit;
