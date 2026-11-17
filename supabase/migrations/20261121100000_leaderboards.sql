-- Leaderboards and the TV screen. docs/SPEC.md → "Points and rewards add-on":
-- "Leaderboard rules", "Screens → Staff: Points", "Screens → TV screen".
--
-- 1. leaderboard(): monthly (Tashkent months) or all-time, for one group or
--    the whole centre. Ties share a rank (1, 2, 2, 4), then by name.
-- 2. The TV screen: a secret token and a language in points_settings, and
--    tv_board(token), which anyone holding the token may call and which
--    returns first names with a last initial and nothing else.
-- 3. Two fixes to the points engine from its review.

-- ─────────────────────── TV token and language ──────────────────────

alter table public.points_settings
  add column tv_token text not null default replace(gen_random_uuid()::text, '-', '') check (length(tv_token) >= 32),
  add column tv_language public.app_language not null default 'uz';

-- The token is a secret: teachers and managers read the other settings, never
-- the token. The owner gets it from points_tv_token().
revoke select on public.points_settings from authenticated;
grant select (
  id, singleton, enabled, present, late, perfect_month, perfect_month_min_lessons, on_time, referral,
  max_per_action, teacher_daily_cap, started_at, tv_language, created_at, updated_at
) on public.points_settings to authenticated;

create function public.points_tv_token()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return (select s.tv_token from public.points_settings s);
end;
$$;

-- A new token: every old TV link stops working at once.
create function public.regenerate_tv_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  fresh text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_owner() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.points_settings set tv_token = fresh where singleton;
  return fresh;
end;
$$;

-- ──────────────────────────── Leaderboard ───────────────────────────
-- Earned points only (reward rows are spending, not earning).
--   scope 'group':  only that group's rows, only students actively enrolled in it.
--   scope 'centre': every earned row, every active student.
--   period 'month': rows posted in that calendar month, Tashkent time
--                   (p_month is its 1st; the current month when null).
--   period 'all':   every row.
-- Hidden students are flagged, not left out: staff still see their rank.
-- Internal: the callers below decide who may ask.

create function public.leaderboard_rows(p_scope text, p_group_id uuid, p_period text, p_month date)
returns table (student_id uuid, full_name text, points bigint, rank integer, hidden boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  month_start date := coalesce(p_month, date_trunc('month', public.tashkent_today())::date);
  starts timestamptz;
  ends timestamptz;
begin
  if p_scope not in ('group', 'centre') or p_period not in ('month', 'all') then
    raise exception 'Unknown scope or period' using errcode = '22023';
  end if;
  if p_scope = 'group' and p_group_id is null then
    raise exception 'A group board needs a group' using errcode = '22023';
  end if;
  if p_period = 'month' then
    if extract(day from month_start) <> 1 then
      raise exception 'A month is the 1st day of the month' using errcode = '22023';
    end if;
    starts := month_start::timestamp at time zone 'Asia/Tashkent';
    ends := (month_start + interval '1 month')::timestamp at time zone 'Asia/Tashkent';
  end if;

  return query
  with member as (
    select s.id, s.full_name, s.leaderboard_hidden
    from public.students s
    where s.archived_at is null
      and case
        when p_scope = 'group' then exists (
          select 1 from public.enrollments e
          where e.student_id = s.id and e.group_id = p_group_id and e.status = 'active'
        )
        else s.status = 'active'
      end
  ),
  total as (
    select m.id, m.full_name, m.leaderboard_hidden,
           coalesce(sum(l.delta), 0)::bigint as points
    from member m
    left join public.points_ledger l
      on l.student_id = m.id
     and l.source not in ('reward_hold', 'reward_return')
     and (p_scope = 'centre' or l.group_id = p_group_id)
     and (p_period = 'all' or (l.created_at >= starts and l.created_at < ends))
    group by m.id, m.full_name, m.leaderboard_hidden
  )
  select t.id, t.full_name, t.points,
         (rank() over (order by t.points desc))::integer,
         t.leaderboard_hidden
  from total t
  order by t.points desc, t.full_name, t.id;
end;
$$;

-- For staff, and for a teacher: the centre board and their own groups.
create function public.leaderboard(
  p_scope text,
  p_group_id uuid default null,
  p_period text default 'month',
  p_month date default null
)
returns table (student_id uuid, display_name text, points bigint, rank integer, hidden boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_staff()
    or (public.my_teacher_id() is not null and (p_scope = 'centre' or public.teacher_owns_group(p_group_id)))
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query select * from public.leaderboard_rows(p_scope, p_group_id, p_period, p_month);
end;
$$;

-- ───────────────────────────── TV screen ────────────────────────────

-- "Akmal Ismoilov" → "Akmal I."; a single name stays as it is.
create function public.tv_name(p_full_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when array_length(parts, 1) >= 2 then parts[1] || ' ' || left(parts[array_length(parts, 1)], 1) || '.'
    else coalesce(parts[1], '')
  end
  from (select regexp_split_to_array(btrim(p_full_name), '\s+') as parts) p;
$$;

-- Whether a TV link is the current one. Asked before the page is served, so a
-- wrong link is a plain 404.
create function public.tv_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p_token = s.tv_token from public.points_settings s), false);
$$;

-- What the TV shows, or null when the token is wrong: the centre's top 10
-- this month, then each active group's top 5. Hidden students and students
-- with no points are left out before the places are counted.
create function public.tv_board(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg public.points_settings;
  centre jsonb;
  boards jsonb;
begin
  select * into cfg from public.points_settings;
  if not found or p_token is null or p_token <> cfg.tv_token then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'points', r.points, 'rank', r.place) order by r.place, r.name), '[]'::jsonb)
  into centre
  from (
    select public.tv_name(b.full_name) as name, b.points,
           (rank() over (order by b.points desc))::integer as place,
           row_number() over (order by b.points desc, b.full_name, b.student_id) as line
    from public.leaderboard_rows('centre', null, 'month', null) b
    where not b.hidden and b.points > 0
  ) r
  -- Ten lines fit the screen: a tie at the end is cut by name.
  where r.line <= 10;

  select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'rows', g.top) order by g.name), '[]'::jsonb)
  into boards
  from (
    select gr.name, (
      select jsonb_agg(jsonb_build_object('name', r.name, 'points', r.points, 'rank', r.place) order by r.place, r.name)
      from (
        select public.tv_name(b.full_name) as name, b.points,
               (rank() over (order by b.points desc))::integer as place,
               row_number() over (order by b.points desc, b.full_name, b.student_id) as line
        from public.leaderboard_rows('group', gr.id, 'month', null) b
        where not b.hidden and b.points > 0
      ) r
      where r.line <= 5
    ) as top
    from public.groups gr
    where gr.status = 'active' and gr.archived_at is null
  ) g
  where g.top is not null;

  return jsonb_build_object(
    'centre_name', (select c.centre_name from public.centre_settings c),
    'language', cfg.tv_language,
    'month', to_char(public.tashkent_today(), 'YYYY-MM'),
    'centre', centre,
    'groups', boards
  );
