-- Settings and users. docs/SPEC.md → "Screens → Settings", "Roles and permissions".
--
-- Custom error code raised below: EU001 the centre would be left without an owner.

-- The centre always keeps at least one active owner: the last one cannot be
-- made a manager or deactivated, by anyone, so nobody can lock the centre out
-- of its own settings.
create function public.guard_last_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.is_active
     and (new.role <> 'owner' or not new.is_active)
     and not exists (
       select 1 from public.profiles p
       where p.id <> old.id and p.role = 'owner' and p.is_active
     )
  then
    raise exception 'The centre needs at least one active owner' using errcode = 'EU001';
  end if;
  return new;
end;
$$;

create trigger guard_last_owner before update on public.profiles
  for each row execute function public.guard_last_owner();

revoke execute on function public.guard_last_owner() from public, anon, authenticated;

-- Fees are due on or after the day they are billed.
alter table public.centre_settings
  add constraint centre_settings_due_after_billing check (due_day >= billing_day);
