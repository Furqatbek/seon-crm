-- Telegram for students and parents. docs/SPEC.md → "Points and rewards
-- add-on → Telegram for students and parents", "Data model additions".
--
-- 1. Each student gets two links, one for the student and one for a parent.
--    The link a student had becomes the parent link: its code is kept as
--    parent_link_code and its chat moves to telegram_links, so linked parents
--    do not need to link again.
-- 2. The functions the reminders job reads now say which chat is whose.
-- 3. Weekly summary day and time, and the templates of the four points
--    messages (Telegram only).
-- 4. What the bot and the points messages read: points_summary() and bot_top().

create type public.link_role as enum ('student', 'parent');

-- ───────────────────────────── Links ────────────────────────────────

create table public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id),
  role public.link_role not null,
  chat_id bigint not null,
  -- The language this chat is written to; /language changes it.
  language public.app_language not null default 'uz',
  linked_at timestamptz not null default now(),
  unique (student_id, role)
);

create index telegram_links_chat_idx on public.telegram_links (chat_id);

alter table public.telegram_links enable row level security;

-- Staff see who is linked. Only the bot (the server's own key) writes.
revoke all on public.telegram_links from public, anon, authenticated;
grant select on public.telegram_links to authenticated;
grant select, insert, update, delete on public.telegram_links to service_role;

create policy telegram_links_select on public.telegram_links
  for select to authenticated
  using ((select public.is_staff()));

-- ─────────────────────── Students: two link codes ───────────────────

-- These read the columns that move.
drop view public.student_overview;
drop function public.notify_debtors();
drop function public.notify_lessons(date[]);

alter table public.students rename column telegram_link_code to parent_link_code;
alter table public.students rename constraint students_telegram_link_code_check to students_parent_link_code_check;
alter table public.students rename constraint students_telegram_link_code_key to students_parent_link_code_key;
alter table public.students
  add column student_link_code text not null default public.generate_link_code()
    unique check (student_link_code ~ '^[A-Za-z0-9]{22}$');

insert into public.telegram_links (student_id, role, chat_id, language)
select s.id, 'parent', s.telegram_chat_id, s.language
from public.students s
where s.telegram_chat_id is not null;

alter table public.students drop column telegram_chat_id;

-- One row per student for the list, with whether any Telegram chat is linked.
create view public.student_overview
with (security_invoker = true) as
select
  s.*,
  b.charged,
  b.paid,
  b.balance,
  b.oldest_unpaid_month,
  exists (select 1 from public.telegram_links t where t.student_id = s.id) as telegram_linked
from public.students s
join public.student_balances b on b.student_id = s.id;

grant select on public.student_overview to authenticated;

-- ───────────────────── What the reminders job reads ─────────────────

-- Students in debt who are still chased (not archived, not left), with the
-- parent's chat: payment messages never go to the student's own chat.
create function public.notify_debtors()
returns table (
  student_id uuid, full_name text, language public.app_language,
  parent_chat_id bigint, parent_chat_language public.app_language,
  parent_phone text, phone text, debt bigint, charged_months text[]
)
language sql
stable
set search_path = ''
as $$
  select
    s.id, s.full_name, s.language, p.chat_id, p.language, s.parent_phone, s.phone,
    -b.balance,
    coalesce(
      (
        select array_agg(distinct to_char(c.billing_month, 'YYYY-MM'))
        from public.charges c
        where c.student_id = s.id and c.type = 'monthly_fee' and c.archived_at is null
          and c.billing_month >= (date_trunc('month', public.tashkent_today()) - interval '1 month')::date
      ),
      '{}'
    )
  from public.student_balances b
  join public.students s on s.id = b.student_id
  left join public.telegram_links p on p.student_id = s.id and p.role = 'parent'
  where b.balance < 0 and s.archived_at is null and s.status <> 'left'
  order by s.id;
$$;

-- Scheduled lessons on these days with every active student who has a chat.
create function public.notify_lessons(p_days date[])
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
    and (own.chat_id is not null or p.chat_id is not null)
  order by l.lesson_date, l.start_time, l.id, s.id;
$$;

revoke execute on function public.notify_debtors(), public.notify_lessons(date[]) from public, anon, authenticated;
grant execute on function public.notify_debtors(), public.notify_lessons(date[]) to service_role;

-- ──────────────────────── Weekly summary time ───────────────────────

alter table public.points_settings
  -- 1 = Monday … 7 = Sunday
  add column weekly_day smallint not null default 7 check (weekly_day between 1 and 7),
  add column weekly_time time not null default '18:00';

grant select (weekly_day, weekly_time) on public.points_settings to authenticated;

-- ───────────────────────────── Templates ────────────────────────────

insert into public.message_templates (type, channel, language, body) values
  ('points_weekly', 'telegram', 'uz', '{student} bu hafta {week_points} ball toʻpladi. Jami: {balance} ball. Oy reytingi: {group} guruhida {group_rank}-oʻrin, markazda {centre_rank}-oʻrin. {goal}'),
  ('points_weekly', 'telegram', 'ru', '{student}: за неделю {week_points} баллов. Всего: {balance}. Рейтинг за месяц: {group_rank}-е место в группе {group}, {centre_rank}-е в центре. {goal}'),
  ('points_weekly', 'telegram', 'en', '{student} earned {week_points} points this week. Total: {balance}. This month: #{group_rank} in {group}, #{centre_rank} in the centre. {goal}'),
  ('points_deduction', 'telegram', 'uz', '{student}dan {points} ball olindi ({group}). Sabab: {reason}. Balans: {balance} ball. {centre}'),
  ('points_deduction', 'telegram', 'ru', '{student}: снято {points} баллов ({group}). Причина: {reason}. Баланс: {balance}. {centre}'),
  ('points_deduction', 'telegram', 'en', '{student} lost {points} points ({group}). Reason: {reason}. Balance: {balance}. {centre}'),
  ('points_month_result', 'telegram', 'uz', '{month} yakunlari: {student} {month_points} ball toʻpladi. {group} guruhida {group_rank}-oʻrin, markazda {centre_rank}-oʻrin. {bonus}'),
  ('points_month_result', 'telegram', 'ru', 'Итоги за {month}: {student} — {month_points} баллов. {group_rank}-е место в группе {group}, {centre_rank}-е в центре. {bonus}'),
  ('points_month_result', 'telegram', 'en', '{month} results: {student} earned {month_points} points. #{group_rank} in {group}, #{centre_rank} in the centre. {bonus}'),
  ('reward_update', 'telegram', 'uz', '{student}, “{reward}”: {update} Balans: {balance} ball.'),
  ('reward_update', 'telegram', 'ru', '{student}, «{reward}»: {update} Баланс: {balance}.'),
  ('reward_update', 'telegram', 'en', '{student}, “{reward}”: {update} Balance: {balance}.');

-- ─────────────── What the bot and the points messages read ──────────

-- One student's points: balance, this week, a month (the current one when
-- p_month is null), the place in the centre and in each group, the last five
-- rows and the nearest reward they cannot afford yet.
create function public.points_summary(p_student_id uuid, p_month date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  month_start date := coalesce(p_month, date_trunc('month', public.tashkent_today())::date);
  starts timestamptz := month_start::timestamp at time zone 'Asia/Tashkent';
  ends timestamptz := (month_start + interval '1 month')::timestamp at time zone 'Asia/Tashkent';
  -- Weeks start on Monday.
  week_start timestamptz := date_trunc('week', public.tashkent_today())::timestamp at time zone 'Asia/Tashkent';
  student public.students;
  current_balance bigint;
begin
  select * into student from public.students where id = p_student_id;
  if not found then
    return null;
  end if;
  select coalesce(sum(l.delta), 0) into current_balance
  from public.points_ledger l where l.student_id = p_student_id;

  return jsonb_build_object(
    'student_id', student.id,
    'name', student.full_name,
    'active', student.status = 'active' and student.archived_at is null,
    'month', to_char(month_start, 'YYYY-MM'),
    'balance', current_balance,
    'week_points', (
      select coalesce(sum(l.delta), 0) from public.points_ledger l
      where l.student_id = p_student_id and l.source not in ('reward_hold', 'reward_return') and l.created_at >= week_start
    ),
    'month_points', (
      select coalesce(sum(l.delta), 0) from public.points_ledger l
      where l.student_id = p_student_id and l.source not in ('reward_hold', 'reward_return')
        and l.created_at >= starts and l.created_at < ends
    ),
    'centre_rank', (
      select b.rank from public.leaderboard_rows('centre', null, 'month', month_start) b where b.student_id = p_student_id
    ),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('name', g.name, 'points', b.points, 'rank', b.rank) order by b.points desc, g.name)
      from public.enrollments e
      join public.groups g on g.id = e.group_id
      cross join lateral public.leaderboard_rows('group', g.id, 'month', month_start) b
      where e.student_id = p_student_id and e.status = 'active' and b.student_id = p_student_id
    ), '[]'::jsonb),
    -- The perfect-month bonus earned for that month (it is posted on the 1st of the next).
    'perfect_month_bonus', (
      select coalesce(sum(l.delta), 0) from public.points_ledger l
      where l.student_id = p_student_id and l.source = 'perfect_month'
        and l.dedupe_key like 'perfect\_month:%:' || p_student_id || ':' || to_char(month_start, 'YYYY-MM')
    ),
    'last', coalesce((
      select jsonb_agg(x.entry order by x.created_at desc, x.id)
      from (
        select l.created_at, l.id, jsonb_build_object(
          'delta', l.delta, 'source', l.source, 'reason', l.reason,
          'preset', case when pr.id is null then null else jsonb_build_object('uz', pr.label_uz, 'ru', pr.label_ru, 'en', pr.label_en) end
        ) as entry
        from public.points_ledger l
        left join public.point_presets pr on pr.id = l.preset_id
        where l.student_id = p_student_id
        order by l.created_at desc, l.id
        limit 5
      ) x
    ), '[]'::jsonb),
    'next_reward', (
      select jsonb_build_object('name', w.name, 'cost', w.cost, 'needed', w.cost - current_balance)
      from public.rewards w
      where w.is_active and w.archived_at is null and w.cost > current_balance and (w.stock is null or w.stock > 0)
      order by w.cost, w.name
      limit 1
    )
  );
