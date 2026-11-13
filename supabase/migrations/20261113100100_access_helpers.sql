-- Who is calling, the profile created for every auth user, and the guard
-- triggers that row level security cannot express on its own (it sees the new
-- row but not which columns changed).

-- ───────────────────────── Role helpers ──────────────────────────

-- The caller's role, or null when there is no active profile (not signed in,
-- or deactivated). security definer so it can read profiles from inside the
-- policies on profiles without recursing.
create function public.app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active;
$$;

create function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() = 'owner', false);
$$;

-- Any active staff member: owner or manager.
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.app_role() is not null;
$$;

-- True for requests that arrive through the API as a signed-in user. Migrations,
-- the seed, scheduled jobs and the service role are not restricted by the guards.
create function public.is_api_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user = 'authenticated';
$$;

-- ─────────────────── Profile for every auth user ─────────────────

-- Role comes from the invite. Trusted sources, in order:
--   1. app metadata  — only the service role can write it
--   2. user metadata — only when the user was invited by the owner
-- Anyone else (a self sign-up, a user added by hand without a role) gets an
-- inactive manager profile and sees nothing until the owner activates it.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_role_text text := new.raw_app_meta_data ->> 'role';
  invite_role_text text := new.raw_user_meta_data ->> 'role';
  language_text text := new.raw_user_meta_data ->> 'language';
  name_text text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  new_role public.user_role := 'manager';
  active boolean := false;
begin
  if app_role_text in ('owner', 'manager') then
    new_role := app_role_text::public.user_role;
    active := true;
  elsif new.invited_at is not null then
    if invite_role_text in ('owner', 'manager') then
      new_role := invite_role_text::public.user_role;
    end if;
    active := true;
  end if;

  insert into public.profiles (id, full_name, role, language, is_active)
  values (
    new.id,
    coalesce(name_text, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'User'),
    new_role,
    case when language_text in ('uz', 'ru', 'en')
      then language_text::public.app_language else 'uz' end,
    active
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts that already exist were created by hand by the project's admin
-- before this migration, so they stay usable.
insert into public.profiles (id, full_name, role, is_active)
select
  u.id,
  coalesce(
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'User'
  ),
  case when u.raw_app_meta_data ->> 'role' = 'owner'
    then 'owner'::public.user_role else 'manager'::public.user_role end,
  true
from auth.users u
on conflict (id) do nothing;

-- ───────────────────────── Guard triggers ────────────────────────

-- Only the owner archives or restores a record.
create function public.guard_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_api_user() and not public.is_owner() then
    if tg_op = 'INSERT' and new.archived_at is not null then
      raise exception 'Only the owner can archive records' using errcode = '42501';
    elsif tg_op = 'UPDATE' and new.archived_at is distinct from old.archived_at then
      raise exception 'Only the owner can archive records' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['leads', 'students', 'teachers', 'groups', 'expenses'] loop
    execute format(
      'create trigger guard_archive before insert or update on public.%I
         for each row execute function public.guard_archive()', t);
  end loop;
end;
$$;

-- A manager may change their own name and language, nothing else.
create function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_api_user() and not public.is_owner() then
    if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
      raise exception 'Only the owner can change roles or deactivate users'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- A payment is a ledger entry: once taken, only the void columns can change,
-- and a void is final.
create function public.guard_payment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.student_id is distinct from old.student_id
    or new.group_id is distinct from old.group_id
    or new.amount is distinct from old.amount
    or new.method is distinct from old.method
    or new.paid_at is distinct from old.paid_at
    or new.receipt_no is distinct from old.receipt_no
    or new.received_by is distinct from old.received_by
  then
    raise exception 'A payment cannot be edited; void it and take a new one'
      using errcode = '42501';
  end if;
  if old.voided_at is not null
    and (new.voided_at is distinct from old.voided_at
      or new.void_reason is distinct from old.void_reason
      or new.voided_by is distinct from old.voided_by)
  then
    raise exception 'A voided payment cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_payment_update before update on public.payments
  for each row execute function public.guard_payment_update();

-- A paid payout is locked and never recalculated.
create function public.guard_payout_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'paid' then
    raise exception 'A paid payout cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_payout_update before update on public.teacher_payouts
  for each row execute function public.guard_payout_update();

-- Trigger functions are not part of the API.
revoke execute on function
  public.handle_new_user(),
  public.guard_archive(),
  public.guard_profile_update(),
  public.guard_payment_update(),
  public.guard_payout_update(),
  public.set_updated_at()
from public, anon, authenticated;
