-- Student app groundwork, step 2 of 2. docs/STUDENT_APP_SPEC.md → "Users, roles
-- and access", "Account lifecycle", "Rules → Coins", "Data model" (CHANGED and
-- APP BASICS).
--
-- 1. The roles student, app_user and kiosk. A profile is made for a phone
--    sign-up and becomes active when the SMS code is confirmed.
-- 2. link_or_lead(): a confirmed app account is linked to its student by
--    phone, or becomes a lead with source "mobile_app". It runs again when
--    staff save a student's or a lead's phone, or convert a lead.
-- 3. New columns and the tables notifications, device_tokens, visits,
--    reward_variants and locked_coins.
-- 4. Row level security for the three roles: a student reads their own
--    records, an app user their own account, a kiosk nothing.
-- 5. student_home(), app_leaderboard(), delete_my_account() and the small
--    functions the app and the CRM need around them.
--
-- "Staff" stays owner and manager (is_staff), so every existing policy and
-- function is closed to the new roles as it is to a teacher.
--
-- Custom error codes raised below:
--   EA001  no app account is waiting for this student's phone
--   EA002  the student already has an app account
--   EA003  an exam needs a title

-- ───────────────────────────── New types ─────────────────────────────

create type public.korean_level as enum ('beginner', 'topik1', 'topik2');
create type public.app_theme as enum ('system', 'light', 'dark');
create type public.lesson_kind as enum ('lesson', 'exam');
create type public.visit_kind as enum ('arrived', 'left');
create type public.visit_method as enum ('qr', 'manual');
create type public.device_platform as enum ('ios', 'android');

-- ───────────────────────────── Profiles ──────────────────────────────

alter table public.profiles
  add column student_id uuid references public.students (id),
  add column lead_id uuid references public.leads (id) on delete set null,
  add column phone text unique check (phone ~ '^\+998\d{9}$'),
  add column korean_level public.korean_level,
  add column avatar_path text,
  add column theme public.app_theme not null default 'system',
  add column linked_at timestamptz;

-- profiles is granted column by column (the staff Telegram code is not readable).
grant select (student_id, lead_id, phone, korean_level, avatar_path, theme, linked_at) on public.profiles to authenticated;
-- The links, the phone and the level change only through the functions below.
grant update (avatar_path, theme) on public.profiles to authenticated;

-- One app account per student.
create unique index profiles_student_key on public.profiles (student_id) where student_id is not null;
create index profiles_lead_idx on public.profiles (lead_id) where lead_id is not null;

-- A student account always has a student record; nobody else has one.
alter table public.profiles add constraint profiles_student_link
  check ((role = 'student') = (student_id is not null));

-- ─────────────────────────── Who is calling ──────────────────────────

-- The caller's student record, or null when the caller is not a linked student.
create function public.my_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.student_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active and p.role = 'student';
$$;

-- Someone signed in to the student app: a linked student or an app user.
create function public.is_app_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() in ('student', 'app_user'), false);
$$;

-- The groups the calling student is in now.
create function public.my_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.group_id
  from public.enrollments e
  join public.groups g on g.id = e.group_id and g.archived_at is null
  where e.student_id = public.my_student_id() and e.status = 'active';
$$;

-- Supabase Auth keeps a phone as digits; the CRM keeps +998XXXXXXXXX.
create function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_phone, '') = '' then null else '+' || regexp_replace(p_phone, '\D', '', 'g') end;
$$;

-- ─────────────────── The profile of a new auth user ──────────────────
-- As before for staff and teachers. New:
--   * app metadata role "kiosk" (only the service role writes it): a kiosk.
--   * a phone sign-up: an app user, inactive until the SMS code is confirmed.

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
  level_text text := new.raw_user_meta_data ->> 'korean_level';
  name_text text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  teacher_text text;
  role_text text;
  new_role public.user_role := 'manager';
  new_teacher uuid;
  new_phone text;
  active boolean := false;
