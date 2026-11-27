-- App 13, the release review. Three gaps closed.

-- 1. Exam coins were paid once per account. A student who deleted the
--    account and signed up again (the same phone links to the same student)
--    could sit the exam again for coins. Now: once per student and exam.
update public.points_ledger l
set dedupe_key = 'exam:' || a.exam_id || ':' || l.student_id
from public.exam_attempts a
where l.source = 'exam' and l.dedupe_key = 'exam:' || a.id;

create or replace function public.exam_finish(p_attempt_id uuid, p_status public.exam_attempt_status)
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
      -- Once per student and exam, whatever account they sat it with.
      insert into public.points_ledger (student_id, delta, source, dedupe_key)
      values (player.student_id, earned, 'exam', 'exam:' || a.exam_id || ':' || player.student_id)
      on conflict (dedupe_key) do nothing;
      if not found then
        earned := 0;
      end if;
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

-- 2. A manager could not enrol with a free-trial-week voucher in the last
--    week of a month: the second charge, for the month the trial runs into,
--    was refused. A manager may write it, in the enrolment's own transaction.
drop policy charges_insert on public.charges;

create policy charges_insert on public.charges
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select public.is_owner())
      or ((select public.is_staff()) and (
        (
          type = 'monthly_fee'
          and exists (
            select 1 from public.enrollments e
            where e.id = charges.enrollment_id
              and e.student_id = charges.student_id
              and e.group_id = charges.group_id
              and date_trunc('month', e.joined_on)::date = charges.billing_month
          )
        )
        -- a free trial week that runs into the next month: that month's
        -- reduced fee, written in the same transaction as the enrolment
        or (
          type = 'monthly_fee'
          and is_prorated
          and exists (
            select 1 from public.enrollments e
            where e.id = charges.enrollment_id
              and e.student_id = charges.student_id
              and e.group_id = charges.group_id
              and (date_trunc('month', e.joined_on) + interval '1 month')::date = charges.billing_month
              and e.joined_on + 7 > charges.billing_month
              and e.created_at = now()
          )
        )
        -- a credit: negative, and the table already requires its note
        or (type = 'adjustment' and amount < 0)
      ))
    )
  );

-- 3. Two reports the spec lists were missing: sign-ups in the app per week,
--    and each exam's finished attempts with their average. Staff only.
create function public.app_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    -- Accounts made in the app, by the Monday of their week.
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object('week', w.week, 'count', w.n) order by w.week)
      from (
        select date_trunc('week', p.created_at at time zone 'Asia/Tashkent')::date as week, count(*)::integer as n
        from public.profiles p
        where p.role in ('student', 'app_user')
          and (p.created_at at time zone 'Asia/Tashkent')::date between p_from and p_to
        group by 1
      ) w
    ), '[]'::jsonb),
    -- Attempts finished in the period, by exam.
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'exam_id', x.exam_id, 'title', x.title, 'attempts', x.attempts, 'players', x.players,
        'average_correct', x.average_correct, 'questions', x.questions
      ) order by x.title)
      from (
        select e.id as exam_id, e.title, count(*)::integer as attempts, count(distinct a.profile_id)::integer as players,
               round(avg(coalesce(a.correct_listening, 0) + coalesce(a.correct_reading, 0)), 1) as average_correct,
               (select count(*)::integer from public.exam_questions q join public.exam_sections s on s.id = q.section_id where s.exam_id = e.id) as questions
        from public.exam_attempts a
        join public.exams e on e.id = a.exam_id
        where a.status <> 'in_progress'
          and (a.submitted_at at time zone 'Asia/Tashkent')::date between p_from and p_to
        group by e.id, e.title
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.app_report(date, date) from public, anon;
grant execute on function public.app_report(date, date) to authenticated;
