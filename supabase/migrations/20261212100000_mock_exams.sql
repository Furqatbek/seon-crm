-- Mock exams: the builder's tables and the engine.
-- docs/STUDENT_APP_SPEC.md → "Rules → Mock exams", "Rules → Coins",
-- "Data model" (MOCK EXAMS).
--
-- An exam has a level, a listening section and a reading section (listening
-- first), each with a question count and a time limit; passages (a text or
-- an audio file) and questions with two to four choices of text or pictures.
-- Staff and teachers build a draft; the owner and managers publish it. A
-- published exam's content cannot be changed: it goes back to draft first.
--
-- A player (a linked student or an App user) never reads these tables. The
-- engine hands out the current section's questions without their answers,
-- and the answers only once the attempt is finished:
--   start_exam · exam_state · answer_exam · record_audio_play ·
--   submit_section · finish_exam
-- Deadlines are the server's. Listening ends at started_at + its limit, or
-- when the player submits it; reading starts at that moment and ends its own
-- limit later. Leaving the app stops nothing: every call first closes what
-- has run out.
--
-- Coins: correct answers × rate, for the first completed attempt of each
-- exam only. A student gets a points_ledger row (source exam); an App user a
-- locked_coins row, which linking moves into the ledger once.
--
-- Errors: EX001 a section does not have the number of questions it says ·
-- EX002 an audio passage has no file · EX003 the exam is not open to play ·
-- EX004 the attempt is over.

create type public.exam_level as enum ('topik1', 'topik2');
create type public.exam_status as enum ('draft', 'published');
create type public.exam_section_kind as enum ('listening', 'reading');
create type public.exam_passage_kind as enum ('text', 'audio');
create type public.exam_attempt_status as enum ('in_progress', 'submitted', 'expired');

-- ───────────────────────────── The exam ───────────────────────────────

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> '' and length(title) <= 120),
  level public.exam_level not null,
  -- How many times a listening audio may be played.
  audio_max_plays smallint not null default 1 check (audio_max_plays in (1, 2)),
  -- null = the rate in Settings → Points.
  coins_per_correct integer check (coins_per_correct is null or coins_per_correct between 0 and 1000),
  -- [{ "level": 3, "min_correct": 40 }, …] or null: no estimate is shown.
  level_thresholds jsonb,
  status public.exam_status not null default 'draft',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  published_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exams_thresholds_shape check (level_thresholds is null or jsonb_typeof(level_thresholds) = 'array')
);

create trigger set_updated_at before update on public.exams
  for each row execute function public.set_updated_at();

create table public.exam_sections (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  kind public.exam_section_kind not null,
  -- Listening is 1, reading 2.
  position smallint not null check (position in (1, 2)),
  time_limit_sec integer not null check (time_limit_sec between 60 and 4 * 3600),
  question_count integer not null check (question_count between 1 and 200),
  unique (exam_id, kind),
  check ((kind = 'listening') = (position = 1))
);

create table public.exam_passages (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  section_id uuid not null references public.exam_sections (id) on delete cascade,
  kind public.exam_passage_kind not null,
  text text check (text is null or length(text) <= 6000),
  -- Objects in the exam-media bucket, under the exam's own folder.
  image_path text,
  audio_path text,
  position integer not null check (position >= 1),
  check (kind = 'audio' or btrim(coalesce(text, '')) <> '' or image_path is not null)
);

create index exam_passages_section_idx on public.exam_passages (section_id, position);

create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.exam_sections (id) on delete cascade,
  passage_id uuid references public.exam_passages (id) on delete set null,
  position integer not null check (position >= 1),
  prompt text not null check (btrim(prompt) <> '' and length(prompt) <= 1000),
  -- [{ "id": "a", "text": "…" } | { "id": "a", "image_path": "…" }, …]: two to four.
  options jsonb not null,
  correct_option_id text not null,
  explanation text check (explanation is null or length(explanation) <= 2000)
);

create index exam_questions_section_idx on public.exam_questions (section_id, position);