begin
  if app_role_text in ('owner', 'manager', 'teacher', 'kiosk') then
    role_text := app_role_text;
    teacher_text := new.raw_app_meta_data ->> 'teacher_id';
    active := true;
  elsif new.invited_at is not null then
    role_text := case when invite_role_text in ('owner', 'manager', 'teacher') then invite_role_text else 'manager' end;
    teacher_text := new.raw_user_meta_data ->> 'teacher_id';
    active := true;
  elsif coalesce(new.phone, '') <> '' then
    new_phone := public.normalize_phone(new.phone);
    if new_phone !~ '^\+998\d{9}$' then
      raise exception 'Only Uzbek phone numbers can sign up' using errcode = '22023';
    end if;
    role_text := 'app_user';
    active := new.phone_confirmed_at is not null;
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

  insert into public.profiles (id, full_name, role, teacher_id, language, is_active, phone, korean_level)
  values (
    new.id,
    coalesce(name_text, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'User'),
    new_role,
    new_teacher,
    case when language_text in ('uz', 'ru', 'en', 'ko')
      then language_text::public.ui_language else 'uz' end,
    active,
    new_phone,
    case when new_phone is null then null
         when level_text in ('beginner', 'topik1', 'topik2') then level_text::public.korean_level
         else 'beginner'::public.korean_level end
  )
  on conflict (id) do nothing;

  if new_phone is not null and active then
    perform public.link_or_lead(new.id);
  end if;

  return new;
end;
$$;

-- ──────────────────────── What a user may change ─────────────────────
-- Only the owner changes a role, the active flag or a link. A student or an
-- app user edits their photo, language and theme; the name is staff's to
-- change, and the phone changes only through Supabase Auth, after the SMS
-- code to the new number.

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
      or new.student_id is distinct from old.student_id
      or new.lead_id is distinct from old.lead_id
      or new.phone is distinct from old.phone
      or new.korean_level is distinct from old.korean_level
      or new.linked_at is distinct from old.linked_at
    then
      raise exception 'Only the owner can change roles or deactivate users'
        using errcode = '42501';
    end if;
    if old.role in ('student', 'app_user', 'kiosk') and new.full_name is distinct from old.full_name then
      raise exception 'Only staff change a name' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ───────────────────────────── New columns ───────────────────────────

alter table public.students add column qr_secret_id uuid;

alter table public.lessons
  add column kind public.lesson_kind not null default 'lesson',
  add column exam_title text,
  add constraint lessons_exam_title check ((kind = 'exam') = (exam_title is not null and btrim(exam_title) <> ''));

alter table public.points_settings
  add column game_win_coins integer not null default 5 check (game_win_coins between 0 and 1000),
  add column game_daily_rewarded_wins integer not null default 5 check (game_daily_rewarded_wins between 0 and 1000),
  add column game_pair_daily_cap integer not null default 2 check (game_pair_daily_cap between 0 and 1000),
  add column game_min_questions integer not null default 30 check (game_min_questions between 1 and 10000),
  add column exam_coins_per_correct integer not null default 1 check (exam_coins_per_correct between 0 and 1000);

grant select (game_win_coins, game_daily_rewarded_wins, game_pair_daily_cap, game_min_questions, exam_coins_per_correct)
  on public.points_settings to authenticated;

alter table public.centre_settings
  add column about jsonb not null default '{}'::jsonb check (jsonb_typeof(about) = 'object'),
  add column privacy_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(privacy_policy) = 'object'),
  add column parent_visit_alerts boolean not null default true,
  add column payment_card jsonb,
  add column payment_instructions jsonb not null default '{}'::jsonb check (jsonb_typeof(payment_instructions) = 'object');

-- A lead's timeline says when its person signed up in the app.
alter table public.lead_activities drop constraint lead_activities_kind_check;
alter table public.lead_activities add constraint lead_activities_kind_check
  check (kind in ('note', 'call', 'status_change', 'form_resubmitted', 'app_signup'));

-- ───────────────────────────── App basics ────────────────────────────

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type public.message_type not null,
  title text not null,
  body text not null,
  -- Where a tap leads, and "dedupe": the key that keeps an event from being told twice.
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_profile_idx on public.notifications (profile_id, created_at desc);
create unique index notifications_once on public.notifications (profile_id, (data ->> 'dedupe')) where data ? 'dedupe';

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (btrim(token) <> ''),
  platform public.device_platform not null,
  app_version text,
  last_seen timestamptz not null default now()
);