end;
$$;

-- /top: the centre's top 10 this month and the student's groups' top 5, as on
-- the TV (first name and last initial, hidden students left out), with the
-- student's own places.
create function public.bot_top(p_student_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'centre', coalesce((
      select jsonb_agg(jsonb_build_object('name', r.name, 'points', r.points, 'rank', r.place) order by r.line)
      from (
        select public.tv_name(b.full_name) as name, b.points,
               (rank() over (order by b.points desc))::integer as place,
               row_number() over (order by b.points desc, b.full_name, b.student_id) as line
        from public.leaderboard_rows('centre', null, 'month', null) b
        where not b.hidden and b.points > 0
      ) r
      where r.line <= 10
    ), '[]'::jsonb),
    'own', (
      select jsonb_build_object('rank', b.rank, 'points', b.points)
      from public.leaderboard_rows('centre', null, 'month', null) b where b.student_id = p_student_id
    ),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('name', g.name, 'rows', top.list, 'own', own.place) order by g.name)
      from public.enrollments e
      join public.groups g on g.id = e.group_id
      cross join lateral (
        select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'points', r.points, 'rank', r.place) order by r.line), '[]'::jsonb) as list
        from (
          select public.tv_name(b.full_name) as name, b.points,
                 (rank() over (order by b.points desc))::integer as place,
                 row_number() over (order by b.points desc, b.full_name, b.student_id) as line
          from public.leaderboard_rows('group', g.id, 'month', null) b
          where not b.hidden and b.points > 0
        ) r
        where r.line <= 5
      ) top
      cross join lateral (
        select jsonb_build_object('rank', b.rank, 'points', b.points) as place
        from public.leaderboard_rows('group', g.id, 'month', null) b where b.student_id = p_student_id
      ) own
      where e.student_id = p_student_id and e.status = 'active'
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.points_summary(uuid, date), public.bot_top(uuid) from public, anon, authenticated;
grant execute on function public.points_summary(uuid, date), public.bot_top(uuid) to service_role;
