-- Students: list view with balances, Mark as left, Convert to student, and
-- the read-only rule for a won lead.

-- ─────────────────────── Students with balances ──────────────────
-- One row per student for the list: filter and page by debt in the database.
-- security_invoker: the caller's row level security applies.

create view public.student_overview
with (security_invoker = true) as
select
  s.*,
  b.charged,
  b.paid,
  b.balance,
  b.oldest_unpaid_month
from public.students s
join public.student_balances b on b.student_id = s.id;

grant select on public.student_overview to authenticated;

-- ───────────────────────── Mark as left ──────────────────────────
-- The student leaves the centre: every active enrolment ends today, so no
-- further monthly fees are created. No refund happens automatically.
-- Runs with the caller's rights: row level security decides who may do it.

create function public.mark_student_left(p_student_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Tashkent')::date;
begin
  update public.students
  set status = 'left'
  where id = p_student_id and archived_at is null;
  if not found then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;

  update public.enrollments
  set status = 'left', left_on = greatest(joined_on, today)
  where student_id = p_student_id and status = 'active';
end;
$$;

-- ─────────────────────── Convert to student ──────────────────────
-- Creates the student from the lead, links both ways and marks the lead Won,
-- in one transaction. The lead's timeline row is written by its trigger.

create function public.convert_lead_to_student(
  p_lead_id uuid,
  p_full_name text,
  p_phone text,
  p_parent_name text default null,
  p_parent_phone text default null,
  p_birth_date date default null,
  p_language public.app_language default 'uz',
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  lead_status public.lead_status;
  new_student_id uuid;
begin
  select status into lead_status
  from public.leads
  where id = p_lead_id and archived_at is null
  for update;

  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;
  if lead_status not in ('new', 'contacted', 'trial') then
    raise exception 'Only an open lead can be converted' using errcode = 'P0001';
  end if;

  insert into public.students (
    full_name, phone, parent_name, parent_phone, birth_date, language, notes, lead_id
  )
  values (
    p_full_name, p_phone, p_parent_name, p_parent_phone, p_birth_date, p_language, p_notes,
    p_lead_id
  )
  returning id into new_student_id;

  update public.leads
  set status = 'won', converted_student_id = new_student_id, next_contact_at = null
  where id = p_lead_id;

  return new_student_id;
end;
$$;

revoke execute on function
  public.mark_student_left(uuid),
  public.convert_lead_to_student(uuid, text, text, text, text, date, public.app_language, text)
from public, anon;

grant execute on function
  public.mark_student_left(uuid),
  public.convert_lead_to_student(uuid, text, text, text, text, date, public.app_language, text)
to authenticated, service_role;

-- ─────────────────────── A won lead is read-only ─────────────────
-- After conversion only archiving (by the owner) can still change the lead.

create function public.guard_won_lead()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_api_user()
    and old.status = 'won'
    and (to_jsonb(new) - 'archived_at' - 'updated_at')
        is distinct from (to_jsonb(old) - 'archived_at' - 'updated_at')
  then
    raise exception 'A won lead is read-only' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_won_lead before update on public.leads
  for each row execute function public.guard_won_lead();

revoke execute on function public.guard_won_lead() from public, anon, authenticated;