create index device_tokens_profile_idx on public.device_tokens (profile_id);

-- Arrivals and leavings at reception. Lesson attendance is a different thing.
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id),
  kind public.visit_kind not null,
  at timestamptz not null default now(),
  method public.visit_method not null,
  scanned_by uuid references public.profiles (id) on delete set null
);

create index visits_student_idx on public.visits (student_id, at desc);

create table public.reward_variants (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.rewards (id),
  -- { uz, ru, en, ko }
  name jsonb not null check (jsonb_typeof(name) = 'object'),
  stock integer check (stock is null or stock >= 0),
  created_at timestamptz not null default now()
);

create index reward_variants_reward_idx on public.reward_variants (reward_id);

alter table public.redemptions add column variant_id uuid references public.reward_variants (id);

-- Exam coins an app user has earned and cannot spend until they join the
-- centre. exam_attempt_id points at exam_attempts, which arrives with the
-- mock exams; the reference is added there.
create table public.locked_coins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount > 0 and amount <= 100000),
  exam_attempt_id uuid,
  created_at timestamptz not null default now(),
  moved_at timestamptz
);

create index locked_coins_profile_idx on public.locked_coins (profile_id);

-- Accounts deleted in the app whose profile photos are still in storage. The
-- CRM's job removes the avatars/<profile id>/ folder and then the row.
create table public.deleted_app_accounts (
  profile_id uuid primary key,
  deleted_at timestamptz not null default now()
);

-- Sign-up and reset codes sent, so one phone gets at most 3 an hour.
create table public.sms_code_log (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  sent_at timestamptz not null default now()
);

create index sms_code_log_phone_idx on public.sms_code_log (phone, sent_at);

-- ─────────────────────────── Linking by phone ────────────────────────

