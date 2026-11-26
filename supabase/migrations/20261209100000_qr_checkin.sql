-- QR check-in. docs/STUDENT_APP_SPEC.md → "Rules → QR check-in".
--
-- 1. A secret per student, kept in Vault: made when an app account is linked,
--    replaced when that account's password or phone changes, removed when it
--    is unlinked. qr_secret() hands it to that signed-in student and nobody else.
-- 2. The code: v1.<student_id>.<time_step>.<signature>. A step is 30 seconds
--    of Unix time; the signature is HMAC-SHA256 of "v1.<student_id>.<time_step>"
--    with the secret, in hex. The phone makes it offline.
-- 3. verify_checkin(code) for a kiosk, the owner and managers: the current or
--    the previous step only; the first scan of the Tashkent day is Arrived,
--    the next Left, and so on; a repeat within 2 minutes changes nothing.
--    Lesson attendance is never touched.
-- 4. The search fallback at reception: checkin_search() and manual_checkin().
-- 5. The parent's Telegram messages, and visits in Realtime for the app.
--
-- What verify_checkin answers (jsonb), always with "result":
--   arrived | left   a visit was written (or, with "repeat": true, the one
--                    written less than 2 minutes ago is shown again)
--   invalid          not one of this centre's codes, or the signature is wrong
--   expired          the code is older than two steps
--   clock            the code is from the future: the phone's clock is wrong
--   unknown          no such student, archived, or no app account linked

-- ─────────────────────────── The secret ───────────────────────────────

