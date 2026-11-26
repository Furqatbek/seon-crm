-- The Shop. docs/STUDENT_APP_SPEC.md → "App behaviour → Shop", "Users, roles
-- and access", "Data model" (reward_variants and the redemption changes).
--
-- 1. A reward may have variants (sizes), each with its own stock. A reward
--    with variants is ordered by variant, and its own stock is not used.
-- 2. Orders go Requested → Ready for pickup → Given, or Rejected. Ready is
--    new: staff mark it, and the student is told to come and collect.
-- 3. A linked student orders from the app, for themselves only, and may
--    cancel while the order is still Requested: the coins and the unit of
--    stock come back. An app user can never order.
-- 4. my_orders(): the student's own orders with the reward's name and photo.
--
-- New error codes:
--   ER006  choose a variant (or the variant is not this reward's)
--   ER007  the order can no longer be cancelled (it is ready or closed)

-- ───────────────────────── Tables ─────────────────────────

-- A removed variant is archived, not deleted: old orders still name it.
alter table public.reward_variants add column archived_at timestamptz;

alter table public.redemptions
  add column ready_at timestamptz,
  add column ready_by uuid references public.profiles (id) on delete set null;

-- Ordered in the app, as well as by the bot and at the desk.
alter table public.redemptions drop constraint redemptions_via_check;
alter table public.redemptions add constraint redemptions_via_check check (via in ('bot', 'desk', 'app'));

-- "Ready" is still open: handled_at is set when the order is closed.
alter table public.redemptions drop constraint redemptions_check;
alter table public.redemptions add constraint redemptions_open_or_handled
  check ((status in ('requested', 'ready')) = (handled_at is null));
alter table public.redemptions add constraint redemptions_ready_shape
  check (status <> 'ready' or ready_at is not null);

drop index public.redemptions_open_idx;
create index redemptions_open_idx on public.redemptions (created_at) where status in ('requested', 'ready');

-- An order made by an account that is later deleted stays; only the link goes.
alter table public.redemptions drop constraint redemptions_created_by_fkey;
alter table public.redemptions add constraint redemptions_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;
alter table public.points_ledger drop constraint points_ledger_created_by_fkey;
alter table public.points_ledger add constraint points_ledger_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- The app follows its orders live.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'redemptions') then
    alter publication supabase_realtime add table public.redemptions;
  end if;
end;
$$;