-- The choices are well formed and the right one is among them.
create function public.exam_questions_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ids text[];
begin
  if jsonb_typeof(new.options) is distinct from 'array' or jsonb_array_length(new.options) not between 2 and 4 then
    raise exception 'A question has two to four choices' using errcode = '23514';
  end if;
  select array_agg(o ->> 'id') into ids from jsonb_array_elements(new.options) o;
  if exists (
    select 1 from jsonb_array_elements(new.options) o
    where jsonb_typeof(o) <> 'object' or coalesce(btrim(o ->> 'id'), '') = ''
       or (coalesce(btrim(o ->> 'text'), '') = '' and coalesce(btrim(o ->> 'image_path'), '') = '')
       or length(coalesce(o ->> 'text', '')) > 300
  ) or (select count(distinct id) from unnest(ids) id) <> cardinality(ids) then
    raise exception 'Each choice needs its own id and a text or a picture' using errcode = '23514';
  end if;
  if not new.correct_option_id = any (ids) then
    raise exception 'The right answer must be one of the choices' using errcode = '23514';
  end if;
  if new.passage_id is not null and not exists (select 1 from public.exam_passages p where p.id = new.passage_id and p.section_id = new.section_id) then
    raise exception 'The passage belongs to another section' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger exam_questions_check before insert or update on public.exam_questions
  for each row execute function public.exam_questions_check();

-- A passage sits in a section of its own exam.
create function public.exam_passages_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.exam_sections s where s.id = new.section_id and s.exam_id = new.exam_id) then
    raise exception 'The section belongs to another exam' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger exam_passages_check before insert or update on public.exam_passages
  for each row execute function public.exam_passages_check();

-- Who builds: the owner, managers and teachers.
create function public.is_exam_author()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.app_role()) in ('owner', 'manager', 'teacher'), false);
$$;

revoke execute on function public.is_exam_author() from public, anon;
grant execute on function public.is_exam_author() to authenticated;

-- An exam: publishing and unpublishing go through their functions, archiving
-- is the owner's, and a published exam's settings stay as they are.
create function public.guard_exam()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_api_user() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.status := 'draft';
    new.published_by := null;
    new.published_at := null;
    new.archived_at := null;
    return new;
  end if;
  new.created_by := old.created_by;
  if new.status is distinct from old.status or new.published_by is distinct from old.published_by or new.published_at is distinct from old.published_at then
    raise exception 'Publish and unpublish with their own actions' using errcode = '42501';
  end if;
  if new.archived_at is distinct from old.archived_at then
    if not public.is_owner() then
      raise exception 'Only the owner archives' using errcode = '42501';
    end if;
  elsif old.status = 'published' then
    raise exception 'A published exam cannot be changed: unpublish it first' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_exam before insert or update on public.exams
  for each row execute function public.guard_exam();

-- Sections, passages and questions change only while their exam is a draft.
create function public.guard_exam_content()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  row_exam uuid;
  state record;
  target jsonb;
begin
  -- The row as it is being written, or the one being removed.
  if tg_op = 'DELETE' then
    target := to_jsonb(old);
  else
    target := to_jsonb(new);
  end if;
  if public.is_api_user() then
    if tg_table_name = 'exam_questions' then
      select s.exam_id into row_exam from public.exam_sections s where s.id = (target ->> 'section_id')::uuid;
    else
      row_exam := (target ->> 'exam_id')::uuid;
    end if;
    select e.status, e.archived_at into state from public.exams e where e.id = row_exam;
    if state.status is distinct from 'draft' or state.archived_at is not null then
      raise exception 'A published exam cannot be changed: unpublish it first' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger guard_exam_content before insert or update or delete on public.exam_sections
  for each row execute function public.guard_exam_content();
create trigger guard_exam_content before insert or update or delete on public.exam_passages
  for each row execute function public.guard_exam_content();
create trigger guard_exam_content before insert or update or delete on public.exam_questions
  for each row execute function public.guard_exam_content();

