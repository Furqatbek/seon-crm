-- The 1v1 game: question banks, matchmaking and the engine.
-- docs/STUDENT_APP_SPEC.md → "Rules → 1v1 game", "Data model" (1V1 GAME).
--
-- The server decides everything. A player never reads the questions table or
-- anyone's answers: match_state() hands out the current question without its
-- answer, and the answer of a question only once that question is over.
--
-- Banks. A bank is a (subject, level) pair of questions. A student plays the
-- bank of the group they chose in the lobby: a group whose level, subject or
-- name says TOPIK I / TOPIK II plays the bank ('TOPIK', 'topik1' | 'topik2');
-- any other group plays (its subject, its level). An App user plays the TOPIK
-- bank of their profile level: Beginner and TOPIK I → topik1, TOPIK II → topik2.
--
-- A match. 10 questions; the first is shown 3 seconds after the match is made
-- (the countdown), each for 10 seconds, with 2 seconds between them. The rope
-- runs from −5 to +5, positive towards player A:
--   * a correct answer in time pulls 1 step;
--   * when both are correct the faster pulls 1 more (the same time: neither);
--   * wrong, late or no answer pulls nothing.
-- So one question moves the rope by at most 1. ±5 wins at once; after the
-- 10th question the side the rope is on wins; dead centre is a draw.
-- 20 seconds without a heartbeat forfeits. A job closes abandoned matches.
--
-- Coins. Only when both players are linked students (coins_eligible), only to
-- the winner, within game_daily_rewarded_wins a day and game_pair_daily_cap
-- rewarded games a day between the same two. Practice never pays.
--
-- Errors: EG001 the bank has too few questions · EG002 already in a match ·
-- EG003 the invite is no longer open · EG004 not a classmate who can be
-- challenged · EG005 practice opens after 30 seconds of waiting.

create type public.match_kind as enum ('random', 'friend', 'practice');
create type public.match_status as enum ('countdown', 'playing', 'finished', 'cancelled');
create type public.match_winner as enum ('a', 'b', 'draw');
create type public.match_player as enum ('a', 'b');
create type public.invite_status as enum ('pending', 'accepted', 'declined', 'expired');

-- ───────────────────────────── Questions ──────────────────────────────

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (btrim(subject) <> '' and length(subject) <= 80),
  -- '' when the group it is for has no level.
  level text not null default '' check (length(level) <= 80),
  -- The language the question is written in.
  language text not null default 'uz' check (language in ('uz', 'ru', 'en', 'ko')),
  text text not null check (btrim(text) <> '' and length(text) <= 500),
  -- The object's name in the question-images bucket.
  image_path text,
  -- [{ "id": "a", "text": "…" }, …]: two to four choices.
  options jsonb not null,
  correct_option_id text not null,
  explanation text,
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  is_active boolean not null default true,
  -- How many times a player was shown it, and how many of those answered right.
  times_used integer not null default 0 check (times_used >= 0),
  times_correct integer not null default 0 check (times_correct >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_options_shape check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4
  )
);

create index questions_bank_idx on public.questions (subject, level) where is_active and archived_at is null;

create trigger set_updated_at before update on public.questions
  for each row execute function public.set_updated_at();

-- The choices are well formed and the right one is among them.
create function public.questions_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ids text[];
begin
  if jsonb_typeof(new.options) is distinct from 'array' then
    raise exception 'The choices must be a list' using errcode = '23514';
  end if;
  select array_agg(o ->> 'id') into ids from jsonb_array_elements(new.options) o;
  if exists (
    select 1 from jsonb_array_elements(new.options) o
    where jsonb_typeof(o) <> 'object' or coalesce(btrim(o ->> 'id'), '') = '' or coalesce(btrim(o ->> 'text'), '') = '' or length(o ->> 'text') > 200
  ) or (select count(distinct id) from unnest(ids) id) <> cardinality(ids) then
    raise exception 'Each choice needs its own id and a text' using errcode = '23514';
  end if;
  if not new.correct_option_id = any (ids) then
    raise exception 'The right answer must be one of the choices' using errcode = '23514';
  end if;
  new.subject := btrim(new.subject);
  new.level := btrim(new.level);
  return new;
end;
$$;

create trigger questions_check before insert or update on public.questions
  for each row execute function public.questions_check();

-- Which bank a group plays.
create function public.game_bank_of(p_subject text, p_level text, p_name text)
returns table (subject text, level text)
language sql
immutable
set search_path = ''
as $$
  select case when t.topik is null then btrim(p_subject) else 'TOPIK' end,
         coalesce(t.topik, btrim(coalesce(p_level, '')))
  from (
    select (
      select case when part ~* 'topik\s*(ii|2)' then 'topik2' when part ~* 'topik\s*(i|1)' then 'topik1' end
      from unnest(array[p_level, p_subject, p_name]) with ordinality as parts (part, position)
      where part ~* 'topik\s*(i|1|2)'
      order by position
      limit 1
    ) as topik
  ) t;
$$;

-- The subjects a teacher writes questions for: those of their groups' banks
-- and the ones on their own card.
create function public.my_question_subjects()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select b.subject
  from public.groups g, public.game_bank_of(g.subject, g.level, g.name) b
  where g.teacher_id = public.my_teacher_id() and g.archived_at is null
  union
  select btrim(s)
  from public.teachers t, unnest(t.subjects) s
  where t.id = public.my_teacher_id() and btrim(s) <> '';
$$;

revoke execute on function public.my_question_subjects() from public, anon;
grant execute on function public.my_question_subjects() to authenticated;