-- ────────────────────────── Order a reward ──────────────────────────
-- Who may ask:
--   * staff, at the desk, for any student;
--   * the bot (the server's own key), for the student of the chat;
--   * a linked student, in the app, for themselves only.
-- An app user is refused: there is no student to order for.
-- The coins and one unit of stock are held at once. Locks are taken in the
-- same order by every caller (student, reward, variant), so the last unit
-- cannot be ordered twice and a balance cannot be overspent.

drop function public.request_reward(uuid, uuid, text, text, text);

create function public.request_reward(
  p_student_id uuid,
  p_reward_id uuid,
  p_via text default 'desk',
  p_requested_by text default 'staff',
  p_request_key text default null,
  p_variant_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  via text := coalesce(p_via, 'desk');
  asked_by text := coalesce(p_requested_by, 'staff');
  student uuid := p_student_id;
  reward public.rewards;
  variant public.reward_variants;
  has_variants boolean;
  takes_stock boolean;
  current_balance bigint;
  new_id uuid;
begin
  if public.is_user_request() then
    if public.is_staff() then
      via := 'desk';
      asked_by := 'staff';
    elsif public.my_student_id() is not null then
      -- In the app: for oneself, whatever student was named.
      student := public.my_student_id();
      via := 'app';
      asked_by := 'student';
    else
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  end if;
  if via not in ('bot', 'desk', 'app') or asked_by not in ('student', 'parent', 'staff') then
    raise exception 'Unknown way of asking' using errcode = '22023';
  end if;

  -- The student first, then the reward: every caller locks in this order.
  perform 1 from public.students s where s.id = student and s.archived_at is null for update;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;
  -- Asked twice (Yes pressed again, an update delivered twice): the first request stands.
  if p_request_key is not null then
    select d.id into new_id from public.redemptions d where d.request_key = p_request_key and d.student_id = student;
    if found then
      return new_id;
    end if;
  end if;
  select * into reward from public.rewards where id = p_reward_id for update;
  if not found or not reward.is_active or reward.archived_at is not null then
    raise exception 'The reward is not on offer' using errcode = 'ER005';
  end if;

  has_variants := exists (select 1 from public.reward_variants v where v.reward_id = reward.id and v.archived_at is null);
  if has_variants then
    select * into variant from public.reward_variants v
    where v.id = p_variant_id and v.reward_id = reward.id and v.archived_at is null
    for update;
    if not found then
      raise exception 'Choose a variant' using errcode = 'ER006';
    end if;
  elsif p_variant_id is not null then
    raise exception 'This reward has no variants' using errcode = 'ER006';
  end if;

  select coalesce(sum(p.delta), 0) into current_balance
  from public.points_ledger p where p.student_id = student;
  if current_balance < reward.cost then
    raise exception 'The student has only % coins', current_balance
      using errcode = 'ER001', detail = current_balance::text;
  end if;

  -- With variants the variant's stock counts; without, the reward's. Null is unlimited.
  takes_stock := case when has_variants then variant.stock is not null else reward.stock is not null end;
  if takes_stock and (case when has_variants then variant.stock else reward.stock end) < 1 then
    raise exception 'Out of stock' using errcode = 'ER002';
  end if;

  insert into public.redemptions (student_id, reward_id, variant_id, cost, via, requested_by, created_by, request_key, took_stock)
  values (student, reward.id, variant.id, reward.cost, via, asked_by, (select auth.uid()), p_request_key, takes_stock)
  returning id into new_id;

  insert into public.points_ledger (student_id, delta, source, redemption_id, reason, created_by, dedupe_key)
  values (student, -reward.cost, 'reward_hold', new_id, reward.name, (select auth.uid()), 'reward_hold:' || new_id);

  if takes_stock then
    if has_variants then
      update public.reward_variants set stock = stock - 1 where id = variant.id;
    else
      update public.rewards set stock = stock - 1 where id = reward.id;
    end if;
  end if;

  return new_id;
end;
$$;

-- ─────────────────── Ready, give, reject or cancel ──────────────────
--   ready   staff: Requested → Ready for pickup.
--   give    staff: Requested or Ready → Given; final.
--   reject  staff: Requested or Ready → Rejected, with a reason.
--   cancel  staff: as reject, recorded as Cancelled, with a reason;
--           the student, in the app: their own order while it is still
--           Requested, no reason needed.
-- Rejected and Cancelled return the coins and the unit of stock.

create or replace function public.handle_redemption(p_id uuid, p_action text, p_note text default null)
returns public.redemption_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  why text := nullif(btrim(coalesce(p_note, '')), '');
  r public.redemptions;
  next_status public.redemption_status;
  by_student boolean := false;
begin
  if public.is_user_request() and not public.is_staff() then
    -- A student may only cancel, and only their own order (checked below).
    if public.my_student_id() is null or p_action is distinct from 'cancel' then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    by_student := true;
    -- Shown to staff in their own language.
    why := 'cancelled_by_student';
  end if;
  if p_action is null or p_action not in ('ready', 'give', 'reject', 'cancel') then
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  next_status := case p_action when 'ready' then 'ready' when 'give' then 'given' when 'reject' then 'rejected' else 'cancelled' end;
  if next_status in ('rejected', 'cancelled') and why is null then
    raise exception 'A reason is required' using errcode = 'ER004';
  end if;

  -- Find the student without a lock, then lock in the usual order.
  select * into r from public.redemptions where id = p_id;
  if not found or (by_student and r.student_id is distinct from public.my_student_id()) then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  perform 1 from public.students s where s.id = r.student_id for update;
  perform 1 from public.rewards w where w.id = r.reward_id for update;
  select * into r from public.redemptions where id = p_id for update;

  if by_student and r.status <> 'requested' then
    raise exception 'The order can no longer be cancelled' using errcode = 'ER007';
  end if;
  if r.status not in ('requested', 'ready') or (next_status = 'ready' and r.status <> 'requested') then
    raise exception 'The request was already handled' using errcode = 'ER003';
  end if;

  if next_status = 'ready' then
    update public.redemptions set status = 'ready', ready_at = now(), ready_by = (select auth.uid()) where id = r.id;
    return next_status;
  end if;

  update public.redemptions
  set status = next_status, handled_by = (select auth.uid()), handled_at = now(), note = why
  where id = r.id;

  if next_status <> 'given' then
    insert into public.points_ledger (student_id, delta, source, redemption_id, reason, created_by, dedupe_key)
    values (r.student_id, r.cost, 'reward_return', r.id, why, (select auth.uid()), 'reward_return:' || r.id);
    if r.took_stock then
      if r.variant_id is not null then
        update public.reward_variants set stock = stock + 1 where id = r.variant_id and stock is not null;
      else
        update public.rewards set stock = stock + 1 where id = r.reward_id and stock is not null;
      end if;
    end if;
  end if;

  return next_status;
end;
$$;

-- ───────────────────────── For the app ──────────────────────────────

-- The calling student's orders, the newest first, with the reward's name and
-- photo as they are now and the variant's name in four languages. A reward
-- that is no longer on offer still shows in an old order.
create function public.my_orders()
returns table (
  id uuid, reward_id uuid, reward_name text, photo_path text, variant_id uuid, variant_name jsonb,
  cost integer, status public.redemption_status, created_at timestamptz, ready_at timestamptz,
  handled_at timestamptz, note text
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.reward_id, w.name, w.photo_path, d.variant_id, v.name,
         d.cost, d.status, d.created_at, d.ready_at, d.handled_at,
         -- Why staff rejected it; the student's own cancellation needs no words.
         case when d.note = 'cancelled_by_student' then null else d.note end
  from public.redemptions d
  join public.rewards w on w.id = d.reward_id
  left join public.reward_variants v on v.id = d.variant_id
  where d.student_id = public.my_student_id()
  order by d.created_at desc;
$$;

-- Variants on offer only: an archived one is not shown in the shop.
drop policy reward_variants_select on public.reward_variants;
create policy reward_variants_select on public.reward_variants
  for select to authenticated
  using (
    (select public.is_staff())
    or (archived_at is null
      and ((select public.my_teacher_id()) is not null or (select public.is_app_account()))
      and exists (select 1 from public.rewards r where r.id = reward_id and r.is_active and r.archived_at is null))
  );

revoke execute on function
  public.request_reward(uuid, uuid, text, text, text, uuid),
  public.my_orders()
from public, anon;

grant execute on function
  public.request_reward(uuid, uuid, text, text, text, uuid),
  public.my_orders()
to authenticated, service_role;
