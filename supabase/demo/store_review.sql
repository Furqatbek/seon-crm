-- Demo accounts for the App Store and Google Play reviewers
-- (docs/MOBILE_RELEASE.md → "Demo logins").
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -v password='a-strong-password' -f supabase/demo/store_review.sql
--
-- Makes, once, and refreshes on every later run:
--   1. A linked student, +998 90 000 01 01, in the group "Demo · TOPIK I":
--      lessons past and coming, attendance, coins, a shop order, one finished
--      game and one finished mock exam.
--   2. An App user, +998 90 000 01 02, with a voucher and a booked open lesson.
-- Both sign in with the phone and the password given above. Run it again
-- before each store submission: it sets the password again, moves the
-- voucher's last day forward and books the next open lesson.
--
-- What it adds to the centre's own data, all named "Demo": one teacher
-- without a pay rate, one group with a fee of 0 soʻm (so no charge, payment
-- or salary comes from it), one student. A game needs 10 active questions,
-- the exam a published exam, the order an active reward, the booking an
-- active open lesson: where the centre has none yet, that part is skipped
-- and said so.

\if :{?password}
\else
  \echo 'Give the password: -v password=...'
  \quit
\endif

begin;

select set_config('demo.password', :'password', true);

do $$
<<store_review>>
declare
  password text := current_setting('demo.password');
  -- Fixed ids, so a second run finds the first one's rows.
  teacher_id constant uuid := 'de300000-0000-4000-8000-000000000001';
  group_id constant uuid := 'de300000-0000-4000-8000-000000000002';
  student_id constant uuid := 'de300000-0000-4000-8000-000000000003';
  enrollment_id constant uuid := 'de300000-0000-4000-8000-000000000004';
  student_user constant uuid := 'de300000-0000-4000-8000-000000000011';
  app_user constant uuid := 'de300000-0000-4000-8000-000000000012';
  match_id constant uuid := 'de300000-0000-4000-8000-000000000021';
  attempt_id constant uuid := 'de300000-0000-4000-8000-000000000022';
  order_id constant uuid := 'de300000-0000-4000-8000-000000000023';
  student_phone constant text := '+998900000101';
  app_phone constant text := '+998900000102';
  today date := (now() at time zone 'Asia/Tashkent')::date;
  owner_id uuid;
  reward record;
  exam record;
  question_ids uuid[];
  slot record;
  session_day date;
  n integer;
