-- Rewards and redemption. docs/SPEC.md → "Points and rewards add-on":
-- "Point rules" (reward rows), "Defaults to confirm → Redeeming",
-- "Screens → Staff: Points" (Rewards and Requests).
--
-- 1. rewards: the catalogue. The owner adds, edits and archives; everyone
--    signed in may look. Photos live in the private "reward-photos" bucket.
-- 2. redemptions: one row per request. Nobody writes to it directly.
-- 3. request_reward(): holds the points and one unit of stock at once.
--    handle_redemption(): Give is final; Reject and Cancel need a reason and
--    return the points and the stock.
--    Both lock the student and then the reward, so two requests at the same
--    moment cannot overspend a balance or take the last unit twice.
--
-- Custom error codes raised below:
--   ER001  not enough points (detail = balance)
--   ER002  out of stock
--   ER003  the request was already handled
--   ER004  a reason is required
--   ER005  the reward is not on offer

create type public.redemption_status as enum ('requested', 'given', 'rejected', 'cancelled');

-- ───────────────────────────── Rewards ──────────────────────────────

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  description text,
  -- The object's name in the reward-photos bucket.
  photo_path text,
  cost integer not null check (cost between 1 and 100000),
  -- null = unlimited
  stock integer check (stock is null or stock >= 0),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.rewards
  for each row execute function public.set_updated_at();

insert into public.rewards (name, description, cost, stock) values
  ('Brend futbolka', 'Markaz logotipi tushirilgan futbolka', 100, 20),
  ('Daftarlar toʻplami', '3 ta daftar va ruchka', 40, 30),
  ('Bepul dars', 'Istalgan guruhda bitta bepul dars', 150, null);

alter table public.rewards enable row level security;
grant select, insert, update on public.rewards to authenticated;

-- Staff see everything; a teacher sees the catalogue on offer.
create policy rewards_select on public.rewards
  for select to authenticated
  using (
    (select public.is_staff())
    or ((select public.my_teacher_id()) is not null and is_active and archived_at is null)
  );

create policy rewards_insert on public.rewards
  for insert to authenticated
  with check ((select public.is_owner()));

create policy rewards_update on public.rewards
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- ─────────────────────────── Redemptions ────────────────────────────

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id),
  reward_id uuid not null references public.rewards (id),
  -- The cost when it was requested: a later price change does not touch it.
  cost integer not null check (cost > 0),
  status public.redemption_status not null default 'requested',
  via text not null check (via in ('bot', 'desk')),
  requested_by text not null check (requested_by in ('student', 'parent', 'staff')),
  created_by uuid references public.profiles (id),
  handled_by uuid references public.profiles (id),
  handled_at timestamptz,
  note text check (note is null or btrim(note) <> ''),
  created_at timestamptz not null default now(),
  check ((status = 'requested') = (handled_at is null)),
  check (status not in ('rejected', 'cancelled') or note is not null)
);

create index redemptions_student_idx on public.redemptions (student_id, created_at);
create index redemptions_open_idx on public.redemptions (created_at) where status = 'requested';

alter table public.redemptions enable row level security;

-- Read by staff; written only by the two functions below.
revoke all on public.redemptions from public, anon, authenticated, service_role;
grant select on public.redemptions to authenticated, service_role;

create policy redemptions_select on public.redemptions
  for select to authenticated
  using ((select public.is_staff()));

alter table public.points_ledger add column redemption_id uuid references public.redemptions (id);

