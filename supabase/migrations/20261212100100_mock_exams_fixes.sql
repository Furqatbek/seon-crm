-- Mock exams: fixes after review.

-- Unpublishing never pulls the questions from under a player: attempts whose
-- time has run out are closed first, and while anyone is still in the middle
-- of the exam it stays published.
create or replace function public.unpublish_exam(p_exam_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt record;
begin
  if not public.is_staff() then
    raise exception 'Only the owner and managers unpublish' using errcode = '42501';
  end if;
  perform 1 from public.exams e where e.id = p_exam_id and e.archived_at is null for update;
  if not found then
    raise exception 'No such exam' using errcode = 'P0002';
  end if;
  for attempt in select a.id from public.exam_attempts a where a.exam_id = p_exam_id and a.status = 'in_progress' loop
    perform public.exam_sync(attempt.id);
  end loop;
  if exists (select 1 from public.exam_attempts a where a.exam_id = p_exam_id and a.status = 'in_progress') then
    raise exception 'Someone is taking this exam now' using errcode = 'EX004';
  end if;
  update public.exams set status = 'draft' where id = p_exam_id;
end;
$$;

-- A question somebody has answered stays: the attempts' reviews are built from it.
alter table public.exam_answers
  drop constraint exam_answers_question_id_fkey,
  add constraint exam_answers_question_id_fkey foreign key (question_id) references public.exam_questions (id) on delete restrict;

-- Questions are numbered by their order in the section, whatever was removed before.
create or replace function public.exam_state(p_attempt_id uuid)
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
          'id', q.id, 'position', (select count(*) from public.exam_questions o where o.section_id = q.section_id and (o.position, o.id) <= (q.position, q.id)), 'passage_id', q.passage_id, 'prompt', q.prompt,
          'options', public.exam_public_options(q.options),
          'your_option', x.option_id, 'flagged', coalesce(x.flagged, false)
        ) order by q.position, q.id)
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
        'id', q.id, 'section', s.kind, 'position', (select count(*) from public.exam_questions o where o.section_id = q.section_id and (o.position, o.id) <= (q.position, q.id)), 'passage_id', q.passage_id, 'prompt', q.prompt,
        'options', public.exam_public_options(q.options),
        'correct_option_id', q.correct_option_id, 'explanation', q.explanation,
        'your_option', x.option_id
      ) order by s.position, q.position, q.id)
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


-- An exam's settings and both sections' numbers, saved together or not at
-- all. Runs as the caller: Row Level Security and the guards decide.
create function public.save_exam_settings(
  p_exam_id uuid, p_title text, p_level public.exam_level, p_audio_max_plays integer, p_coins_per_correct integer, p_thresholds jsonb,
  p_listening_questions integer, p_listening_seconds integer, p_reading_questions integer, p_reading_seconds integer
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.exams
  set title = p_title, level = p_level, audio_max_plays = p_audio_max_plays, coins_per_correct = p_coins_per_correct, level_thresholds = p_thresholds
  where id = p_exam_id and archived_at is null;
  if not found then
    raise exception 'No such exam' using errcode = 'P0002';
  end if;
  update public.exam_sections set question_count = p_listening_questions, time_limit_sec = p_listening_seconds where exam_id = p_exam_id and kind = 'listening';
  update public.exam_sections set question_count = p_reading_questions, time_limit_sec = p_reading_seconds where exam_id = p_exam_id and kind = 'reading';
end;
$$;

revoke execute on function public.save_exam_settings(uuid, text, public.exam_level, integer, integer, jsonb, integer, integer, integer, integer) from public, anon;
grant execute on function public.save_exam_settings(uuid, text, public.exam_level, integer, integer, jsonb, integer, integer, integer, integer) to authenticated;

-- An import: every passage and question of the sheet, after what the draft
-- already has, or none of them. Runs as the caller. Returns the questions added.
--   p_passages:  [{ key, section, kind, text, audio_path }]
--   p_questions: [{ section, passage (a key or null), prompt, options, correct_option_id, explanation }]
create function public.import_exam(p_exam_id uuid, p_passages jsonb, p_questions jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  made uuid;
  passage_ids jsonb := '{}'::jsonb;
  added integer := 0;
begin
  -- One import at a time per exam, so positions do not collide.
  perform 1 from public.exams e where e.id = p_exam_id and e.archived_at is null for update;
  if not found then
    raise exception 'No such exam' using errcode = 'P0002';
  end if;
  for item in select value from jsonb_array_elements(p_passages) loop
    made := null;
    insert into public.exam_passages (exam_id, section_id, kind, text, audio_path, position)
    select p_exam_id, s.id, (item ->> 'kind')::public.exam_passage_kind, item ->> 'text', item ->> 'audio_path',
           coalesce((select max(p.position) from public.exam_passages p where p.section_id = s.id), 0) + 1
    from public.exam_sections s where s.exam_id = p_exam_id and s.kind = (item ->> 'section')::public.exam_section_kind
    returning id into made;
    if made is null then
      raise exception 'No such section' using errcode = 'P0002';
    end if;
    passage_ids := passage_ids || jsonb_build_object(item ->> 'key', made);
  end loop;
  for item in select value from jsonb_array_elements(p_questions) loop
    made := null;
    insert into public.exam_questions (section_id, passage_id, position, prompt, options, correct_option_id, explanation)
    select s.id, (passage_ids ->> (item ->> 'passage'))::uuid,
           coalesce((select max(q.position) from public.exam_questions q where q.section_id = s.id), 0) + 1,
           item ->> 'prompt', item -> 'options', item ->> 'correct_option_id', item ->> 'explanation'
    from public.exam_sections s where s.exam_id = p_exam_id and s.kind = (item ->> 'section')::public.exam_section_kind
    returning id into made;
    if made is null then
      raise exception 'No such section' using errcode = 'P0002';
    end if;
    added := added + 1;
  end loop;
  return added;
end;
$$;

revoke execute on function public.import_exam(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.import_exam(uuid, jsonb, jsonb) to authenticated;

-- Files nothing uses any more are removed by whoever builds, while their exam
-- is not published.
create policy exam_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'exam-media' and (select public.is_exam_author())
    and not exists (select 1 from public.exams e where e.id::text = split_part(name, '/', 1) and e.status = 'published')
  );