begin
  if length(password) < 8 then
    raise exception 'The password must have at least 8 characters';
  end if;
  select p.id into owner_id from public.profiles p where p.role = 'owner' and p.is_active order by p.created_at limit 1;
  if owner_id is null then
    raise exception 'There is no owner yet: set the centre up first';
  end if;

  -- ── The centre's side: a teacher without pay, a free group, a student ──
  insert into public.teachers (id, full_name, phone, subjects)
  values (teacher_id, 'Demo Teacher', '+998900000100', array['Korean'])
  on conflict (id) do nothing;

  -- Monday, Wednesday, Friday at 18:00, from the first of last month. Its
  -- lessons are made by the group's own trigger.
  insert into public.groups (id, name, subject, level, teacher_id, monthly_fee, days, start_time, duration_min, capacity, start_date)
  values (group_id, 'Demo · TOPIK I', 'Korean', 'TOPIK I', teacher_id, 0, array[1, 3, 5]::smallint[], '18:00', 90, 12,
          (date_trunc('month', today) - interval '1 month')::date)
  on conflict (id) do nothing;

  insert into public.students (id, full_name, phone, language)
  values (student_id, 'Demo Student', student_phone, 'en')
  on conflict (id) do nothing;

  insert into public.enrollments (id, group_id, student_id, joined_on)
  values (enrollment_id, group_id, student_id, (date_trunc('month', today) - interval '1 month')::date)
  on conflict (id) do nothing;

  -- The lessons already past were held, and the student came (late once).
  update public.lessons l set status = 'held'
  where l.group_id = store_review.group_id and l.lesson_date < today and l.status = 'scheduled';
  insert into public.attendance (lesson_id, student_id, status, marked_by)
  select l.id, student_id, case when row_number() over (order by l.lesson_date) = 3 then 'late' else 'present' end::public.attendance_status, owner_id
  from public.lessons l
  where l.group_id = store_review.group_id and l.status = 'held'
    and not exists (select 1 from public.attendance a where a.lesson_id = l.id and a.student_id = store_review.student_id);

  -- Coins from the teacher, on top of what attendance gave.
  insert into public.points_ledger (student_id, delta, source, group_id, reason, created_by, dedupe_key)
  values (student_id, 150, 'teacher_award', group_id, 'Demo', owner_id, 'demo:award')
  on conflict (dedupe_key) do nothing;

  -- ── The two accounts, as a sign-up in the app with a confirmed phone ──
  insert into auth.users (instance_id, id, aud, role, phone, phone_confirmed_at, encrypted_password, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', ltrim(u.phone, '+'), now(),
         extensions.crypt(password, extensions.gen_salt('bf')),
         jsonb_build_object('provider', 'phone', 'providers', jsonb_build_array('phone')),
         jsonb_build_object('full_name', u.full_name, 'korean_level', u.level, 'language', 'en'),
         now(), now(), '', '', '', ''
  from (values (student_user, student_phone, 'Demo Student', 'topik1'), (app_user, app_phone, 'Demo Guest', 'topik1')) as u (id, phone, full_name, level)
  on conflict (id) do update set encrypted_password = excluded.encrypted_password, updated_at = now();

  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.id::text, 'phone',
         jsonb_build_object('sub', u.id::text, 'phone', u.phone, 'phone_verified', true), now(), now(), now()
  from auth.users u
  where u.id in (student_user, app_user)
    and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'phone');

  -- The student's phone is the student record's: the account is linked by itself.
  if not exists (select 1 from public.profiles p where p.id = student_user and p.role = 'student' and p.student_id = store_review.student_id) then
    raise exception 'The demo student account did not link to its student record';
  end if;
  if not exists (select 1 from public.profiles p where p.id = app_user and p.role = 'app_user') then
    raise exception 'The demo guest account is not an App user';
  end if;

  -- ── The student's history ──
  -- An order in the shop, waiting at reception, with its coins held.
  select r.id, r.cost into reward from public.rewards r
  where r.is_active and r.archived_at is null and r.cost <= 100
    and not exists (select 1 from public.reward_variants v where v.reward_id = r.id)
  order by r.cost limit 1;
  if reward.id is null then
    raise notice 'No active reward of 100 coins or less without sizes: the demo order was skipped';
  elsif not exists (select 1 from public.redemptions d where d.id = order_id) then
    insert into public.redemptions (id, student_id, reward_id, cost, status, via, requested_by, created_by, request_key)
    values (order_id, student_id, reward.id, reward.cost, 'requested', 'app', 'student', student_user, 'demo:order');
    insert into public.points_ledger (student_id, delta, source, redemption_id, dedupe_key)
    values (student_id, -reward.cost, 'reward_hold', order_id, 'demo:order-hold');
  end if;

  -- A practice game against the computer, finished 7 to 3.
  select array_agg(q.id) into question_ids
  from (select q.id from public.questions q where q.is_active and q.archived_at is null order by q.created_at limit 10) q;
  if coalesce(cardinality(question_ids), 0) < 10 then
    raise notice 'Fewer than 10 active questions: the demo game was skipped';
  elsif not exists (select 1 from public.matches m where m.id = match_id) then
    insert into public.matches (id, kind, subject, level, player_a, group_a, coins_eligible, status, question_ids, current_index,
                                question_started_at, rope, winner, created_at, finished_at)
    select match_id, 'practice', q.subject, coalesce(q.level, 'TOPIK I'), student_user, group_id, false, 'finished', question_ids, 9,
           now() - interval '1 day', 4, 'a', now() - interval '1 day' - interval '3 minutes', now() - interval '1 day'
    from public.questions q where q.id = question_ids[1];
    insert into public.match_answers (match_id, player, question_index, option_id, is_correct, answered_at, ms_taken)
    select match_id, 'a', i - 1,
           case when i in (3, 6, 9) then (select o ->> 'id' from jsonb_array_elements(q.options) o where o ->> 'id' <> q.correct_option_id limit 1)
                else q.correct_option_id end,
           i not in (3, 6, 9), now() - interval '1 day' - (11 - i) * interval '15 seconds', 4000
    from unnest(question_ids) with ordinality as picked (id, i)
    join public.questions q on q.id = picked.id;
  end if;

  -- A finished mock exam: about two thirds right, in each section.
  select e.id into exam from public.exams e where e.status = 'published' order by e.published_at limit 1;
  if exam.id is null then
    raise notice 'No published exam: the demo exam result was skipped';
  elsif not exists (select 1 from public.exam_attempts a where a.id = attempt_id) then
    insert into public.exam_attempts (id, exam_id, profile_id, status, started_at, current_section, section_deadlines, first_attempt, submitted_at,
                                      correct_listening, correct_reading, coins, coins_locked)
    values (attempt_id, exam.id, student_user, 'submitted', now() - interval '2 days' - interval '1 hour', null, '{}'::jsonb, true, now() - interval '2 days', 0, 0, 0, false);
    -- Two answers in three are the right one.
    insert into public.exam_answers (attempt_id, question_id, option_id, answered_at)
    select attempt_id, q.id,
           case when row_number() over (order by s.position, q.position) % 3 = 0
                then (select o ->> 'id' from jsonb_array_elements(q.options) o where o ->> 'id' <> q.correct_option_id limit 1)
                else q.correct_option_id end,
           now() - interval '2 days'
    from public.exam_questions q
    join public.exam_sections s on s.id = q.section_id
    where s.exam_id = exam.id;
    update public.exam_attempts a
    set correct_listening = c.listening, correct_reading = c.reading, coins = c.listening + c.reading
    from (
      select count(*) filter (where s.kind = 'listening' and x.option_id = q.correct_option_id)::integer as listening,
             count(*) filter (where s.kind = 'reading' and x.option_id = q.correct_option_id)::integer as reading
      from public.exam_answers x
      join public.exam_questions q on q.id = x.question_id
      join public.exam_sections s on s.id = q.section_id
      where x.attempt_id = store_review.attempt_id
    ) c
    where a.id = store_review.attempt_id;
    insert into public.points_ledger (student_id, delta, source, dedupe_key)
    select student_id, a.coins, 'exam', 'exam:' || exam.id || ':' || student_id
    from public.exam_attempts a where a.id = store_review.attempt_id and a.coins > 0
    on conflict (dedupe_key) do nothing;
  end if;

  -- ── The App user: a voucher, and a seat at the next open lesson ──
  insert into public.vouchers (code, profile_id, type, value, expires_at)
  values ('KOR-DEM22', app_user, 'percent', 20, now() + interval '60 days')
  on conflict (profile_id) do update set expires_at = excluded.expires_at, status = 'issued'
  where public.vouchers.status <> 'redeemed';

  select s.id, s.weekday, s.start_time into slot
  from public.open_lesson_slots s
  where s.is_active and s.archived_at is null and (s.korean_level is null or s.korean_level = 'topik1')
  order by s.created_at limit 1;
  if slot.id is null then
    raise notice 'No active open lesson for TOPIK I: the demo booking was skipped. Add one in Leads → Open lessons and run this again';
  else
    -- The slot's first day from the day after tomorrow on.
    session_day := today + 2 + ((slot.weekday - extract(isodow from today + 2)::integer + 7) % 7);
    update public.open_lesson_bookings b set status = 'cancelled'
    where b.profile_id = app_user and b.status = 'booked' and b.session_date < today;
    if not exists (select 1 from public.open_lesson_bookings b where b.profile_id = app_user and b.status = 'booked') then
      insert into public.open_lesson_bookings (slot_id, session_date, profile_id, lead_id)
      select slot.id, session_day, app_user, p.lead_id from public.profiles p where p.id = app_user
      on conflict (slot_id, session_date, profile_id) do update set status = 'booked';
    end if;
  end if;

  select count(*) into n from public.lessons l where l.group_id = store_review.group_id and l.lesson_date >= today;
  raise notice 'Demo accounts are ready: student % and App user %; % lessons to come', student_phone, app_phone, n;
end store_review;
$$;

commit;