alter table public.exams enable row level security;
alter table public.exam_sections enable row level security;
alter table public.exam_passages enable row level security;
alter table public.exam_questions enable row level security;

revoke all on public.exams, public.exam_sections, public.exam_passages, public.exam_questions from public, anon, authenticated;
grant select, insert, update on public.exams to authenticated;
grant select, insert, update, delete on public.exam_sections, public.exam_passages, public.exam_questions to authenticated;

-- The owner, managers and teachers read and build. Students, App users and a
-- kiosk read nothing here: the questions carry their answers.
create policy exams_select on public.exams for select to authenticated using ((select public.is_exam_author()));
create policy exams_insert on public.exams for insert to authenticated with check ((select public.is_exam_author()));
create policy exams_update on public.exams for update to authenticated using ((select public.is_exam_author())) with check ((select public.is_exam_author()));

create policy exam_sections_all on public.exam_sections for all to authenticated using ((select public.is_exam_author())) with check ((select public.is_exam_author()));
create policy exam_passages_all on public.exam_passages for all to authenticated using ((select public.is_exam_author())) with check ((select public.is_exam_author()));
create policy exam_questions_all on public.exam_questions for all to authenticated using ((select public.is_exam_author())) with check ((select public.is_exam_author()));

-- Publish: the owner and managers, once every section has the questions it
-- says and every audio passage has its file.
create function public.publish_exam(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  short record;
begin
  if not public.is_staff() then
    raise exception 'Only the owner and managers publish' using errcode = '42501';
  end if;
  perform 1 from public.exams e where e.id = p_exam_id and e.archived_at is null for update;
  if not found then
    raise exception 'No such exam' using errcode = 'P0002';
  end if;
  if (select count(*) from public.exam_sections s where s.exam_id = p_exam_id) <> 2 then
    raise exception 'An exam has a listening and a reading section' using errcode = 'EX001';
  end if;
  select s.kind, s.question_count, (select count(*) from public.exam_questions q where q.section_id = s.id) as written into short
  from public.exam_sections s
  where s.exam_id = p_exam_id and s.question_count <> (select count(*) from public.exam_questions q where q.section_id = s.id)
  order by s.position
  limit 1;
  if found then
    raise exception 'The % section has % of its % questions', short.kind, short.written, short.question_count
      using errcode = 'EX001', detail = short.kind::text;
  end if;
  if exists (select 1 from public.exam_passages p where p.exam_id = p_exam_id and p.kind = 'audio' and coalesce(p.audio_path, '') = '') then
    raise exception 'An audio passage has no file' using errcode = 'EX002';
  end if;
  update public.exams set status = 'published', published_by = (select auth.uid()), published_at = now() where id = p_exam_id;
end;
$$;

revoke execute on function public.publish_exam(uuid) from public, anon;
grant execute on function public.publish_exam(uuid) to authenticated;

-- Back to a draft, to change it. Attempts already made keep their results.
create function public.unpublish_exam(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only the owner and managers unpublish' using errcode = '42501';
  end if;
  update public.exams set status = 'draft' where id = p_exam_id and archived_at is null;
  if not found then
    raise exception 'No such exam' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.unpublish_exam(uuid) from public, anon;
grant execute on function public.unpublish_exam(uuid) to authenticated;

-- ──────────────────────────── Attempts ────────────────────────────────

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.exam_attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  -- listening, then reading; null once the attempt is over.
  current_section public.exam_section_kind,
  -- { "listening": "…", "reading": "…" }: when each section closes.
  section_deadlines jsonb not null,
  correct_listening integer,
  correct_reading integer,
  coins integer not null default 0 check (coins >= 0),
  -- The coins went to locked_coins: the player was an App user.
  coins_locked boolean not null default false,
  -- No attempt of this exam was completed before this one started.
  first_attempt boolean not null,
  submitted_at timestamptz,
  constraint exam_attempts_over_shape check ((status = 'in_progress') = (submitted_at is null) and (status = 'in_progress') = (current_section is not null))
);

-- One attempt of an exam at a time per player.
create unique index exam_attempts_one_open on public.exam_attempts (exam_id, profile_id) where status = 'in_progress';
create index exam_attempts_profile_idx on public.exam_attempts (profile_id, started_at desc);
create index exam_attempts_exam_idx on public.exam_attempts (exam_id);

create table public.exam_answers (
  attempt_id uuid not null references public.exam_attempts (id) on delete cascade,
  question_id uuid not null references public.exam_questions (id) on delete cascade,
  -- null: flagged or listened to, not answered.
  option_id text,
  flagged boolean not null default false,
  -- How many times the player started this question's audio.
  audio_plays integer not null default 0 check (audio_plays >= 0),
  answered_at timestamptz,
  primary key (attempt_id, question_id)
);

alter table public.locked_coins
  add constraint locked_coins_exam_attempt_fkey foreign key (exam_attempt_id) references public.exam_attempts (id) on delete set null;

alter table public.exam_attempts enable row level security;
alter table public.exam_answers enable row level security;

revoke all on public.exam_attempts, public.exam_answers from public, anon, authenticated;
grant select on public.exam_attempts to authenticated;

-- Staff and teachers see the attempts, for the statistics. A player's own
-- attempts come through the engine; nobody reads answers directly.
create policy exam_attempts_select on public.exam_attempts for select to authenticated using ((select public.is_exam_author()));

-- Attempts and the average score of each exam, for the list.
create function public.exam_stats()
returns table (exam_id uuid, attempts integer, players integer, average_correct numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_exam_author() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select a.exam_id, count(*)::integer, count(distinct a.profile_id)::integer,
         round(avg(coalesce(a.correct_listening, 0) + coalesce(a.correct_reading, 0)), 1)
  from public.exam_attempts a
  where a.status <> 'in_progress'
  group by a.exam_id;
end;
$$;

revoke execute on function public.exam_stats() from public, anon;
grant execute on function public.exam_stats() to authenticated;

-- Audio and pictures. The owner, managers and teachers add and read them; a
-- player reads the files of an exam they have an attempt on.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam-media', 'exam-media', false, 10485760, array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Files live under their exam: "<exam id>/<name>".
create function public.has_exam_attempt(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.exam_attempts a
    where a.profile_id = (select auth.uid()) and a.exam_id::text = split_part(p_object_name, '/', 1)
  );
$$;

revoke execute on function public.has_exam_attempt(text) from public, anon;
grant execute on function public.has_exam_attempt(text) to authenticated;

create policy exam_media_read on storage.objects
  for select to authenticated
  using (bucket_id = 'exam-media' and ((select public.is_exam_author()) or public.has_exam_attempt(name)));

create policy exam_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'exam-media' and (select public.is_exam_author()));

-- ───────────────────────────── The engine ─────────────────────────────

-- The estimated level for a score, from the exam's own thresholds; null without any.
create function public.exam_estimate(p_thresholds jsonb, p_correct integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select max((t ->> 'level')::integer)
  from jsonb_array_elements(case when jsonb_typeof(p_thresholds) = 'array' then p_thresholds else '[]'::jsonb end) t
  where (t ->> 'min_correct') ~ '^\d+$' and (t ->> 'level') ~ '^\d+$' and (t ->> 'min_correct')::integer <= p_correct;
$$;

-- Ends an attempt: counts the right answers of each section and pays the
-- first completed attempt. Internal.
create function public.exam_finish(p_attempt_id uuid, p_status public.exam_attempt_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  listening integer;
  reading integer;
  rate integer;
  earned integer := 0;
  player record;
  locked boolean := false;
begin
  select * into a from public.exam_attempts where id = p_attempt_id for update;
  if a.status <> 'in_progress' then
    return;
  end if;

  select count(*) filter (where s.kind = 'listening'), count(*) filter (where s.kind = 'reading') into listening, reading
  from public.exam_answers x
  join public.exam_questions q on q.id = x.question_id
  join public.exam_sections s on s.id = q.section_id
  where x.attempt_id = p_attempt_id and x.option_id = q.correct_option_id;

  -- The first completed attempt of this exam is the only one that pays.
  if a.first_attempt and not exists (
    select 1 from public.exam_attempts o where o.exam_id = a.exam_id and o.profile_id = a.profile_id and o.id <> a.id and o.status <> 'in_progress'
  ) then
    select coalesce(e.coins_per_correct, s.exam_coins_per_correct) into rate
    from public.exams e, public.points_settings s
    where e.id = a.exam_id and s.enabled;
    earned := least(coalesce(rate, 0) * (listening + reading), 100000);
  end if;

  if earned > 0 then
    select p.role, p.student_id into player from public.profiles p where p.id = a.profile_id;
    if player.role = 'student' and player.student_id is not null then
      insert into public.points_ledger (student_id, delta, source, dedupe_key)
      values (player.student_id, earned, 'exam', 'exam:' || a.id)
      on conflict (dedupe_key) do nothing;
    else
      -- An App user's coins wait until they join the centre.
      insert into public.locked_coins (profile_id, amount, exam_attempt_id) values (a.profile_id, earned, a.id);
      locked := true;
    end if;
  end if;

  update public.exam_attempts
  set status = p_status, current_section = null, correct_listening = listening, correct_reading = reading,
      coins = earned, coins_locked = locked, submitted_at = now()
  where id = p_attempt_id;
end;
$$;

revoke execute on function public.exam_finish(uuid, public.exam_attempt_status) from public, anon, authenticated;

-- Closes what has run out: listening at its deadline (reading is already
-- running since then), the whole attempt at reading's. Internal; every call
-- of the engine starts with it.
create function public.exam_sync(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
begin
  select * into a from public.exam_attempts where id = p_attempt_id for update;
  if not found or a.status <> 'in_progress' then
    return;
  end if;
  if a.current_section = 'listening' and now() >= (a.section_deadlines ->> 'listening')::timestamptz then
    update public.exam_attempts set current_section = 'reading' where id = p_attempt_id;
    a.current_section := 'reading';
  end if;
  if a.current_section = 'reading' and now() >= (a.section_deadlines ->> 'reading')::timestamptz then
    perform public.exam_finish(p_attempt_id, 'expired');
  end if;
end;
$$;

revoke execute on function public.exam_sync(uuid) from public, anon, authenticated;

-- The caller's own attempt, brought up to the clock; an error for anyone else's.
create function public.exam_my_attempt(p_attempt_id uuid)
returns public.exam_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.exam_attempts;
begin
  perform 1 from public.exam_attempts x where x.id = p_attempt_id and x.profile_id = (select auth.uid());
  if not found then
    raise exception 'Not your attempt' using errcode = '42501';
  end if;
  perform public.exam_sync(p_attempt_id);
  select * into a from public.exam_attempts x where x.id = p_attempt_id;
  return a;
end;
$$;

revoke execute on function public.exam_my_attempt(uuid) from public, anon, authenticated;

-- The published exams and what the caller has done with each.
create function public.exam_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me record;
  rate integer;
begin
  me := public.game_player();
  select case when s.enabled then s.exam_coins_per_correct else 0 end into rate from public.points_settings s;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'title', e.title, 'level', e.level, 'audio_max_plays', e.audio_max_plays,
      'coins_per_correct', case when coalesce(rate, 0) = 0 then 0 else coalesce(e.coins_per_correct, rate) end,
      'sections', (select jsonb_agg(jsonb_build_object('kind', s.kind, 'question_count', s.question_count, 'time_limit_sec', s.time_limit_sec) order by s.position)
                   from public.exam_sections s where s.exam_id = e.id),
      'open_attempt_id', (select a.id from public.exam_attempts a where a.exam_id = e.id and a.profile_id = me.profile_id and a.status = 'in_progress'),
      'attempts', (select count(*) from public.exam_attempts a where a.exam_id = e.id and a.profile_id = me.profile_id and a.status <> 'in_progress'),
      'last', (select jsonb_build_object('attempt_id', a.id, 'correct', coalesce(a.correct_listening, 0) + coalesce(a.correct_reading, 0), 'submitted_at', a.submitted_at)
               from public.exam_attempts a where a.exam_id = e.id and a.profile_id = me.profile_id and a.status <> 'in_progress'
               order by a.submitted_at desc limit 1)
    ) order by e.level, e.published_at desc)
    from public.exams e
    where e.status = 'published' and e.archived_at is null
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.exam_list() from public, anon;
grant execute on function public.exam_list() to authenticated;

-- Starts an exam, or returns the attempt already in progress. Returns its id.
create function public.start_exam(p_exam_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record;
  open_attempt uuid;
  listening integer;
  reading integer;
  new_id uuid;
begin
  me := public.game_player();
  -- One start at a time per player: two taps make one attempt.
  perform pg_advisory_xact_lock(hashtextextended('exam:' || me.profile_id::text, 0));

  select a.id into open_attempt from public.exam_attempts a where a.exam_id = p_exam_id and a.profile_id = me.profile_id and a.status = 'in_progress';
  if open_attempt is not null then
    perform public.exam_sync(open_attempt);
    if exists (select 1 from public.exam_attempts a where a.id = open_attempt and a.status = 'in_progress') then
      return open_attempt;
    end if;
  end if;

  if not exists (select 1 from public.exams e where e.id = p_exam_id and e.status = 'published' and e.archived_at is null) then
    raise exception 'This exam is not open' using errcode = 'EX003';
  end if;
  select max(s.time_limit_sec) filter (where s.kind = 'listening'), max(s.time_limit_sec) filter (where s.kind = 'reading') into listening, reading
  from public.exam_sections s where s.exam_id = p_exam_id;

  insert into public.exam_attempts (exam_id, profile_id, current_section, section_deadlines, first_attempt)
  values (
    p_exam_id, me.profile_id, 'listening',
    -- Reading starts when listening ends: at its deadline, unless it is handed in sooner.
    jsonb_build_object('listening', now() + make_interval(secs => listening), 'reading', now() + make_interval(secs => listening + reading)),
    not exists (select 1 from public.exam_attempts o where o.exam_id = p_exam_id and o.profile_id = me.profile_id and o.status <> 'in_progress')
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.start_exam(uuid) from public, anon;
grant execute on function public.start_exam(uuid) to authenticated;

-- A choice without anything a file name would give away.
create function public.exam_public_options(p_options jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text', 'image_path', o ->> 'image_path') order by position)
  from jsonb_array_elements(p_options) with ordinality as options (o, position);
$$;

-- What the player may know about their attempt now. In progress: the current
-- section's passages and questions, without any answer. Over: the result and
-- the review.
create function public.exam_state(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.exam_attempts;
  e record;
  section record;
  state jsonb;
  total integer;
  asked integer;
begin
  a := public.exam_my_attempt(p_attempt_id);
  select x.id, x.title, x.level, x.audio_max_plays, x.level_thresholds into e from public.exams x where x.id = a.exam_id;

  state := jsonb_build_object(
    'attempt_id', a.id, 'status', a.status, 'server_now', now(), 'started_at', a.started_at,
    'exam', jsonb_build_object('id', e.id, 'title', e.title, 'level', e.level, 'audio_max_plays', e.audio_max_plays),
    'sections', (select jsonb_agg(jsonb_build_object('kind', s.kind, 'question_count', s.question_count, 'time_limit_sec', s.time_limit_sec) order by s.position)
                 from public.exam_sections s where s.exam_id = a.exam_id),
    'current_section', a.current_section,
    'deadline', case when a.current_section is null then null else a.section_deadlines ->> a.current_section::text end,
    'passages', null, 'questions', null, 'result', null
  );

  if a.status = 'in_progress' then
    select s.id into section from public.exam_sections s where s.exam_id = a.exam_id and s.kind = a.current_section;
    return state || jsonb_build_object(
      'passages', coalesce((
        select jsonb_agg(jsonb_build_object(
          -- What a recording says is for the review: never sent while it is being listened to.
          'id', p.id, 'kind', p.kind, 'text', case when p.kind = 'text' then p.text end,
          'image_path', p.image_path, 'audio_path', p.audio_path,
          -- How many times this audio can still be started.
          'plays_left', case when p.kind = 'audio' then greatest(0, e.audio_max_plays - coalesce((
            select sum(x.audio_plays) from public.exam_answers x join public.exam_questions q on q.id = x.question_id
            where x.attempt_id = a.id and q.passage_id = p.id), 0))::integer end
        ) order by p.position)
        from public.exam_passages p where p.section_id = section.id
      ), '[]'::jsonb),
      'questions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', q.id, 'position', q.position, 'passage_id', q.passage_id, 'prompt', q.prompt,
          'options', public.exam_public_options(q.options),
          'your_option', x.option_id, 'flagged', coalesce(x.flagged, false)
        ) order by q.position)
        from public.exam_questions q
        left join public.exam_answers x on x.attempt_id = a.id and x.question_id = q.id
        where q.section_id = section.id
      ), '[]'::jsonb)
    );
  end if;

  total := coalesce(a.correct_listening, 0) + coalesce(a.correct_reading, 0);
  select sum(s.question_count) into asked from public.exam_sections s where s.exam_id = a.exam_id;
  return state || jsonb_build_object('result', jsonb_build_object(
    'correct_listening', coalesce(a.correct_listening, 0),
    'correct_reading', coalesce(a.correct_reading, 0),
    'correct', total,
    'questions', asked,
    'coins', a.coins,
    'coins_locked', a.coins_locked,
    'first_attempt', a.first_attempt,
    -- A practice estimate, and only when the exam has thresholds.
    'estimated_level', public.exam_estimate(e.level_thresholds, total),
    'review', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'section', s.kind, 'position', q.position, 'passage_id', q.passage_id, 'prompt', q.prompt,
        'options', public.exam_public_options(q.options),
        'correct_option_id', q.correct_option_id, 'explanation', q.explanation,
        'your_option', x.option_id
      ) order by s.position, q.position)
      from public.exam_questions q
      join public.exam_sections s on s.id = q.section_id
      left join public.exam_answers x on x.attempt_id = a.id and x.question_id = q.id
      where s.exam_id = a.exam_id
    ), '[]'::jsonb),
    'passages', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'text', p.text, 'image_path', p.image_path, 'audio_path', p.audio_path) order by p.position)
      from public.exam_passages p where p.exam_id = a.exam_id
    ), '[]'::jsonb)
  ));