-- ────────────────────────── Request a reward ────────────────────────
-- At the desk (staff) or, from Phase 17, from the bot (the server's own key).
-- The points are held at once: a reward_hold row and one unit of stock.

create function public.request_reward(
  p_student_id uuid,
  p_reward_id uuid,
  p_via text default 'desk',
  p_requested_by text default 'staff'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  via text := coalesce(p_via, 'desk');
  asked_by text := coalesce(p_requested_by, 'staff');
  reward public.rewards;
  current_balance bigint;
  new_id uuid;
begin
  if public.is_user_request() then
    -- A person signed in: only staff, and only at the desk.
    if not public.is_staff() then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    via := 'desk';
    asked_by := 'staff';
  end if;
  if via not in ('bot', 'desk') or asked_by not in ('student', 'parent', 'staff') then
    raise exception 'Unknown way of asking' using errcode = '22023';
  end if;

  -- The student first, then the reward: every caller locks in this order.
  perform 1 from public.students s where s.id = p_student_id and s.archived_at is null for update;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  select * into reward from public.rewards where id = p_reward_id for update;
  if not found or not reward.is_active or reward.archived_at is not null then
    raise exception 'The reward is not on offer' using errcode = 'ER005';
  end if;

  select coalesce(sum(p.delta), 0) into current_balance
  from public.points_ledger p where p.student_id = p_student_id;
  if current_balance < reward.cost then
    raise exception 'The student has only % points', current_balance
      using errcode = 'ER001', detail = current_balance::text;
  end if;
  if reward.stock is not null and reward.stock < 1 then
    raise exception 'Out of stock' using errcode = 'ER002';
  end if;

  insert into public.redemptions (student_id, reward_id, cost, via, requested_by, created_by)
  values (p_student_id, reward.id, reward.cost, via, asked_by, (select auth.uid()))
  returning id into new_id;

  insert into public.points_ledger (student_id, delta, source, redemption_id, reason, created_by, dedupe_key)
  values (p_student_id, -reward.cost, 'reward_hold', new_id, reward.name, (select auth.uid()), 'reward_hold:' || new_id);

  if reward.stock is not null then
    update public.rewards set stock = stock - 1 where id = reward.id;
  end if;

  return new_id;
end;
$$;

-- ───────────────────── Give, reject or cancel ───────────────────────
-- Give: the reward was handed over; final. Reject or cancel: a reason is
-- required, the points come back and so does the unit of stock.

create function public.handle_redemption(p_id uuid, p_action text, p_note text default null)
returns public.redemption_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  why text := nullif(btrim(coalesce(p_note, '')), '');
  r public.redemptions;
  next_status public.redemption_status;
begin
  if public.is_user_request() and not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('give', 'reject', 'cancel') then
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  next_status := case p_action when 'give' then 'given' when 'reject' then 'rejected' else 'cancelled' end;
  if next_status <> 'given' and why is null then
    raise exception 'A reason is required' using errcode = 'ER004';
  end if;

  -- Find the student without a lock, then lock in the usual order.
  select * into r from public.redemptions where id = p_id;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  perform 1 from public.students s where s.id = r.student_id for update;
  perform 1 from public.rewards w where w.id = r.reward_id for update;
  select * into r from public.redemptions where id = p_id for update;
  if r.status <> 'requested' then
    raise exception 'The request was already handled' using errcode = 'ER003';
  end if;

  update public.redemptions
  set status = next_status, handled_by = (select auth.uid()), handled_at = now(), note = why
  where id = r.id;

  if next_status <> 'given' then
    insert into public.points_ledger (student_id, delta, source, redemption_id, reason, created_by, dedupe_key)
    values (r.student_id, r.cost, 'reward_return', r.id, why, (select auth.uid()), 'reward_return:' || r.id);
    update public.rewards set stock = stock + 1 where id = r.reward_id and stock is not null;
  end if;

  return next_status;
end;
$$;

revoke execute on function
  public.request_reward(uuid, uuid, text, text),
  public.handle_redemption(uuid, text, text)
from public, anon;

grant execute on function
  public.request_reward(uuid, uuid, text, text),
  public.handle_redemption(uuid, text, text)
to authenticated, service_role;

-- ─────────────────────────── Reward photos ──────────────────────────
-- A private bucket: the owner uploads, anyone signed in with an active
-- login reads (through short-lived signed links).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reward-photos', 'reward-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy reward_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'reward-photos' and (select public.app_role()) is not null);

create policy reward_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reward-photos' and (select public.is_owner()));

create policy reward_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'reward-photos' and (select public.is_owner()))
  with check (bucket_id = 'reward-photos' and (select public.is_owner()));

create policy reward_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'reward-photos' and (select public.is_owner()));