-- A new secret for a student, replacing any old one. Internal.
create function public.qr_secret_rotate(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text := encode(extensions.gen_random_bytes(32), 'hex');
  secret_id uuid;
begin
  select s.qr_secret_id into secret_id from public.students s where s.id = p_student_id for update;
  if not found then
    return null;
  end if;
  if secret_id is not null and exists (select 1 from vault.decrypted_secrets v where v.id = secret_id) then
    perform vault.update_secret(secret_id, secret);
  else
    secret_id := vault.create_secret(secret, 'qr_student_' || p_student_id, 'QR check-in secret of a student');
    update public.students set qr_secret_id = secret_id where id = p_student_id;
  end if;
  return secret;
end;
$$;

revoke execute on function public.qr_secret_rotate(uuid) from public, anon, authenticated;

-- Without a linked account there is no phone to show a code: the old one stops working.
create function public.qr_secret_drop(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_id uuid;
begin
  select s.qr_secret_id into secret_id from public.students s where s.id = p_student_id for update;
  if secret_id is null then
    return;
  end if;
  update public.students set qr_secret_id = null where id = p_student_id;
  delete from vault.secrets where id = secret_id;
end;
$$;

revoke execute on function public.qr_secret_drop(uuid) from public, anon, authenticated;

-- Linking makes the secret; unlinking removes it.
create function public.qr_secret_on_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.student_id is not null and old.student_id is distinct from new.student_id then
    perform public.qr_secret_drop(old.student_id);
  end if;
  if new.student_id is not null and (tg_op = 'INSERT' or old.student_id is distinct from new.student_id) then
    perform public.qr_secret_rotate(new.student_id);
  end if;
  return null;
end;
$$;

create trigger profiles_qr_secret
after insert or update of student_id on public.profiles
for each row execute function public.qr_secret_on_link();

create function public.qr_secret_on_unlink()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.student_id is not null then
    perform public.qr_secret_drop(old.student_id);
  end if;
  return null;
end;
$$;

-- A deleted account leaves no working code behind.
create trigger profiles_qr_secret_gone
after delete on public.profiles
for each row execute function public.qr_secret_on_unlink();

-- A new password or phone replaces the secret: a code from a phone that was
-- signed in before the change stops working.
create function public.qr_secret_on_credentials()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  student uuid;
begin
  select p.student_id into student from public.profiles p where p.id = new.id and p.role = 'student';
  if student is not null then
    perform public.qr_secret_rotate(student);
  end if;
  return null;
end;
$$;

create trigger users_qr_secret
after update of encrypted_password, phone on auth.users
for each row
when (old.encrypted_password is distinct from new.encrypted_password or old.phone is distinct from new.phone)
execute function public.qr_secret_on_credentials();

-- Accounts linked before this migration get their secret now.
select public.qr_secret_rotate(p.student_id) from public.profiles p where p.student_id is not null and p.role = 'student';

-- The signed-in student's own id and secret, for the phone's secure storage.
create function public.qr_secret()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  student uuid := public.my_student_id();
  secret text;
begin
  if student is null then
    raise exception 'Check-in codes are for linked students' using errcode = '42501';
  end if;
  select v.decrypted_secret into secret
  from public.students s
  join vault.decrypted_secrets v on v.id = s.qr_secret_id
  where s.id = student;
  if secret is null then
    secret := public.qr_secret_rotate(student);
  end if;
  return jsonb_build_object('student_id', student, 'secret', secret);
end;
$$;

revoke execute on function public.qr_secret() from public, anon;
grant execute on function public.qr_secret() to authenticated;

-- ──────────────────────────── The code ────────────────────────────────

-- The code a phone shows at a moment, given the secret. The phone computes
-- the same thing on its own; tests compare the two. Internal.
create function public.qr_code_at(p_secret text, p_student_id uuid, p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select payload || '.' || encode(extensions.hmac(convert_to(payload, 'UTF8'), convert_to(p_secret, 'UTF8'), 'sha256'), 'hex')
  from (select 'v1.' || p_student_id::text || '.' || floor(extract(epoch from p_at) / 30)::bigint::text as payload) code;
$$;

revoke execute on function public.qr_code_at(text, uuid, timestamptz) from public, anon, authenticated;

-- ─────────────────────────── The visit ────────────────────────────────

-- Writes the visit and describes it for the reception screen: who, Arrived or
-- Left, today's lessons and whether they owe money (never how much). Internal.
create function public.record_visit(p_student_id uuid, p_method public.visit_method)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  student record;
  last_visit record;
  today date := (now() at time zone 'Asia/Tashkent')::date;
  day_start timestamptz := (today::timestamp at time zone 'Asia/Tashkent');
  visit_id uuid;
  visit_kind public.visit_kind;
  visit_at timestamptz := now();
  repeat boolean := false;
begin
  -- One scan at a time per student: two scanners cannot both write Arrived.
  select s.id, s.full_name into student from public.students s where s.id = p_student_id and s.archived_at is null for update;
  if not found then
    return jsonb_build_object('result', 'unknown');
  end if;

  select v.id, v.kind, v.at into last_visit
  from public.visits v
  where v.student_id = p_student_id and v.at >= day_start
  order by v.at desc, v.id desc
  limit 1;

  if found and last_visit.at > now() - interval '2 minutes' then
    repeat := true;
    visit_id := last_visit.id;
    visit_kind := last_visit.kind;
    visit_at := last_visit.at;
  else
    visit_kind := case when found and last_visit.kind = 'arrived' then 'left' else 'arrived' end;
    insert into public.visits (student_id, kind, at, method, scanned_by)
    values (p_student_id, visit_kind, visit_at, p_method, (select auth.uid()))
    returning id into visit_id;
  end if;

  return jsonb_build_object(
    'result', visit_kind,
    'repeat', repeat,
    'visit_id', visit_id,
    'at', visit_at,
    'student', jsonb_build_object(
      'id', student.id,
      'full_name', student.full_name,
      'avatar_path', (select p.avatar_path from public.profiles p where p.student_id = student.id and p.role = 'student' limit 1)
    ),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'group', g.name, 'start_time', to_char(l.start_time, 'HH24:MI'),
        'end_time', to_char(l.start_time + make_interval(mins => g.duration_min), 'HH24:MI'),
        'room', r.number, 'exam', l.kind = 'exam'
      ) order by l.start_time, g.name)
      from public.enrollments e
      join public.groups g on g.id = e.group_id and g.archived_at is null
      join public.lessons l on l.group_id = g.id and l.lesson_date = today and l.status <> 'cancelled'
      left join public.rooms r on r.id = g.room_id
      where e.student_id = student.id and e.status = 'active'
    ), '[]'::jsonb),
    'debt', coalesce((select b.balance < 0 from public.student_balances b where b.student_id = student.id), false)
  );