-- Makes a profile a student account and moves its locked coins into the
-- ledger: one "exam" row per locked row, under a dedupe key, so nothing can
-- move twice. Internal.
create function public.link_profile_to_student(p_profile_id uuid, p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked public.locked_coins;
begin
  update public.profiles
  set role = 'student', student_id = p_student_id, linked_at = now()
  where id = p_profile_id;

  for locked in
    select * from public.locked_coins c
    where c.profile_id = p_profile_id and c.moved_at is null
    order by c.created_at
    for update
  loop
    insert into public.points_ledger (student_id, delta, source, dedupe_key)
    values (p_student_id, locked.amount, 'exam', 'locked:' || locked.id)
    on conflict (dedupe_key) do nothing;
    update public.locked_coins set moved_at = now() where id = locked.id;
  end loop;
end;
$$;

-- docs/STUDENT_APP_SPEC.md → "Account lifecycle". For a confirmed app user:
--   1. exactly one student has this phone as their own → linked;
--   2. nobody has it as their own and exactly one student has it as the
--      parent's phone → linked;
--   3. otherwise (nobody, or two students sharing the phone, who are left for
--      staff to link by hand) → an app user with a lead: their open lead with
--      this phone when there is one, a new one with source "mobile_app" if not.
-- Returns 'linked', 'lead' or 'none'. p_make_lead = false only links: the
-- triggers on students and leads use it, so saving a phone never makes a lead.
create function public.link_or_lead(p_profile_id uuid, p_make_lead boolean default true)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  matches integer;
  target uuid;
  open_lead uuid;
  lead_tags text[] := '{}';
begin
  select * into p from public.profiles x where x.id = p_profile_id for update;
  if not found or p.role <> 'app_user' or not p.is_active or p.phone is null then
    return 'none';
  end if;

  select count(*), (array_agg(s.id))[1] into matches, target
  from public.students s
  where s.phone = p.phone and s.archived_at is null and s.status in ('active', 'paused');
  if matches = 0 then
    select count(*), (array_agg(s.id))[1] into matches, target
    from public.students s
    where s.parent_phone = p.phone and s.archived_at is null and s.status in ('active', 'paused');
  end if;

  if matches = 1 and not exists (select 1 from public.profiles x where x.student_id = target) then
    perform public.link_profile_to_student(p.id, target);
    return 'linked';
  end if;

  if not p_make_lead then
    return 'none';
  end if;

  -- One at a time per phone, as the website's intake does.
  perform pg_advisory_xact_lock(hashtextextended('intake:phone:' || p.phone, 0));

  if p.lead_id is not null and exists (
    select 1 from public.leads d
    where d.id = p.lead_id and d.archived_at is null and d.status in ('new', 'contacted', 'trial')
  ) then
    return 'lead';
  end if;

  select d.id into open_lead
  from public.leads d
  where d.phone = p.phone and d.archived_at is null and d.status in ('new', 'contacted', 'trial')
  order by d.created_at desc
  limit 1;

  if open_lead is not null then
    insert into public.lead_activities (lead_id, kind) values (open_lead, 'app_signup');
  else
    if matches > 0 then
      lead_tags := array['existing_student'];
    end if;
    insert into public.leads (full_name, phone, source, tags, inbox_since)
    values (p.full_name, p.phone, 'mobile_app', lead_tags, now())
    returning id into open_lead;
  end if;

  update public.profiles set lead_id = open_lead where id = p.id;
  return 'lead';
end;
$$;

-- The SMS code was confirmed, or the phone was changed and confirmed again.
create function public.handle_phone_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_phone text := public.normalize_phone(new.phone);
begin
  if new.phone_confirmed_at is null or new_phone is null or new_phone !~ '^\+998\d{9}$' then
    return new;
  end if;
  if old.phone_confirmed_at is null then
    update public.profiles set phone = new_phone, is_active = true
    where id = new.id and role = 'app_user';
  elsif new.phone is distinct from old.phone then
    update public.profiles set phone = new_phone
    where id = new.id and role in ('app_user', 'student');
  else
    return new;
  end if;
  perform public.link_or_lead(new.id);
  return new;
end;
$$;

create trigger on_auth_phone_confirmed
  after update of phone, phone_confirmed_at on auth.users
  for each row execute function public.handle_phone_confirmed();

-- Staff saved a student: an app account waiting for that phone is linked.
create function public.link_on_student_saved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  waiting uuid;
begin
  for waiting in
    select p.id from public.profiles p
    where p.role = 'app_user' and p.is_active and p.phone in (new.phone, new.parent_phone)
  loop
    perform public.link_or_lead(waiting, false);
  end loop;
  return new;
end;
$$;

create trigger link_on_student_inserted
  after insert on public.students
  for each row execute function public.link_on_student_saved();

-- Only when one of them really changed: a save that leaves the phones alone
-- must not link again an account the owner has unlinked.
create trigger link_on_student_updated
  after update of phone, parent_phone, status, archived_at on public.students
  for each row
  when (old.phone is distinct from new.phone or old.parent_phone is distinct from new.parent_phone
    or old.status is distinct from new.status or old.archived_at is distinct from new.archived_at)
  execute function public.link_on_student_saved();

-- Staff saved a lead's phone or converted the lead.
create function public.link_on_lead_saved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  waiting uuid;
begin
  for waiting in
    select p.id from public.profiles p
    where p.role = 'app_user' and p.is_active and (p.phone = new.phone or p.lead_id = new.id)
  loop
    perform public.link_or_lead(waiting, false);
  end loop;
  return new;
end;
$$;

create trigger link_on_lead_updated
  after update of phone, converted_student_id on public.leads
  for each row
  when (old.phone is distinct from new.phone or old.converted_student_id is distinct from new.converted_student_id)
  execute function public.link_on_lead_saved();

-- Student page → Unlink: the account goes back to an app user. Owner only.
create function public.unlink_app_account(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.profiles
  set role = 'app_user', student_id = null, linked_at = null
  where student_id = p_student_id;
  if not found then
    raise exception 'The student has no app account' using errcode = 'EA001';
  end if;
end;
$$;

-- Student page → Relink: links by hand the app account that signed up with
-- the student's own phone or, failing that, the parent's. This is how two
-- students sharing a phone get their accounts. Owner only.
create function public.link_app_account(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.students;
  waiting uuid;
begin
  if not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into s from public.students x where x.id = p_student_id and x.archived_at is null for update;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles p where p.student_id = p_student_id) then
    raise exception 'The student already has an app account' using errcode = 'EA002';
  end if;
  select p.id into waiting
  from public.profiles p
  where p.role = 'app_user' and p.is_active and p.phone in (s.phone, s.parent_phone)
  order by (p.phone = s.phone) desc
  limit 1;
  if waiting is null then
    raise exception 'No app account is waiting for this phone' using errcode = 'EA001';
  end if;
  perform public.link_profile_to_student(waiting, p_student_id);
end;
$$;

-- ─────────────────────── Row level security ──────────────────────────

alter table public.notifications enable row level security;
alter table public.device_tokens enable row level security;
alter table public.visits enable row level security;
alter table public.reward_variants enable row level security;
alter table public.locked_coins enable row level security;
alter table public.sms_code_log enable row level security;
alter table public.deleted_app_accounts enable row level security;

revoke all on public.sms_code_log, public.deleted_app_accounts from public, anon, authenticated;

-- Notifications: one's own. The server writes them; the user marks them read.
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_select on public.notifications
  for select to authenticated
  using ((select public.is_app_account()) and profile_id = (select auth.uid()));

create policy notifications_update on public.notifications
  for update to authenticated
  using ((select public.is_app_account()) and profile_id = (select auth.uid()))
  with check ((select public.is_app_account()) and profile_id = (select auth.uid()));

-- Device tokens: one's own. Saved through register_device_token().
grant select, delete on public.device_tokens to authenticated;

create policy device_tokens_select on public.device_tokens
  for select to authenticated
  using ((select public.is_app_account()) and profile_id = (select auth.uid()));

create policy device_tokens_delete on public.device_tokens
  for delete to authenticated
  using ((select public.is_app_account()) and profile_id = (select auth.uid()));

-- Visits: staff read them all, a student their own. Written by the check-in.
grant select on public.visits to authenticated;

create policy visits_select on public.visits
  for select to authenticated
  using ((select public.is_staff()) or student_id = (select public.my_student_id()));

-- Reward variants: the owner edits; staff, teachers, students and app users read.
grant select, insert, update on public.reward_variants to authenticated;

create policy reward_variants_select on public.reward_variants
  for select to authenticated
  using (
    (select public.is_staff())
    or (((select public.my_teacher_id()) is not null or (select public.is_app_account()))
      and exists (select 1 from public.rewards r where r.id = reward_id and r.is_active and r.archived_at is null))
  );

create policy reward_variants_insert on public.reward_variants
  for insert to authenticated
  with check ((select public.is_owner()));

create policy reward_variants_update on public.reward_variants
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- Rewards on offer: students order, app users browse.
create policy rewards_app_select on public.rewards
  for select to authenticated
  using ((select public.is_app_account()) and is_active and archived_at is null);

-- Locked coins: one's own.
grant select on public.locked_coins to authenticated;

create policy locked_coins_select on public.locked_coins
  for select to authenticated
  using ((select public.is_app_account()) and profile_id = (select auth.uid()));

-- A linked student reads their own groups, lessons, coin history and orders.
-- Nothing about anyone else.
create policy groups_student_select on public.groups
  for select to authenticated
  using (id in (select public.my_group_ids()));

create policy enrollments_student_select on public.enrollments
  for select to authenticated
  using (student_id = (select public.my_student_id()));

create policy lessons_student_select on public.lessons
  for select to authenticated
  using (group_id in (select public.my_group_ids()));

-- Attendance, charges and payments carry notes staff write for themselves, so
-- a student reads them through my_attendance(), my_charges() and
-- my_payments() below, which leave the notes out.

create policy points_ledger_student_select on public.points_ledger
  for select to authenticated
  using (student_id = (select public.my_student_id()));

create policy redemptions_student_select on public.redemptions
  for select to authenticated
  using (student_id = (select public.my_student_id()));

-- Reward photos: anyone signed in with an active login, except a kiosk.
drop policy reward_photos_read on storage.objects;
create policy reward_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'reward-photos' and (select public.app_role()) in ('owner', 'manager', 'teacher', 'student', 'app_user'));

-- Profile photos: a private bucket. Each account writes into its own folder
-- (<user id>/…); staff read them all. JPG, PNG or WebP up to 2 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_read on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (
    (select public.is_staff())
    or ((select public.is_app_account()) and (storage.foldername(name))[1] = (select auth.uid())::text)
  ));

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (select public.is_app_account())
    and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (select public.is_app_account())
    and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (select public.is_app_account())
    and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (select public.is_app_account())
    and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The bell's live count.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- ───────────────────────── For the app ───────────────────────────────