-- Every bank there is: the two TOPIK banks, each running group's bank and any
-- bank that already has questions, with how many active questions it holds.
create function public.game_banks()
returns table (subject text, level text, active_questions integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_staff() or public.my_teacher_id() is not null) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  with banks as (
    select 'TOPIK'::text as subject, 'topik1'::text as level
    union select 'TOPIK', 'topik2'
    union select b.subject, b.level from public.groups g, public.game_bank_of(g.subject, g.level, g.name) b where g.archived_at is null
    union select q.subject, q.level from public.questions q where q.archived_at is null
  )
  select b.subject, b.level,
         (select count(*)::integer from public.questions q where q.subject = b.subject and q.level = b.level and q.is_active and q.archived_at is null)
  from banks b
  where public.is_staff() or b.subject in (select public.my_question_subjects())
  order by b.subject, b.level;
end;
$$;

revoke execute on function public.game_banks() from public, anon;
grant execute on function public.game_banks() to authenticated;

-- Who may change what. Teachers write and edit the questions of their own
-- subjects; switching one on or off is staff's; archiving is the owner's.
-- Nobody sets the counters or the author by hand.
create function public.guard_question()
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
    new.times_used := 0;
    new.times_correct := 0;
    new.archived_at := null;
    if not public.is_staff() then
      new.is_active := true;
    end if;
    return new;
  end if;
  new.created_by := old.created_by;
  new.times_used := old.times_used;
  new.times_correct := old.times_correct;
  if new.archived_at is distinct from old.archived_at and not public.is_owner() then
    raise exception 'Only the owner archives' using errcode = '42501';
  end if;
  if new.is_active is distinct from old.is_active and not public.is_staff() then
    raise exception 'Only the owner and managers switch a question on or off' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_question before insert or update on public.questions
  for each row execute function public.guard_question();

alter table public.questions enable row level security;

revoke all on public.questions from public, anon, authenticated;
grant select, insert, update on public.questions to authenticated;

-- Staff see every question; a teacher those of their subjects. Students,
-- App users and a kiosk see none: a match shows them one at a time.
create policy questions_select on public.questions
  for select to authenticated
  using (
    (select public.is_staff())
    or ((select public.my_teacher_id()) is not null and archived_at is null and subject in (select public.my_question_subjects()))
  );

create policy questions_insert on public.questions
  for insert to authenticated
  with check (
    (select public.is_staff())
    or ((select public.my_teacher_id()) is not null and subject in (select public.my_question_subjects()))
  );

create policy questions_update on public.questions
  for update to authenticated
  using (
    (select public.is_staff())
    or ((select public.my_teacher_id()) is not null and archived_at is null and subject in (select public.my_question_subjects()))
  )
  with check (
    (select public.is_staff())
    or ((select public.my_teacher_id()) is not null and subject in (select public.my_question_subjects()))
  );

-- What each import did: the file, how many rows it had, how many questions
-- it made, and the rows that were left out with the reason.
create table public.question_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (btrim(file_name) <> ''),
  rows integer not null check (rows >= 0),
  created integer not null check (created >= 0),
  errors jsonb not null default '[]'::jsonb,
  imported_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.question_imports enable row level security;

revoke all on public.question_imports from public, anon, authenticated;
grant select, insert on public.question_imports to authenticated;

create policy question_imports_select on public.question_imports
  for select to authenticated using ((select public.is_staff()));

create policy question_imports_insert on public.question_imports
  for insert to authenticated with check ((select public.is_staff()) and imported_by = (select auth.uid()));

-- Pictures in questions: staff and teachers add them; anyone signed in to
-- the centre or the app may look (a picture is not an answer).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy question_images_read on storage.objects
  for select to authenticated
  using (bucket_id = 'question-images' and (select public.app_role()) in ('owner', 'manager', 'teacher', 'student', 'app_user'));

create policy question_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'question-images' and (select public.app_role()) in ('owner', 'manager', 'teacher'));

-- ─────────────────────── Queue, invites, matches ──────────────────────

create table public.match_queue (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  subject text not null,
  level text not null,
  group_id uuid references public.groups (id),
  joined_at timestamptz not null default now()
);

create index match_queue_bank_idx on public.match_queue (subject, level, joined_at);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  kind public.match_kind not null,
  subject text not null,
  level text not null,
  player_a uuid not null references public.profiles (id) on delete cascade,
  -- null = the computer.
  player_b uuid references public.profiles (id) on delete cascade,
  -- The group each chose in the lobby: a win's coins are written under it.
  group_a uuid references public.groups (id),
  group_b uuid references public.groups (id),
  coins_eligible boolean not null default false,
  status public.match_status not null default 'countdown',
  question_ids uuid[] not null check (cardinality(question_ids) = 10),
  current_index smallint not null default 0 check (current_index between 0 and 9),
  -- When the current question is, or will be, shown.
  question_started_at timestamptz not null,
  -- Positive towards player A.
  rope smallint not null default 0 check (rope between -5 and 5),
  winner public.match_winner,
  -- Whoever stopped answering the server for 20 seconds, when that ended it.
  forfeited_by public.match_player,
  rewarded boolean not null default false,
  last_seen_a timestamptz not null default now(),
  last_seen_b timestamptz not null default now(),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint matches_practice_has_no_opponent check ((kind = 'practice') = (player_b is null)),
  constraint matches_two_players check (player_b is null or player_b <> player_a),
  constraint matches_finished_shape check ((status in ('finished', 'cancelled')) = (finished_at is not null)),
  constraint matches_winner_shape check (winner is null or status = 'finished')
);