end;
$$;

-- ─────────────────── Fixes to the points engine ─────────────────────

-- 1. Two changes of the same mark at the same moment could each work out the
--    same next row and one difference was lost: the lesson is locked first.
create or replace function public.points_sync_attendance(p_lesson_id uuid, p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.points_settings;
  l public.lessons;
  target integer := 0;
  posted integer;
  rows_so_far integer;
begin
  select * into cfg from public.points_settings;
  if not found or not cfg.enabled then
    return;
  end if;
  select * into l from public.lessons where id = p_lesson_id for update;
  if not found then
    return;
  end if;

  if l.status <> 'cancelled' then
    select case a.status when 'present' then cfg.present when 'late' then cfg.late else 0 end
    into target
    from public.attendance a
    where a.lesson_id = p_lesson_id and a.student_id = p_student_id;
    target := coalesce(target, 0);
  end if;

  select coalesce(sum(p.delta), 0), count(*) into posted, rows_so_far
  from public.points_ledger p
  where p.source = 'attendance' and p.lesson_id = p_lesson_id and p.student_id = p_student_id;

  if target = posted then
    return;
  end if;

  insert into public.points_ledger (student_id, delta, source, group_id, lesson_id, created_by, dedupe_key)
  values (
    p_student_id, target - posted, 'attendance', l.group_id, l.id, (select auth.uid()),
    'attendance:' || l.id || ':' || p_student_id || case when rows_so_far = 0 then '' else ':' || rows_so_far end
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

-- 2. Fee on time: a fee generated after the due day is not late through the
--    family's fault. It counts when the payments made by the end of the due
--    day cover everything charged for months up to that one, whenever those
--    charges were written.
create or replace function public.points_post_on_time(p_month date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.points_settings;
  due_end timestamptz;
  posted integer;
begin
  select * into cfg from public.points_settings;
  if not found or not cfg.enabled or cfg.on_time = 0 then
    return 0;
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'A month is the 1st day of the month' using errcode = '22023';
  end if;

  -- The first moment of the day after the due day, Tashkent time.
  select ((p_month + c.due_day)::timestamp at time zone 'Asia/Tashkent') into due_end
  from public.centre_settings c;
  if due_end is null or now() < due_end or due_end < cfg.started_at then
    return 0;
  end if;

  insert into public.points_ledger (student_id, delta, source, dedupe_key)
  select
    s.id, cfg.on_time, 'on_time_payment',
    'on_time:' || s.id || ':' || to_char(p_month, 'YYYY-MM')
  from public.students s
  where s.archived_at is null
    and exists (
      select 1 from public.charges c
      where c.student_id = s.id and c.billing_month = p_month and c.type = 'monthly_fee'
        and c.amount > 0 and c.archived_at is null
    )
    and (
      select coalesce(sum(p.amount), 0) from public.payments p
      where p.student_id = s.id and p.voided_at is null and p.paid_at < due_end
    ) >= (
      select coalesce(sum(c.amount), 0) from public.charges c
      where c.student_id = s.id and c.billing_month <= p_month and c.archived_at is null
    )
  on conflict (dedupe_key) do nothing;

  get diagnostics posted = row_count;
  return posted;
end;
$$;

-- ───────────────────────────── Grants ───────────────────────────────

revoke execute on function
  public.leaderboard_rows(text, uuid, text, date),
  public.tv_name(text)
from public, anon, authenticated;

revoke execute on function
  public.points_tv_token(),
  public.regenerate_tv_token(),
  public.leaderboard(text, uuid, text, date)
from public, anon;

grant execute on function
  public.points_tv_token(),
  public.regenerate_tv_token(),
  public.leaderboard(text, uuid, text, date)
to authenticated, service_role;

-- The TV has no login: the token is the key.
revoke execute on function public.tv_board(text), public.tv_token_ok(text) from public;
grant execute on function public.tv_board(text), public.tv_token_ok(text) to anon, authenticated, service_role;