-- Saves this phone's push token for the caller. A token belongs to one
-- account: signing in on a phone someone else used takes it over.
create function public.register_device_token(p_token text, p_platform public.device_platform, p_app_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_account() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if btrim(coalesce(p_token, '')) = '' then
    raise exception 'A token is required' using errcode = '22023';
  end if;
  insert into public.device_tokens (profile_id, token, platform, app_version)
  values ((select auth.uid()), p_token, p_platform, nullif(btrim(coalesce(p_app_version, '')), ''))
  on conflict (token) do update
    set profile_id = excluded.profile_id, platform = excluded.platform,
        app_version = excluded.app_version, last_seen = now();
end;
$$;

-- About the centre and the privacy policy, in uz, ru, en and ko. Open to
-- everyone: the sign-up screen links the policy before there is an account.
create function public.app_centre_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('centre_name', c.centre_name, 'about', c.about, 'privacy_policy', c.privacy_policy)
  from public.centre_settings c;
$$;

-- The calling student's own record, as the app shows it. Staff notes and the
-- Telegram codes stay in the CRM.
create function public.my_student()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'full_name', s.full_name, 'phone', s.phone, 'birth_date', s.birth_date,
    'parent_name', s.parent_name, 'parent_phone', s.parent_phone, 'status', s.status
  )
  from public.students s
  where s.id = public.my_student_id();