create index matches_player_a_idx on public.matches (player_a, created_at desc);
create index matches_player_b_idx on public.matches (player_b, created_at desc) where player_b is not null;
create index matches_open_idx on public.matches (status) where status in ('countdown', 'playing');

create table public.match_invites (
  id uuid primary key default gen_random_uuid(),
  from_profile uuid not null references public.profiles (id) on delete cascade,
  to_profile uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  level text not null,
  group_id uuid not null references public.groups (id),
  expires_at timestamptz not null,
  status public.invite_status not null default 'pending',
  -- The match an accepted invite became.
  match_id uuid references public.matches (id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_profile <> to_profile)
);

create index match_invites_to_idx on public.match_invites (to_profile, status);
create index match_invites_from_idx on public.match_invites (from_profile, status);

create table public.match_answers (
  match_id uuid not null references public.matches (id) on delete cascade,
  player public.match_player not null,
  question_index smallint not null check (question_index between 0 and 9),
  option_id text not null,
  is_correct boolean not null,
  answered_at timestamptz not null,
  ms_taken integer not null check (ms_taken >= 0),
  primary key (match_id, player, question_index)
);

alter table public.match_queue enable row level security;
alter table public.matches enable row level security;
alter table public.match_invites enable row level security;
alter table public.match_answers enable row level security;

-- Nothing is written here directly, and the queue and the answers are not
-- read directly either: an opponent's answer would give the question away.
revoke all on public.match_queue, public.matches, public.match_invites, public.match_answers from public, anon, authenticated;
grant select on public.matches, public.match_invites to authenticated;

-- A player follows their own matches and invites live. A match row holds no
-- question text and no answer.
create policy matches_select on public.matches
  for select to authenticated
  using (player_a = (select auth.uid()) or player_b = (select auth.uid()));