end;
$$;

revoke execute on function public.record_visit(uuid, public.visit_method) from public, anon, authenticated;

create function public.can_check_in()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.app_role()) in ('kiosk', 'owner', 'manager'), false);
$$;

revoke execute on function public.can_check_in() from public, anon;
grant execute on function public.can_check_in() to authenticated;

create function public.verify_checkin(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  parts text[];
  student uuid;
  step bigint;
  now_step bigint := floor(extract(epoch from now()) / 30)::bigint;
  secret text;
  expected text;
begin
  if not public.can_check_in() then
    raise exception 'Only reception checks codes' using errcode = '42501';
  end if;

  -- A handheld scanner may type the code in capitals and end it with Enter.
  parts := regexp_match(lower(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')), '^v1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9]{1,12})\.([0-9a-f]{64})$');
  if parts is null then
    return jsonb_build_object('result', 'invalid');
  end if;
  student := parts[1]::uuid;
  step := parts[2]::bigint;

  select v.decrypted_secret into secret
  from public.students s
  join vault.decrypted_secrets v on v.id = s.qr_secret_id
  where s.id = student and s.archived_at is null;
  if secret is null then
    return jsonb_build_object('result', 'unknown');
  end if;

  -- The signature first: only a real code is told that it is late.
  expected := encode(extensions.hmac(convert_to('v1.' || student::text || '.' || step::text, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'), 'hex');
  if expected <> parts[3] then
    return jsonb_build_object('result', 'invalid');
  end if;
  if step > now_step then
    return jsonb_build_object('result', 'clock');
  end if;
  if step < now_step - 1 then
    return jsonb_build_object('result', 'expired');
  end if;

  return public.record_visit(student, 'qr');
end;
$$;

revoke execute on function public.verify_checkin(text) from public, anon;
grant execute on function public.verify_checkin(text) to authenticated;

-- ───────────────────────── Search fallback ────────────────────────────

-- For a student without their phone: reception finds them by name. Names and
-- groups only.
create function public.checkin_search(p_query text)
returns table (student_id uuid, full_name text, groups text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := btrim(coalesce(p_query, ''));
begin
  if not public.can_check_in() then
    raise exception 'Only reception searches here' using errcode = '42501';
  end if;
  if length(q) < 2 then
    return;
  end if;
  -- The words are looked for as written: % and _ are not wildcards.
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
  select s.id, s.full_name,
         (select string_agg(g.name, ', ' order by g.name)
          from public.enrollments e
          join public.groups g on g.id = e.group_id and g.archived_at is null
          where e.student_id = s.id and e.status = 'active')
  from public.students s
  where s.archived_at is null and s.full_name ilike '%' || q || '%'
  order by s.full_name
  limit 8;
end;
$$;

revoke execute on function public.checkin_search(text) from public, anon;
grant execute on function public.checkin_search(text) to authenticated;

create function public.manual_checkin(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_check_in() then
    raise exception 'Only reception checks students in' using errcode = '42501';
  end if;
  return public.record_visit(p_student_id, 'manual');
end;
$$;

revoke execute on function public.manual_checkin(uuid) from public, anon;
grant execute on function public.manual_checkin(uuid) to authenticated;

-- ───────────────────── Messages and live status ───────────────────────

insert into public.message_templates (type, channel, language, body) values
  ('visit_arrived', 'telegram', 'uz', '{student} markazga keldi. Vaqt: {time}.'),
  ('visit_arrived', 'telegram', 'ru', '{student} пришёл(а) в центр в {time}.'),
  ('visit_arrived', 'telegram', 'en', '{student} arrived at the centre at {time}.'),
  ('visit_left', 'telegram', 'uz', '{student} markazdan chiqdi. Vaqt: {time}.'),
  ('visit_left', 'telegram', 'ru', '{student} ушёл(ла) из центра в {time}.'),
  ('visit_left', 'telegram', 'en', '{student} left the centre at {time}.')
on conflict (type, channel, language) do nothing;

-- The app shows "Arrived 14:52" the moment reception scans the code.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'visits') then
    alter publication supabase_realtime add table public.visits;
  end if;
end;
$$;