$$;

-- The calling student's own attendance marks, charges and payments, without
-- the notes and void reasons staff write.
create function public.my_attendance()
returns table (lesson_id uuid, group_id uuid, lesson_date date, start_time time, status public.attendance_status)
language sql
stable
security definer
set search_path = ''
as $$
  select a.lesson_id, l.group_id, l.lesson_date, l.start_time, a.status
  from public.attendance a
  join public.lessons l on l.id = a.lesson_id
  where a.student_id = public.my_student_id()
  order by l.lesson_date desc, l.start_time desc;
$$;

create function public.my_charges()
returns table (
  id uuid, group_id uuid, billing_month date, type public.charge_type,
  base_amount bigint, discount_amount bigint, amount bigint, is_prorated boolean, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.group_id, c.billing_month, c.type, c.base_amount, c.discount_amount, c.amount, c.is_prorated, c.created_at
  from public.charges c
  where c.student_id = public.my_student_id()
  order by c.billing_month desc, c.created_at desc;
$$;

create function public.my_payments()
returns table (
  id uuid, group_id uuid, amount bigint, method public.payment_method,
  paid_at timestamptz, receipt_no bigint, voided_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.group_id, p.amount, p.method, p.paid_at, p.receipt_no, p.voided_at
  from public.payments p
  where p.student_id = public.my_student_id()
  order by p.paid_at desc;
$$;

-- Leaderboard for the app: linked students only, as "Akmal I.". Earned coins
-- only. A student hidden from the boards is left out, except from their own
-- view. p_scope 'group' needs one of the caller's own groups.
create function public.app_leaderboard(p_scope text, p_group_id uuid default null, p_period text default 'month')
returns table (rank integer, display_name text, coins bigint, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.my_student_id();
begin
  if me is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_scope = 'group' and (p_group_id is null or p_group_id not in (select public.my_group_ids())) then
    raise exception 'Not your group' using errcode = '42501';
  end if;
  return query
  select (rank() over (order by r.points desc))::integer,
         public.tv_name(r.full_name),
         r.points,
         r.student_id = me
  from public.leaderboard_rows(p_scope, p_group_id, p_period, null) r
  join public.profiles p on p.student_id = r.student_id and p.is_active
  where not r.hidden or r.student_id = me
  order by r.points desc, r.full_name, r.student_id;
end;
$$;

-- Everything the Student Home shows, in one call. p_group_id is the group
-- chosen in the header; null, or a group that is not the caller's, means
-- their first one. Coins and the balance are per student; the next class,
-- the rank and attendance follow the group.
create function public.student_home(p_group_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.my_student_id();
  chosen uuid;
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

  select jsonb_build_object(
    'student', jsonb_build_object('id', s.id, 'full_name', s.full_name),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'subject', g.subject, 'level', g.level) order by g.name, g.id)
      from public.groups g where g.id in (select public.my_group_ids())
    ), '[]'::jsonb),
    'group_id', chosen,
    -- The next lesson or exam that is not cancelled, with when it starts.
    'next', (
      select jsonb_build_object(
        'id', l.id, 'kind', l.kind, 'exam_title', l.exam_title,
        'starts_at', (l.lesson_date + l.start_time) at time zone 'Asia/Tashkent',
        'duration_min', g.duration_min, 'room', r.number
      )
      from public.lessons l
      join public.groups g on g.id = l.group_id
      left join public.rooms r on r.id = g.room_id
      where l.group_id = chosen and l.status <> 'cancelled'
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
    'balance', jsonb_build_object(
      'amount', b.balance,
      'oldest_unpaid_month', b.oldest_unpaid_month,
      'due_day', (select c.due_day from public.centre_settings c)
    ),
    -- (present + late) ÷ (present + late + absent), as in the CRM; null with no marks.
    'attendance', (
      select jsonb_build_object(
        'present', count(*) filter (where a.status = 'present'),
        'late', count(*) filter (where a.status = 'late'),
        'absent', count(*) filter (where a.status = 'absent'),
        'excused', count(*) filter (where a.status = 'excused'),
        'rate', case when count(*) filter (where a.status <> 'excused') = 0 then null
          else round(100.0 * count(*) filter (where a.status in ('present', 'late'))
                     / count(*) filter (where a.status <> 'excused'))::integer end
      )
      from public.attendance a
      join public.lessons l on l.id = a.lesson_id and l.status <> 'cancelled'
      where a.student_id = me and l.group_id = chosen
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

-- Deletes the caller's app account at once: the login, the profile, device
-- tokens, notifications and locked coins. The student record, its payments,
-- attendance and coins are the centre's business records and stay; they are
-- only unlinked. The profile photo is removed from storage by the CRM's job,
-- from the row left in deleted_app_accounts.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or not public.is_app_account() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from public.device_tokens where profile_id = me;
  delete from public.notifications where profile_id = me;
  delete from public.locked_coins where profile_id = me;
  insert into public.deleted_app_accounts (profile_id) values (me) on conflict do nothing;
  update public.profiles set role = 'app_user', student_id = null, linked_at = null where id = me;
  -- The profile goes with the auth user.
  delete from auth.users where id = me;
end;
$$;

-- ───────────────────────── For the CRM server ────────────────────────

-- The Send SMS hook asks before each code: true and counted when this phone
-- has had fewer than 3 in the last hour.
create function public.sms_code_allowed(p_phone text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('sms_code:' || p_phone, 0));
  delete from public.sms_code_log where sent_at < now() - interval '1 day';
  if (select count(*) from public.sms_code_log l where l.phone = p_phone and l.sent_at > now() - interval '1 hour') >= 3 then
    return false;
  end if;
  insert into public.sms_code_log (phone) values (p_phone);
  return true;
end;
$$;

-- Lesson reminders: a student with the app is reminded by push, so they are
-- listed even without a Telegram chat.
create or replace function public.notify_lessons(p_days date[])
returns table (
  lesson_id uuid, group_name text, lesson_date date, start_time time,
  student_id uuid, full_name text, language public.app_language,
  student_chat_id bigint, student_chat_language public.app_language,
  parent_chat_id bigint, parent_chat_language public.app_language
)
language sql
stable
set search_path = ''
as $$
  select
    l.id, g.name, l.lesson_date, l.start_time,
    s.id, s.full_name, s.language,
    own.chat_id, own.language, p.chat_id, p.language
  from public.lessons l
  join public.groups g on g.id = l.group_id
  join public.enrollments e on e.group_id = l.group_id and e.status = 'active' and e.joined_on <= l.lesson_date
  join public.students s on s.id = e.student_id
  left join public.telegram_links own on own.student_id = s.id and own.role = 'student'
  left join public.telegram_links p on p.student_id = s.id and p.role = 'parent'
  where l.status = 'scheduled'
    and l.lesson_date = any (p_days)
    and s.status = 'active' and s.archived_at is null
    and (own.chat_id is not null or p.chat_id is not null
      or exists (select 1 from public.profiles a where a.student_id = s.id and a.is_active))
  order by l.lesson_date, l.start_time, l.id, s.id;
$$;

-- The SMS could not be sent: the code just counted is not held against the phone.
create function public.sms_code_release(p_phone text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.sms_code_log
  where id = (select l.id from public.sms_code_log l where l.phone = p_phone order by l.sent_at desc limit 1);
$$;

-- ─────────────────────── Exams in the schedule ───────────────────────

-- A teacher marks a lesson of their own group as an exam, or back.
create function public.teacher_set_lesson_exam(p_lesson_id uuid, p_is_exam boolean, p_title text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if not exists (
    select 1 from public.lessons l where l.id = p_lesson_id and public.teacher_owns_group(l.group_id)
  ) then
    raise exception 'Not your lesson' using errcode = '42501';
  end if;
  if p_is_exam and title is null then
    raise exception 'An exam needs a title' using errcode = 'EA003';
  end if;
  update public.lessons
  set kind = case when p_is_exam then 'exam'::public.lesson_kind else 'lesson'::public.lesson_kind end,
      exam_title = case when p_is_exam then title end
  where id = p_lesson_id;
end;
$$;

-- The teacher's lesson list also says which lessons are exams.
drop function public.teacher_lessons(uuid);
create function public.teacher_lessons(p_group_id uuid)
returns table (
  id uuid, lesson_date date, start_time time, status public.lesson_status,
  marked integer, can_mark boolean, kind public.lesson_kind, exam_title text
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
    l.status <> 'cancelled' and l.lesson_date = today,
    l.kind, l.exam_title
  from public.lessons l
  where l.group_id = p_group_id
    and l.lesson_date between today - 7 and today + 14
  order by l.lesson_date, l.start_time;
end;
$$;

-- ───────────────────────────── Grants ────────────────────────────────

revoke execute on function
  public.my_student_id(),
  public.is_app_account(),
  public.my_group_ids(),
  public.normalize_phone(text),
  public.link_profile_to_student(uuid, uuid),
  public.link_or_lead(uuid, boolean),
  public.handle_phone_confirmed(),
  public.link_on_student_saved(),
  public.link_on_lead_saved(),
  public.unlink_app_account(uuid),
  public.link_app_account(uuid),
  public.register_device_token(text, public.device_platform, text),
  public.app_centre_info(),
  public.my_student(),
  public.app_leaderboard(text, uuid, text),
  public.student_home(uuid),
  public.delete_my_account(),
  public.sms_code_allowed(text),
  public.sms_code_release(text),
  public.my_attendance(),
  public.my_charges(),
  public.my_payments(),
  public.teacher_set_lesson_exam(uuid, boolean, text),
  public.teacher_lessons(uuid)
from public, anon, authenticated;

grant execute on function
  public.my_student_id(),
  public.is_app_account(),
  public.my_group_ids(),
  public.unlink_app_account(uuid),
  public.link_app_account(uuid),
  public.register_device_token(text, public.device_platform, text),
  public.app_centre_info(),
  public.my_student(),
  public.my_attendance(),
  public.my_charges(),
  public.my_payments(),
  public.app_leaderboard(text, uuid, text),
  public.student_home(uuid),
  public.delete_my_account(),
  public.teacher_set_lesson_exam(uuid, boolean, text),
  public.teacher_lessons(uuid)
to authenticated, service_role;

grant execute on function public.app_centre_info() to anon;

grant execute on function
  public.link_or_lead(uuid, boolean),
  public.sms_code_allowed(text),
  public.sms_code_release(text)
to service_role;