create policy match_invites_select on public.match_invites
  for select to authenticated
  using (from_profile = (select auth.uid()) or to_profile = (select auth.uid()));

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['matches', 'match_invites'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- ──────────────────────────── Who is playing ──────────────────────────

-- The signed-in player, or an error: a linked student or an App user.
create function public.game_player(out profile_id uuid, out is_student boolean, out student_id uuid, out korean_level public.korean_level)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select p.id, p.role = 'student', p.student_id, p.korean_level
  into profile_id, is_student, student_id, korean_level
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active and p.role in ('student', 'app_user')
    and (p.role = 'app_user' or p.student_id is not null);
  if profile_id is null then
    raise exception 'The game is for students and app users' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.game_player() from public, anon, authenticated;

-- The bank the caller plays: a student's from the group they chose, an App
-- user's from their level. Internal.
create function public.game_my_bank(p_group_id uuid, out subject text, out level text, out group_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me record;
begin
  me := public.game_player();
  if me.is_student then
    select b.subject, b.level, g.id into subject, level, group_id
    from public.groups g, public.game_bank_of(g.subject, g.level, g.name) b
    where g.id = p_group_id and g.id in (select public.my_group_ids());
    if group_id is null then
      raise exception 'Choose one of your groups' using errcode = '42501';
    end if;
  else
    subject := 'TOPIK';
    level := case when me.korean_level = 'topik2' then 'topik2' else 'topik1' end;
    group_id := null;
  end if;
end;
$$;

revoke execute on function public.game_my_bank(uuid) from public, anon, authenticated;

create function public.game_bank_size(p_subject text, p_level text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.questions q
  where q.subject = p_subject and q.level = p_level and q.is_active and q.archived_at is null;
$$;

revoke execute on function public.game_bank_size(text, text) from public, anon, authenticated;

-- The match a player is in now, if any.
create function public.game_active_match(p_profile_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.matches m
  where m.status in ('countdown', 'playing') and (m.player_a = p_profile_id or m.player_b = p_profile_id)
  order by m.created_at desc
  limit 1;
$$;

revoke execute on function public.game_active_match(uuid) from public, anon, authenticated;

-- ────────────────────────────── The engine ────────────────────────────

-- How far one question pulls the rope towards A (−1, 0 or 1).
create function public.game_pull(p_a_correct boolean, p_a_ms integer, p_b_correct boolean, p_b_ms integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_a_correct, false) and coalesce(p_b_correct, false) then
      -- Each pulls 1; the faster pulls 1 more.
      case when p_a_ms < p_b_ms then 1 when p_b_ms < p_a_ms then -1 else 0 end
    when coalesce(p_a_correct, false) then 1
    when coalesce(p_b_correct, false) then -1
    else 0
  end;
$$;

-- The computer's answer to a question: right 60% of the time, 3–8 seconds in.
create function public.game_computer_answer(p_match_id uuid, p_index integer, p_question_id uuid, p_shown_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q record;
  right_one boolean := random() < 0.6;
  ms integer := 3000 + floor(random() * 5001)::integer;
  choice text;
begin
  select qq.options, qq.correct_option_id into q from public.questions qq where qq.id = p_question_id;
  if right_one then
    choice := q.correct_option_id;
  else
    select o ->> 'id' into choice from jsonb_array_elements(q.options) o where o ->> 'id' <> q.correct_option_id order by random() limit 1;
  end if;
  insert into public.match_answers (match_id, player, question_index, option_id, is_correct, answered_at, ms_taken)
  values (p_match_id, 'b', p_index, choice, right_one, p_shown_at + make_interval(secs => ms / 1000.0), ms)
  on conflict do nothing;
end;
$$;

revoke execute on function public.game_computer_answer(uuid, integer, uuid, timestamptz) from public, anon, authenticated;

-- A new match: 10 active questions of the bank, those neither player was
-- shown in the last 7 days first. Internal.
create function public.game_create_match(
  p_kind public.match_kind, p_subject text, p_level text,
  p_a uuid, p_b uuid, p_group_a uuid, p_group_b uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  seen uuid[];
  drawn uuid[];
  eligible boolean;
  first_at timestamptz := now() + interval '3 seconds';
  new_id uuid;
begin
  select coalesce(array_agg(distinct shown.id), '{}') into seen
  from public.matches m, unnest(m.question_ids[1 : m.current_index + 1]) as shown (id)
  where m.created_at > now() - interval '7 days'
    and (m.player_a in (p_a, p_b) or m.player_b in (p_a, p_b));

  select array_agg(x.id) into drawn
  from (
    select q.id from public.questions q
    where q.subject = p_subject and q.level = p_level and q.is_active and q.archived_at is null
    order by (q.id = any (seen)), random()
    limit 10
  ) x;
  if drawn is null or cardinality(drawn) < 10 then
    raise exception 'This subject does not have enough questions yet' using errcode = 'EG001';
  end if;

  -- Coins are possible only between two linked students.
  select p_kind <> 'practice' and count(*) = 2 into eligible
  from public.profiles p
  where p.id in (p_a, p_b) and p.role = 'student' and p.student_id is not null and p.is_active;

  insert into public.matches (kind, subject, level, player_a, player_b, group_a, group_b, coins_eligible, question_ids, question_started_at)
  values (p_kind, p_subject, p_level, p_a, p_b, p_group_a, p_group_b, eligible, drawn, first_at)
  returning id into new_id;

  if p_b is null then
    perform public.game_computer_answer(new_id, 0, drawn[1], first_at);
  end if;
  -- Neither waits in the queue any more.
  delete from public.match_queue where profile_id in (p_a, p_b);
  return new_id;
end;
$$;

revoke execute on function public.game_create_match(public.match_kind, text, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Ends a match and pays the winner when the rules allow it. Internal.
create function public.game_finish(p_match_id uuid, p_winner public.match_winner, p_forfeited_by public.match_player default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  settings record;
  winner_profile uuid;
  loser_profile uuid;
  winner_student uuid;
  day_start timestamptz := (public.tashkent_today()::timestamp at time zone 'Asia/Tashkent');
  wins_today integer;
  pair_today integer;
  pay boolean := false;
begin
  select * into m from public.matches where id = p_match_id for update;
  if m.status in ('finished', 'cancelled') then
    return;
  end if;

  if p_winner in ('a', 'b') and m.coins_eligible and m.kind <> 'practice' then
    winner_profile := case when p_winner = 'a' then m.player_a else m.player_b end;
    loser_profile := case when p_winner = 'a' then m.player_b else m.player_a end;
    select s.enabled, s.game_win_coins, s.game_daily_rewarded_wins, s.game_pair_daily_cap into settings from public.points_settings s;
    -- Still a linked student now, and the other one too.
    select p.student_id into winner_student from public.profiles p where p.id = winner_profile and p.role = 'student' and p.is_active;
    if winner_student is not null and settings.enabled and settings.game_win_coins > 0
       and exists (select 1 from public.profiles p where p.id = loser_profile and p.role = 'student' and p.student_id is not null) then
      -- One finish at a time per winner: two matches ending together cannot both slip under the limit.
      perform 1 from public.students s where s.id = winner_student and s.archived_at is null for update;
      if found then
        select count(*) into wins_today from public.points_ledger l
        where l.student_id = winner_student and l.source = 'game_win' and l.created_at >= day_start;
        select count(*) into pair_today from public.matches o
        where o.rewarded and o.finished_at >= day_start
          and ((o.player_a = m.player_a and o.player_b = m.player_b) or (o.player_a = m.player_b and o.player_b = m.player_a));
        pay := wins_today < settings.game_daily_rewarded_wins and pair_today < settings.game_pair_daily_cap;
      end if;
    end if;
    if pay then
      insert into public.points_ledger (student_id, delta, source, group_id, dedupe_key)
      values (winner_student, settings.game_win_coins, 'game_win', case when p_winner = 'a' then m.group_a else m.group_b end, 'game:' || m.id)
      on conflict (dedupe_key) do nothing;
    end if;
  end if;

  update public.matches
  set status = 'finished', winner = p_winner, forfeited_by = p_forfeited_by, rewarded = pay, finished_at = now()
  where id = p_match_id;
end;
$$;

revoke execute on function public.game_finish(uuid, public.match_winner, public.match_player) from public, anon, authenticated;

-- Moves a match on as far as the clock allows: forfeits a player who went
-- silent, starts the first question, settles a question that both answered
-- or whose 10 seconds are up, and shows the next or ends the match. Internal;
-- every public function calls it, so whoever is still there keeps it going.
create function public.game_tick(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  a record;
  b record;
  a_gone boolean;
  b_gone boolean;
  pull integer;
  new_rope integer;
  next_at timestamptz;
begin
  loop
    select * into m from public.matches where id = p_match_id for update;
    if not found or m.status in ('finished', 'cancelled') then
      return;
    end if;

    -- 20 seconds without a heartbeat forfeits.
    a_gone := m.last_seen_a < now() - interval '20 seconds';
    b_gone := m.player_b is not null and m.last_seen_b < now() - interval '20 seconds';
    if a_gone and (b_gone or m.player_b is null) then
      update public.matches set status = 'cancelled', finished_at = now() where id = p_match_id;
      return;
    elsif a_gone then
      perform public.game_finish(p_match_id, 'b', 'a');
      return;
    elsif b_gone then
      perform public.game_finish(p_match_id, 'a', 'b');
      return;
    end if;

    -- The countdown, or the pause between two questions.
    if now() < m.question_started_at then
      return;
    end if;
    if m.status = 'countdown' then
      update public.matches set status = 'playing' where id = p_match_id;
    end if;

    -- An answer counts once its moment has come: the computer's is written ahead.
    select * into a from public.match_answers x where x.match_id = p_match_id and x.player = 'a' and x.question_index = m.current_index and x.answered_at <= now();
    select * into b from public.match_answers x where x.match_id = p_match_id and x.player = 'b' and x.question_index = m.current_index and x.answered_at <= now();
    if not (a.match_id is not null and b.match_id is not null) and now() < m.question_started_at + interval '10 seconds' then
      return;
    end if;

    -- The question is over.
    pull := public.game_pull(a.is_correct, a.ms_taken, b.is_correct, b.ms_taken);
    new_rope := greatest(-5, least(5, m.rope + pull));
    update public.questions q
    set times_used = q.times_used + 1 + (m.player_b is not null)::integer,
        times_correct = q.times_correct + coalesce(a.is_correct, false)::integer + (m.player_b is not null and coalesce(b.is_correct, false))::integer
    where q.id = m.question_ids[m.current_index + 1];

    if abs(new_rope) >= 5 or m.current_index >= 9 then
      update public.matches set rope = new_rope where id = p_match_id;
      perform public.game_finish(p_match_id, case when new_rope > 0 then 'a' when new_rope < 0 then 'b' else 'draw' end::public.match_winner);
      return;
    end if;

    next_at := now() + interval '2 seconds';
    update public.matches
    set rope = new_rope, current_index = m.current_index + 1, question_started_at = next_at
    where id = p_match_id;
    if m.player_b is null then
      perform public.game_computer_answer(p_match_id, m.current_index + 1, m.question_ids[m.current_index + 2], next_at);
    end if;
    -- Round again: nothing more happens until the next question is shown.
  end loop;
end;
$$;

revoke execute on function public.game_tick(uuid) from public, anon, authenticated;

-- Which side of a match the caller is, or an error.
create function public.game_side(p_match_id uuid)
returns public.match_player
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  side public.match_player;
begin
  select case when m.player_a = (select auth.uid()) then 'a' when m.player_b = (select auth.uid()) then 'b' end::public.match_player
  into side from public.matches m where m.id = p_match_id;
  if side is null then
    raise exception 'Not your match' using errcode = '42501';
  end if;
  return side;
end;
$$;

revoke execute on function public.game_side(uuid) from public, anon, authenticated;

-- What a player may know about their match right now. The current question
-- comes without its answer; an answer is told only once its question is over.
create function public.match_state(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me public.match_player := public.game_side(p_match_id);
  m record;
  q record;
  mine record;
  theirs record;
  sign integer;
  over boolean;
  shown boolean;
  state jsonb;
  previous_index integer;
begin
  select * into m from public.matches where id = p_match_id;
  sign := case when me = 'a' then 1 else -1 end;
  over := m.status in ('finished', 'cancelled');
  shown := not over and now() >= m.question_started_at;

  state := jsonb_build_object(
    'id', m.id, 'kind', m.kind,
    -- The countdown is over the moment the first question is shown, whoever asks first.
    'status', case when shown and m.status = 'countdown' then 'playing' else m.status end,
    'subject', m.subject, 'level', m.level,
    'you', me,
    'opponent', jsonb_build_object(
      'computer', m.player_b is null,
      'name', (select public.tv_name(p.full_name) from public.profiles p where p.id = case when me = 'a' then m.player_b else m.player_a end)
    ),
    'coins_eligible', m.coins_eligible,
    -- Positive when the rope is on the caller's side.
    'rope', m.rope * sign,
    'total', cardinality(m.question_ids),
    'current_index', m.current_index,
    'server_now', now(),
    'question_started_at', m.question_started_at,
    'deadline', m.question_started_at + interval '10 seconds',
    'question', null,
    'answered', null,
    'previous', null,
    'result', null
  );

  if shown then
    select qq.text, qq.image_path, qq.options into q from public.questions qq where qq.id = m.question_ids[m.current_index + 1];
    select x.option_id, x.is_correct into mine from public.match_answers x where x.match_id = m.id and x.player = me and x.question_index = m.current_index;
    state := state || jsonb_build_object(
      'question', jsonb_build_object('index', m.current_index, 'text', q.text, 'image_path', q.image_path, 'options', q.options),
      'answered', jsonb_build_object(
        'you', mine.option_id is not null,
        'your_option', mine.option_id,
        -- Whether the other side has answered, never what.
        'opponent', exists (select 1 from public.match_answers x where x.match_id = m.id and x.player <> me and x.question_index = m.current_index and x.answered_at <= now())
      )
    );
  end if;

  -- The question before this one, or the last one of a finished match: now it can be told.
  previous_index := case when m.status = 'finished' then m.current_index when m.current_index > 0 then m.current_index - 1 end;
  if previous_index is not null and m.status <> 'cancelled' then
    select qq.correct_option_id into q from public.questions qq where qq.id = m.question_ids[previous_index + 1];
    select x.option_id, x.is_correct, x.ms_taken into mine from public.match_answers x where x.match_id = m.id and x.player = me and x.question_index = previous_index;
    select x.option_id, x.is_correct, x.ms_taken into theirs from public.match_answers x where x.match_id = m.id and x.player <> me and x.question_index = previous_index and x.answered_at <= now();
    state := state || jsonb_build_object('previous', jsonb_build_object(
      'index', previous_index,
      'correct_option_id', q.correct_option_id,
      'your_option', mine.option_id,
      'opponent_option', theirs.option_id,
      'pull', public.game_pull(mine.is_correct, mine.ms_taken, theirs.is_correct, theirs.ms_taken)
    ));
  end if;

  if m.status = 'finished' then
    state := state || jsonb_build_object('result', jsonb_build_object(
      'outcome', case when m.winner = 'draw' then 'draw' when m.winner::text = me::text then 'win' else 'loss' end,
      'forfeit', m.forfeited_by is not null,
      'rewarded', m.rewarded and m.winner::text = me::text,
      'coins', coalesce((select l.delta from public.points_ledger l where l.dedupe_key = 'game:' || m.id and m.winner::text = me::text), 0),
      -- Every question that was played, with the right answer and both answers.
      'review', coalesce((
        select jsonb_agg(jsonb_build_object(
          'index', played.position - 1,
          'text', qq.text, 'image_path', qq.image_path, 'options', qq.options,
          'correct_option_id', qq.correct_option_id, 'explanation', qq.explanation,
          'your_option', (select x.option_id from public.match_answers x where x.match_id = m.id and x.player = me and x.question_index = played.position - 1),
          'opponent_option', (select x.option_id from public.match_answers x where x.match_id = m.id and x.player <> me and x.question_index = played.position - 1 and x.answered_at <= m.finished_at)
        ) order by played.position)
        from unnest(m.question_ids[1 : m.current_index + 1]) with ordinality as played (id, position)
        join public.questions qq on qq.id = played.id
      ), '[]'::jsonb)
    ));
  end if;
  return state;
end;
$$;

revoke execute on function public.match_state(uuid) from public, anon;
grant execute on function public.match_state(uuid) to authenticated;

-- "I am still here." Also moves the match on. Returns the state.
create function public.heartbeat(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.match_player := public.game_side(p_match_id);
begin
  -- The other side is judged first: a player who comes back after 20 seconds has already lost.
  perform public.game_tick(p_match_id);
  update public.matches
  set last_seen_a = case when me = 'a' then now() else last_seen_a end,
      last_seen_b = case when me = 'b' then now() else last_seen_b end
  where id = p_match_id and status in ('countdown', 'playing');
  return public.match_state(p_match_id);
end;
$$;

revoke execute on function public.heartbeat(uuid) from public, anon;
grant execute on function public.heartbeat(uuid) to authenticated;

-- Called when a deadline has passed: settles the question and shows the next.
create function public.advance_match(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.game_side(p_match_id);
  perform public.game_tick(p_match_id);
  return public.match_state(p_match_id);
end;
$$;

revoke execute on function public.advance_match(uuid) from public, anon;
grant execute on function public.advance_match(uuid) to authenticated;

-- An answer to the question on screen. The server's clock decides whether it
-- is in time and how fast it was; the first answer to a question is the only one.
-- Answers: { accepted: true, is_correct } or { accepted: false, reason }, with
-- reason late | already | not_open | invalid, and the state either way.
create function public.submit_answer(p_match_id uuid, p_question_index integer, p_option_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.match_player := public.game_side(p_match_id);
  m record;
  q record;
  right_one boolean;
  written integer;
  answer jsonb;
begin
  -- Settles a question whose time is up before this answer is looked at.
  perform public.game_tick(p_match_id);
  -- One answer at a time per match: two taps cannot both be written.
  select * into m from public.matches where id = p_match_id for update;

  if m.status not in ('countdown', 'playing') or p_question_index is distinct from m.current_index then
    answer := jsonb_build_object('accepted', false, 'reason', case when m.status in ('finished', 'cancelled') or p_question_index < m.current_index then 'late' else 'not_open' end);
  elsif now() < m.question_started_at then
    answer := jsonb_build_object('accepted', false, 'reason', 'not_open');
  elsif now() > m.question_started_at + interval '10 seconds' then
    answer := jsonb_build_object('accepted', false, 'reason', 'late');
  else
    select qq.options, qq.correct_option_id into q from public.questions qq where qq.id = m.question_ids[m.current_index + 1];
    if p_option_id is null or not exists (select 1 from jsonb_array_elements(q.options) o where o ->> 'id' = p_option_id) then
      answer := jsonb_build_object('accepted', false, 'reason', 'invalid');
    else
      right_one := p_option_id = q.correct_option_id;
      insert into public.match_answers (match_id, player, question_index, option_id, is_correct, answered_at, ms_taken)
      values (p_match_id, me, m.current_index, p_option_id, right_one, now(),
              greatest(0, floor(extract(epoch from now() - m.question_started_at) * 1000)::integer))
      on conflict do nothing;
      get diagnostics written = row_count;
      if written = 0 then
        answer := jsonb_build_object('accepted', false, 'reason', 'already');
      else
        answer := jsonb_build_object('accepted', true, 'is_correct', right_one);
        -- Answering shows the player is there, and tells the other side's screen something changed.
        update public.matches
        set last_seen_a = case when me = 'a' then now() else last_seen_a end,
            last_seen_b = case when me = 'b' then now() else last_seen_b end
        where id = p_match_id;
        -- With both answers in, the question is settled at once.
        perform public.game_tick(p_match_id);
      end if;
    end if;
  end if;
  return answer || jsonb_build_object('state', public.match_state(p_match_id));
end;
$$;

revoke execute on function public.submit_answer(uuid, integer, text) from public, anon;
grant execute on function public.submit_answer(uuid, integer, text) to authenticated;

-- ───────────────────────────── Matchmaking ────────────────────────────

-- Play now. Pairs the caller with whoever has waited longest for the same
-- bank, or puts them in the queue. Answers { match_id } or { queued_at }.
create function public.join_queue(p_group_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record;
  bank record;
  active uuid;
  other record;
  mine timestamptz;
begin
  me := public.game_player();
  bank := public.game_my_bank(p_group_id);

  active := public.game_active_match(me.profile_id);
  if active is not null then
    perform public.game_tick(active);
    active := public.game_active_match(me.profile_id);
    if active is not null then
      return jsonb_build_object('match_id', active);
    end if;
  end if;

  -- Random matches open once the bank is big enough.
  if public.game_bank_size(bank.subject, bank.level) < (select s.game_min_questions from public.points_settings s) then
    raise exception 'This subject does not have enough questions yet' using errcode = 'EG001';
  end if;

  -- One pairing at a time per bank: two who join together meet each other.
  perform pg_advisory_xact_lock(hashtextextended('game:' || bank.subject || ':' || bank.level, 0));

  -- Whoever stopped asking two minutes ago has left.
  delete from public.match_queue where joined_at < now() - interval '2 minutes';

  select w.profile_id, w.group_id into other
  from public.match_queue w
  where w.subject = bank.subject and w.level = bank.level and w.profile_id <> me.profile_id
    and public.game_active_match(w.profile_id) is null
  order by w.joined_at
  limit 1
  for update;

  if found then
    -- The one who waited is player A.
    return jsonb_build_object('match_id', public.game_create_match('random', bank.subject, bank.level, other.profile_id, me.profile_id, other.group_id, bank.group_id));
  end if;

  insert into public.match_queue (profile_id, subject, level, group_id)
  values (me.profile_id, bank.subject, bank.level, bank.group_id)
  on conflict (profile_id) do update
    -- Asking again for the same bank keeps the place in the line; another bank starts again.
    set joined_at = case when match_queue.subject = excluded.subject and match_queue.level = excluded.level then match_queue.joined_at else now() end,
        subject = excluded.subject, level = excluded.level, group_id = excluded.group_id
  returning joined_at into mine;
  return jsonb_build_object('queued_at', mine, 'server_now', now());
end;
$$;

revoke execute on function public.join_queue(uuid) from public, anon;
grant execute on function public.join_queue(uuid) to authenticated;

create function public.leave_queue()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.match_queue where profile_id = (public.game_player()).profile_id;
end;
$$;

revoke execute on function public.leave_queue() from public, anon;
grant execute on function public.leave_queue() to authenticated;

-- After 30 seconds in the queue without an opponent: a match against the
-- computer, never for coins. Answers { match_id }.
create function public.start_practice()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record;
  waiting record;
  active uuid;
begin
  me := public.game_player();
  active := public.game_active_match(me.profile_id);
  if active is not null then
    return jsonb_build_object('match_id', active);
  end if;
  select w.subject, w.level, w.group_id, w.joined_at into waiting from public.match_queue w where w.profile_id = me.profile_id for update;
  if not found or waiting.joined_at > now() - interval '30 seconds' then
    raise exception 'Practice opens after 30 seconds of waiting' using errcode = 'EG005';
  end if;
  return jsonb_build_object('match_id', public.game_create_match('practice', waiting.subject, waiting.level, me.profile_id, null, waiting.group_id, null));
end;
$$;

revoke execute on function public.start_practice() from public, anon;
grant execute on function public.start_practice() to authenticated;

-- The classmates a student can challenge: linked students of the same group.
create function public.game_classmates(p_group_id uuid)
returns table (profile_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me record;
begin
  me := public.game_player();
  if not me.is_student or p_group_id is null or p_group_id not in (select public.my_group_ids()) then
    raise exception 'Choose one of your groups' using errcode = '42501';
  end if;
  return query
  select p.id, public.tv_name(s.full_name)
  from public.enrollments e
  join public.students s on s.id = e.student_id and s.archived_at is null
  join public.profiles p on p.student_id = s.id and p.role = 'student' and p.is_active
  where e.group_id = p_group_id and e.status = 'active' and p.id <> me.profile_id
  order by s.full_name, p.id;
end;
$$;

revoke execute on function public.game_classmates(uuid) from public, anon;
grant execute on function public.game_classmates(uuid) to authenticated;

-- Challenge a classmate: students only, open for 60 seconds. Returns the invite's id.
create function public.send_invite(p_to_profile uuid, p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record;
  bank record;
  new_id uuid;
begin
  me := public.game_player();
  if not me.is_student then
    raise exception 'Challenges are for students' using errcode = '42501';
  end if;
  bank := public.game_my_bank(p_group_id);
  if not exists (select 1 from public.game_classmates(p_group_id) c where c.profile_id = p_to_profile) then
    raise exception 'Only a classmate with the app can be challenged' using errcode = 'EG004';
  end if;
  if public.game_active_match(me.profile_id) is not null then
    raise exception 'You are in a match' using errcode = 'EG002';
  end if;
  if public.game_bank_size(bank.subject, bank.level) < 10 then
    raise exception 'This subject does not have enough questions yet' using errcode = 'EG001';
  end if;

  -- One open challenge at a time: a new one replaces the last.
  update public.match_invites set status = 'expired' where from_profile = me.profile_id and status = 'pending';
  insert into public.match_invites (from_profile, to_profile, subject, level, group_id, expires_at)
  values (me.profile_id, p_to_profile, bank.subject, bank.level, bank.group_id, now() + interval '60 seconds')
  returning id into new_id;
  delete from public.match_queue where profile_id = me.profile_id;
  return new_id;
end;
$$;

revoke execute on function public.send_invite(uuid, uuid) from public, anon;
grant execute on function public.send_invite(uuid, uuid) to authenticated;

-- Accept or decline a challenge. Accepting answers { match_id }.
create function public.answer_invite(p_invite_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record;
  invite record;
  new_match uuid;
begin
  me := public.game_player();
  select * into invite from public.match_invites i where i.id = p_invite_id and i.to_profile = me.profile_id for update;
  if not found then
    raise exception 'Not your invite' using errcode = '42501';
  end if;
  if invite.status <> 'pending' or invite.expires_at <= now() then
    update public.match_invites set status = 'expired' where id = p_invite_id and status = 'pending';
    -- Told as an answer, not an error: the expiry above must be kept.
    return jsonb_build_object('match_id', null, 'expired', true);
  end if;
  if not coalesce(p_accept, false) then
    update public.match_invites set status = 'declined' where id = p_invite_id;
    return jsonb_build_object('match_id', null);
  end if;
  if not me.is_student then
    raise exception 'Challenges are for students' using errcode = '42501';
  end if;
  if public.game_active_match(me.profile_id) is not null then
    raise exception 'You are in a match' using errcode = 'EG002';
  end if;
  -- The challenger went on to another match, or is no longer a classmate.
  if public.game_active_match(invite.from_profile) is not null
     or not exists (select 1 from public.game_classmates(invite.group_id) c where c.profile_id = invite.from_profile) then
    update public.match_invites set status = 'expired' where id = p_invite_id;
    return jsonb_build_object('match_id', null, 'expired', true);
  end if;

  new_match := public.game_create_match('friend', invite.subject, invite.level, invite.from_profile, me.profile_id, invite.group_id, invite.group_id);
  update public.match_invites set status = 'accepted', match_id = new_match where id = p_invite_id;
  return jsonb_build_object('match_id', new_match);
end;
$$;

revoke execute on function public.answer_invite(uuid, boolean) from public, anon;
grant execute on function public.answer_invite(uuid, boolean) to authenticated;

-- The lobby: whether the bank is open, today's rewarded wins, anything in
-- progress, challenges waiting, and the last 20 matches.
create function public.game_lobby(p_group_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me record;
  bank record;
  settings record;
  day_start timestamptz := (public.tashkent_today()::timestamp at time zone 'Asia/Tashkent');
  size integer;
begin
  me := public.game_player();
  bank := public.game_my_bank(p_group_id);
  select s.enabled, s.game_win_coins, s.game_daily_rewarded_wins, s.game_min_questions into settings from public.points_settings s;
  size := public.game_bank_size(bank.subject, bank.level);
  return jsonb_build_object(
    'subject', bank.subject,
    'level', bank.level,
    -- Play now needs the full bank; a challenge needs 10 questions.
    'random_open', size >= settings.game_min_questions,
    'challenge_open', me.is_student and size >= 10,
    -- An App user never wins coins.
    'coins', me.is_student and settings.enabled,
    'win_coins', settings.game_win_coins,
    'daily_rewarded_wins', settings.game_daily_rewarded_wins,
    'rewarded_wins_today', coalesce((
      select count(*) from public.points_ledger l
      where l.student_id = me.student_id and l.source = 'game_win' and l.created_at >= day_start
    ), 0),
    'active_match_id', public.game_active_match(me.profile_id),
    'queued_at', (select w.joined_at from public.match_queue w where w.profile_id = me.profile_id and w.joined_at >= now() - interval '2 minutes'),
    'server_now', now(),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'from', public.tv_name(p.full_name), 'subject', i.subject, 'level', i.level, 'expires_at', i.expires_at) order by i.created_at desc)
      from public.match_invites i
      join public.profiles p on p.id = i.from_profile
      where i.to_profile = me.profile_id and i.status = 'pending' and i.expires_at > now()
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(row_json order by finished_at desc)
      from (
        select m.finished_at, jsonb_build_object(
          'id', m.id, 'kind', m.kind, 'finished_at', m.finished_at,
          'opponent', (select public.tv_name(p.full_name) from public.profiles p where p.id = case when m.player_a = me.profile_id then m.player_b else m.player_a end),
          'computer', m.player_b is null,
          'outcome', case when m.winner = 'draw' then 'draw' when (m.winner = 'a') = (m.player_a = me.profile_id) then 'win' else 'loss' end,
          'coins', coalesce((select l.delta from public.points_ledger l where l.dedupe_key = 'game:' || m.id and l.student_id = me.student_id), 0)
        ) as row_json
        from public.matches m
        where m.status = 'finished' and (m.player_a = me.profile_id or m.player_b = me.profile_id)
        order by m.finished_at desc
        limit 20
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.game_lobby(uuid) from public, anon;
grant execute on function public.game_lobby(uuid) to authenticated;

-- Every minute: matches nobody is keeping alive are moved on (a silent
-- player forfeits; with both gone the match is cancelled), challenges past
-- their 60 seconds expire, and old queue places are dropped.
create function public.close_abandoned_matches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_match uuid;
  closed integer := 0;
begin
  for open_match in
    select m.id from public.matches m
    where m.status in ('countdown', 'playing')
      and (m.last_seen_a < now() - interval '20 seconds' or (m.player_b is not null and m.last_seen_b < now() - interval '20 seconds'))
  loop
    perform public.game_tick(open_match);
    closed := closed + 1;
  end loop;
  update public.match_invites set status = 'expired' where status = 'pending' and expires_at <= now();
  delete from public.match_queue where joined_at < now() - interval '2 minutes';
  return closed;
end;
$$;

revoke execute on function public.close_abandoned_matches() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('close-abandoned-matches', '* * * * *', 'select public.close_abandoned_matches()');
  end if;
end;
$$;