end;
$$;

revoke execute on function public.exam_state(uuid) from public, anon;
grant execute on function public.exam_state(uuid) to authenticated;

-- A question of the attempt's current section, or null.
create function public.exam_open_question(p_attempt public.exam_attempts, p_question_id uuid)
returns public.exam_questions
language sql
stable
security definer
set search_path = ''
as $$
  select q from public.exam_questions q
  join public.exam_sections s on s.id = q.section_id
  where q.id = p_question_id and s.exam_id = p_attempt.exam_id and s.kind = p_attempt.current_section;
$$;

revoke execute on function public.exam_open_question(public.exam_attempts, uuid) from public, anon, authenticated;

-- Chooses an answer (null clears it) and, when given, sets or clears the flag.
-- Answers { saved: true } or { saved: false, reason: over | closed | invalid },
-- with the attempt's status and current section either way.
create function public.answer_exam(p_attempt_id uuid, p_question_id uuid, p_option_id text, p_flagged boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.exam_attempts;
  q public.exam_questions;
  reason text;
begin
  a := public.exam_my_attempt(p_attempt_id);
  if a.status <> 'in_progress' then
    reason := 'over';
  else
    q := public.exam_open_question(a, p_question_id);
    if q.id is null then
      -- Another section's question: listening is closed once reading has begun.
      reason := 'closed';
    elsif p_option_id is not null and not exists (select 1 from jsonb_array_elements(q.options) o where o ->> 'id' = p_option_id) then
      reason := 'invalid';
    else
      insert into public.exam_answers (attempt_id, question_id, option_id, flagged, answered_at)
      values (a.id, q.id, p_option_id, coalesce(p_flagged, false), case when p_option_id is null then null else now() end)
      on conflict (attempt_id, question_id) do update
        set option_id = excluded.option_id,
            flagged = coalesce(p_flagged, public.exam_answers.flagged),
            answered_at = excluded.answered_at;
    end if;
  end if;
  return jsonb_build_object('saved', reason is null, 'reason', reason, 'status', a.status, 'current_section', a.current_section);
end;
$$;

revoke execute on function public.answer_exam(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.answer_exam(uuid, uuid, text, boolean) to authenticated;

-- The player starts a question's audio. Counted here; past the exam's limit
-- the answer is { allowed: false } and nothing is counted.
create function public.record_audio_play(p_attempt_id uuid, p_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.exam_attempts;
  q public.exam_questions;
  allowed_plays integer;
  played integer;
begin
  a := public.exam_my_attempt(p_attempt_id);
  if a.status <> 'in_progress' then
    return jsonb_build_object('allowed', false, 'reason', 'over', 'plays_left', 0);
  end if;
  q := public.exam_open_question(a, p_question_id);
  if q.id is null or q.passage_id is null or not exists (select 1 from public.exam_passages p where p.id = q.passage_id and p.kind = 'audio') then
    return jsonb_build_object('allowed', false, 'reason', 'closed', 'plays_left', 0);
  end if;
  -- One count at a time per attempt: two taps cannot both slip under the limit.
  perform 1 from public.exam_attempts x where x.id = a.id for update;
  select e.audio_max_plays into allowed_plays from public.exams e where e.id = a.exam_id;
  -- A recording shared by several questions has one count.
  select coalesce(sum(x.audio_plays), 0) into played
  from public.exam_answers x join public.exam_questions other on other.id = x.question_id
  where x.attempt_id = a.id and other.passage_id = q.passage_id;
  if played >= allowed_plays then
    return jsonb_build_object('allowed', false, 'reason', 'limit', 'plays_left', 0);
  end if;
  insert into public.exam_answers (attempt_id, question_id, audio_plays) values (a.id, q.id, 1)
  on conflict (attempt_id, question_id) do update set audio_plays = public.exam_answers.audio_plays + 1;
  return jsonb_build_object('allowed', true, 'reason', null, 'plays_left', allowed_plays - played - 1);
end;
$$;

revoke execute on function public.record_audio_play(uuid, uuid) from public, anon;
grant execute on function public.record_audio_play(uuid, uuid) to authenticated;

-- Hands in the current section. Listening: reading starts now, with its full
-- time. Reading: the attempt is finished. Returns the state.
create function public.submit_section(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.exam_attempts;
  reading integer;
begin
  a := public.exam_my_attempt(p_attempt_id);
  if a.status = 'in_progress' and a.current_section = 'listening' then
    select s.time_limit_sec into reading from public.exam_sections s where s.exam_id = a.exam_id and s.kind = 'reading';
    update public.exam_attempts
    set current_section = 'reading',
        section_deadlines = jsonb_build_object('listening', now(), 'reading', now() + make_interval(secs => reading))
    where id = a.id;
  elsif a.status = 'in_progress' then
    perform public.exam_finish(a.id, 'submitted');
  end if;
  return public.exam_state(p_attempt_id);
end;
$$;

revoke execute on function public.submit_section(uuid) from public, anon;
grant execute on function public.submit_section(uuid) to authenticated;

-- Ends the attempt now, whatever is left. Returns the state with the result.
create function public.finish_exam(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.exam_attempts;
begin
  a := public.exam_my_attempt(p_attempt_id);
  if a.status = 'in_progress' then
    perform public.exam_finish(a.id, 'submitted');
  end if;
  return public.exam_state(p_attempt_id);
end;
$$;

revoke execute on function public.finish_exam(uuid) from public, anon;
grant execute on function public.finish_exam(uuid) to authenticated;
