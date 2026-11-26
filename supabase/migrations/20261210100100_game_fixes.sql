-- Fixes to the 1v1 game after review. docs/STUDENT_APP_SPEC.md → "Rules → 1v1 game".
--
-- 1. Which bank a group plays: TOPIK I / TOPIK II is read as a whole word, so
--    "TOPIK imtihoni" or "TOPIK IV" is no longer taken for TOPIK I.
-- 2. A place in the queue stays while its player keeps asking: freshness is
--    last_seen, refreshed by every join_queue; joined_at keeps the order and
--    the 30-second practice rule.
-- 3. One match at a time per player, even when two are made at the same moment.
-- 4. A question a match ended before showing is not reviewed and not counted
--    as seen; after a forfeit the last settled question is the "previous" one.

create or replace function public.game_bank_of(p_subject text, p_level text, p_name text)
returns table (subject text, level text)
language sql
immutable
set search_path = ''
as $$
  select case when t.topik is null then btrim(p_subject) else 'TOPIK' end,
         coalesce(t.topik, btrim(coalesce(p_level, '')))
  from (
    select (
      select case when part ~* 'topik\s*(ii|2)\M' then 'topik2' when part ~* 'topik\s*(i|1)\M' then 'topik1' end
      from unnest(array[p_level, p_subject, p_name]) with ordinality as parts (part, position)
      where part ~* 'topik\s*(ii|i|1|2)\M'
      order by position
      limit 1
    ) as topik
  ) t;
$$;


alter table public.match_queue add column last_seen timestamptz not null default now();

create or replace function public.game_create_match(
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
  -- One match at a time per player: two that are made for the same player at
  -- the same moment queue here, and the second finds the first.
  perform pg_advisory_xact_lock(hashtextextended('game:player:' || player.id::text, 0))
  from (select id from unnest(array[p_a, p_b]) as ids (id) where id is not null order by id) player;
  if public.game_active_match(p_a) is not null or (p_b is not null and public.game_active_match(p_b) is not null) then
    raise exception 'A player is already in a match' using errcode = 'EG002';
  end if;

  select coalesce(array_agg(distinct shown.id), '{}') into seen
  -- A question counts as seen once it was on screen: not one a match ended before showing.
  from public.matches m, unnest(m.question_ids[1 : m.current_index + (coalesce(m.finished_at, now()) >= m.question_started_at)::integer]) as shown (id)
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


create or replace function public.match_state(p_match_id uuid)
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
  played integer;
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
  -- A forfeit ends a match in the middle of a question, or before it was shown: that question was never settled.
  previous_index := case when m.status = 'finished' and m.forfeited_by is null then m.current_index when m.current_index > 0 then m.current_index - 1 end;
  played := m.current_index + (coalesce(m.finished_at, now()) >= m.question_started_at)::integer;
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
        from unnest(m.question_ids[1 : played]) with ordinality as played (id, position)
        join public.questions qq on qq.id = played.id
      ), '[]'::jsonb)
    ));
  end if;
  return state;
end;
$$;


create or replace function public.join_queue(p_group_id uuid default null)
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
  delete from public.match_queue where last_seen < now() - interval '2 minutes';

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
    set last_seen = now(),
        joined_at = case when match_queue.subject = excluded.subject and match_queue.level = excluded.level then match_queue.joined_at else now() end,
        subject = excluded.subject, level = excluded.level, group_id = excluded.group_id
  returning joined_at into mine;
  return jsonb_build_object('queued_at', mine, 'server_now', now());
end;
$$;


create or replace function public.game_lobby(p_group_id uuid default null)
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
    'queued_at', (select w.joined_at from public.match_queue w where w.profile_id = me.profile_id and w.last_seen >= now() - interval '2 minutes'),
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


create or replace function public.close_abandoned_matches()
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
  delete from public.match_queue where last_seen < now() - interval '2 minutes';
  return closed;
end;
$$;

