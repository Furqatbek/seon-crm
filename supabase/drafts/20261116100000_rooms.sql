-- DRAFT, not applied anywhere and not yet approved. It sits outside
-- supabase/migrations/ so that `supabase db push` cannot pick it up. It moves
-- there together with the app code that needs it.
--
-- Rooms. docs/SPEC.md → "Data model", "Roles and permissions",
-- "Screens → Groups", "Screens → Settings".
--
-- 1. A rooms table the owner manages.
-- 2. groups.room (free text) becomes groups.room_id → rooms. One room is
--    created for every distinct text in use and its groups are linked to it,
--    so nothing a group showed before is lost.
-- 3. A room holds one group at a time, and a group is never larger than its room.
--
-- Custom error codes raised below:
--   EM001  the room is taken at that time (detail: the clashing group's name)
--   EM002  the group's capacity is larger than the room's
--   EM003  the room is in use and cannot be archived
--   EM004  the room's capacity would be smaller than a group that uses it
--   EM005  the room is not available (inactive or archived)

-- ───────────────────────────── Table ─────────────────────────────

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  -- What is on the door: "3", "2A". Text, because not every door has a pure number.
  number text not null check (btrim(number) <> ''),
  name text check (name is null or btrim(name) <> ''),
  capacity smallint not null check (capacity > 0),
  -- An inactive room is kept, but no longer offered for a new group.
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One room per number among the rooms that are not archived.
create unique index rooms_number_key on public.rooms (lower(btrim(number))) where archived_at is null;

create trigger set_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();

-- Only the owner archives or restores a record.
create trigger guard_archive before insert or update on public.rooms
  for each row execute function public.guard_archive();

-- ─────────────────────── Row level security ───────────────────────
-- Everyone signed in reads. Only the owner creates, edits or archives.
-- Nobody deletes: there is no delete grant.

alter table public.rooms enable row level security;

grant select, insert, update on public.rooms to authenticated;

create policy rooms_select on public.rooms
  for select to authenticated
  using ((select public.is_staff()));

create policy rooms_insert on public.rooms
  for insert to authenticated
  with check ((select public.is_owner()));

create policy rooms_update on public.rooms
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- ─────────────── groups.room (text) → groups.room_id ──────────────

alter table public.groups add column room_id uuid references public.rooms (id);

-- One room per distinct text, compared without regard to case or outer
-- spaces ("3-xona" and " 3-Xona " are one room). The text becomes the room's
-- number, exactly as it was written, so every screen shows what it showed
-- before; the owner can tidy numbers and names in Settings → Rooms.
--
-- Capacity: the largest capacity among the groups that used the text, so no
-- existing group is larger than its new room. Where none of them had a
-- capacity, 20 is assumed; correct it in Settings → Rooms.
insert into public.rooms (number, capacity)
select
  min(btrim(g.room)),
  least(coalesce(max(g.capacity), 20), 32767)::smallint
from public.groups g
where btrim(coalesce(g.room, '')) <> ''
group by lower(btrim(g.room));

update public.groups g
set room_id = r.id
from public.rooms r
where btrim(coalesce(g.room, '')) <> ''
  and lower(btrim(g.room)) = lower(btrim(r.number));

-- Stop here rather than drop the text if any group was left unlinked.
do $$
declare
  unlinked integer;
begin
  select count(*) into unlinked
  from public.groups g
  where btrim(coalesce(g.room, '')) <> '' and g.room_id is null;
  if unlinked > 0 then
    raise exception '% group(s) have a room text that was not turned into a room', unlinked;
  end if;
end;
$$;

alter table public.groups drop column room;

create index groups_room_idx on public.groups (room_id) where room_id is not null;

-- ──────────────────── One group at a time per room ─────────────────

-- A group "uses" its room while it is active or still forming (a forming
-- group has the room booked for its start date) and is not archived.
create function public.group_uses_room(p_status public.group_status, p_archived_at timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_archived_at is null and p_status in ('active', 'forming');
$$;

-- The groups that would clash with a lesson slot in a room: they share a
-- weekday and their times overlap. A lesson that ends as another starts does
-- not overlap. Times are compared as minutes of the day.
-- Mirrors findRoomClash() in src/lib/domain/rooms.ts.
create function public.room_clashes(
  p_room_id uuid,
  p_days smallint[],
  p_start_time time,
  p_duration_min integer,
  p_except_group uuid default null
)
returns table (group_id uuid, group_name text)
language sql
stable
set search_path = ''
as $$
  select g.id, g.name
  from public.groups g
  where g.room_id = p_room_id
    and g.id is distinct from p_except_group
    and public.group_uses_room(g.status, g.archived_at)
    and g.days && p_days
    and extract(epoch from g.start_time)::integer / 60 < extract(epoch from p_start_time)::integer / 60 + p_duration_min
    and extract(epoch from p_start_time)::integer / 60 < extract(epoch from g.start_time)::integer / 60 + g.duration_min
  order by g.name, g.id;
$$;

-- Checked when a group is created and when its room, schedule or use of the
-- room changes. Groups that already clashed before this rule existed are not
-- touched until someone edits their room or schedule.
create function public.guard_group_room()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  room public.rooms%rowtype;
  clash text;
  placed boolean;
  rescheduled boolean;
begin
  if new.room_id is null then
    return new;
  end if;

  placed := tg_op = 'INSERT' or new.room_id is distinct from old.room_id;
  rescheduled := placed
    or new.days is distinct from old.days
    or new.start_time is distinct from old.start_time
    or new.duration_min is distinct from old.duration_min
    -- back in use: restored from the archive, or reopened after it finished
    or (public.group_uses_room(new.status, new.archived_at)
        and not public.group_uses_room(old.status, old.archived_at));

  select * into room from public.rooms r where r.id = new.room_id;

  if placed and (room.archived_at is not null or not room.is_active) then
    raise exception 'The room is not available' using errcode = 'EM005';
  end if;

  if (placed or tg_op = 'INSERT' or new.capacity is distinct from old.capacity)
     and new.capacity is not null and new.capacity > room.capacity then
    raise exception 'The group is larger than the room (%)', room.capacity
      using errcode = 'EM002', detail = room.capacity::text;
  end if;

  if rescheduled and public.group_uses_room(new.status, new.archived_at) then
    select c.group_name into clash
    from public.room_clashes(new.room_id, new.days, new.start_time, new.duration_min, new.id) c
    limit 1;
    if clash is not null then
      raise exception 'The room is taken by % at that time', clash
        using errcode = 'EM001', detail = clash;
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_group_room before insert or update on public.groups
  for each row execute function public.guard_group_room();

-- ───────────────────────── Rules for rooms ─────────────────────────

-- A room cannot be archived while a group uses it, and cannot be made
-- smaller than a group that uses it.
create function public.guard_room_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null and exists (
    select 1 from public.groups g
    where g.room_id = new.id and public.group_uses_room(g.status, g.archived_at)
  ) then
    raise exception 'A group still uses this room' using errcode = 'EM003';
  end if;

  if new.capacity < old.capacity and exists (
    select 1 from public.groups g
    where g.room_id = new.id and public.group_uses_room(g.status, g.archived_at)
      and g.capacity > new.capacity
  ) then
    raise exception 'A group in this room is larger than that' using errcode = 'EM004';
  end if;

  return new;
end;
$$;

create trigger guard_room_update before update on public.rooms
  for each row execute function public.guard_room_update();

-- ───────────────────────────── Grants ─────────────────────────────

revoke execute on function
  public.group_uses_room(public.group_status, timestamptz),
  public.room_clashes(uuid, smallint[], time, integer, uuid)
from public, anon;

grant execute on function
  public.group_uses_room(public.group_status, timestamptz),
  public.room_clashes(uuid, smallint[], time, integer, uuid)
to authenticated, service_role;

-- Trigger functions are not part of the API.
revoke execute on function public.guard_group_room(), public.guard_room_update()
from public, anon, authenticated;
