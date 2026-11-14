-- Row level security — docs/SPEC.md → "Roles and permissions".
--
-- Table privileges first, policies second:
--   * anon gets nothing.
--   * authenticated gets select / insert / update where a policy can allow it,
--     and never delete: business records are archived, not deleted.
--   * every policy requires an active profile (is_staff / is_owner), so a
--     deactivated user is blocked everywhere at once.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'centre_settings', 'message_templates', 'leads', 'lead_activities',
    'teachers', 'teacher_pay_rates', 'students', 'groups', 'enrollments', 'lessons',
    'attendance', 'charges', 'payments', 'expenses', 'teacher_payouts', 'messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- ───────────────────── Settings and users ────────────────────────
-- Owner: full. Manager: own name and language only.

grant select, update on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using ((select public.is_staff()));

-- Which columns a manager may change is enforced by guard_profile_update.
create policy profiles_update on public.profiles
  for update to authenticated
  using ((select public.is_owner()) or ((select public.is_staff()) and id = (select auth.uid())))
  with check ((select public.is_owner()) or ((select public.is_staff()) and id = (select auth.uid())));

grant select, update on public.centre_settings to authenticated;

create policy centre_settings_select on public.centre_settings
  for select to authenticated
  using ((select public.is_staff()));

create policy centre_settings_update on public.centre_settings
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- ─────────────────────────── Messages ────────────────────────────
-- Owner: send, edit templates. Manager: send a one-off message to a student.
-- Delivery status is written by the server with the service role.

grant select, insert, update on public.message_templates to authenticated;

create policy message_templates_select on public.message_templates
  for select to authenticated
  using ((select public.is_staff()));

create policy message_templates_insert on public.message_templates
  for insert to authenticated
  with check ((select public.is_owner()));

create policy message_templates_update on public.message_templates
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

grant select, insert on public.messages to authenticated;

create policy messages_select on public.messages
  for select to authenticated
  using ((select public.is_staff()));

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    status = 'queued'
    and sent_at is null
    and ((select public.is_owner()) or ((select public.is_staff()) and type = 'custom'))
  );

-- ───────────────────────────── Leads ─────────────────────────────
-- Owner: full. Manager: full, except archive (guard_archive).

grant select, insert, update on public.leads to authenticated;

create policy leads_select on public.leads
  for select to authenticated
  using ((select public.is_staff()));

create policy leads_insert on public.leads
  for insert to authenticated
  with check ((select public.is_staff()));

create policy leads_update on public.leads
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- The timeline is append-only.
grant select, insert on public.lead_activities to authenticated;

create policy lead_activities_select on public.lead_activities
  for select to authenticated
  using ((select public.is_staff()));

create policy lead_activities_insert on public.lead_activities
  for insert to authenticated
  with check ((select public.is_staff()) and created_by = (select auth.uid()));

-- ──────────────────────────── Teachers ───────────────────────────
-- Owner: full, including pay rates. Manager: contact details and schedule only.

grant select, insert, update on public.teachers to authenticated;

create policy teachers_select on public.teachers
  for select to authenticated
  using ((select public.is_staff()));

create policy teachers_insert on public.teachers
  for insert to authenticated
  with check ((select public.is_owner()));

create policy teachers_update on public.teachers
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- A rate is history: a change is a new row with a later effective_from.
grant select, insert on public.teacher_pay_rates to authenticated;

create policy teacher_pay_rates_select on public.teacher_pay_rates
  for select to authenticated
  using ((select public.is_owner()));

create policy teacher_pay_rates_insert on public.teacher_pay_rates
  for insert to authenticated
  with check ((select public.is_owner()));

-- ──────────────────────────── Students ───────────────────────────
-- Owner: full. Manager: create, edit, enrol, transfer, mark as left.

grant select, insert, update on public.students to authenticated;

create policy students_select on public.students
  for select to authenticated
  using ((select public.is_staff()));

create policy students_insert on public.students
  for insert to authenticated
  with check ((select public.is_staff()));

create policy students_update on public.students
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

grant select, insert, update on public.enrollments to authenticated;

create policy enrollments_select on public.enrollments
  for select to authenticated
  using ((select public.is_staff()));

create policy enrollments_insert on public.enrollments
  for insert to authenticated
  with check ((select public.is_staff()));

create policy enrollments_update on public.enrollments
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- ─────────────────────── Groups and lessons ──────────────────────
-- Owner: full. Manager: create, edit, cancel a lesson, mark attendance.

grant select, insert, update on public.groups to authenticated;

create policy groups_select on public.groups
  for select to authenticated
  using ((select public.is_staff()));

create policy groups_insert on public.groups
  for insert to authenticated
  with check ((select public.is_staff()));

create policy groups_update on public.groups
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

grant select, insert, update on public.lessons to authenticated;

create policy lessons_select on public.lessons
  for select to authenticated
  using ((select public.is_staff()));

create policy lessons_insert on public.lessons
  for insert to authenticated
  with check ((select public.is_staff()));

create policy lessons_update on public.lessons
  for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- Managers can mark and edit attendance for 7 days after the lesson; the owner
-- any time. Days are counted in Tashkent.
create function public.attendance_is_editable(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lessons l
    where l.id = p_lesson_id
      and l.lesson_date >= (now() at time zone 'Asia/Tashkent')::date - 7
  );
$$;

grant select, insert, update on public.attendance to authenticated;

create policy attendance_select on public.attendance
  for select to authenticated
  using ((select public.is_staff()));

create policy attendance_insert on public.attendance
  for insert to authenticated
  with check (
    marked_by = (select auth.uid())
    and ((select public.is_owner())
      or ((select public.is_staff()) and public.attendance_is_editable(lesson_id)))
  );

create policy attendance_update on public.attendance
  for update to authenticated
  using (
    (select public.is_owner())
    or ((select public.is_staff()) and public.attendance_is_editable(lesson_id))
  )
  with check (
    marked_by = (select auth.uid())
    and ((select public.is_owner())
      or ((select public.is_staff()) and public.attendance_is_editable(lesson_id)))
  );

-- ──────────────────────────── Charges ────────────────────────────
-- Owner: generate a month, add credits. Manager: set the first-month amount
-- at enrolment; add a credit with a required note. Nobody edits a charge.

grant select, insert on public.charges to authenticated;

create policy charges_select on public.charges
  for select to authenticated
  using ((select public.is_staff()));

create policy charges_insert on public.charges
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select public.is_owner())
      or ((select public.is_staff()) and (
        type = 'monthly_fee'
        -- a credit: negative, and the table already requires its note
        or (type = 'adjustment' and amount < 0)
      ))
    )
  );

-- ─────────────────────────── Payments ────────────────────────────
-- Owner: take and void. Manager: take only.

grant select, insert, update on public.payments to authenticated;

create policy payments_select on public.payments
  for select to authenticated
  using ((select public.is_staff()));

create policy payments_insert on public.payments
  for insert to authenticated
  with check (
    (select public.is_staff())
    and received_by = (select auth.uid())
    and voided_at is null
  );

-- The only update is a void (guard_payment_update), by the owner, in their name.
create policy payments_update on public.payments
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()) and voided_by = (select auth.uid()));

-- ───────────────────── Expenses and salaries ─────────────────────
-- Owner: full. Manager: no access, not even to read.

grant select, insert, update on public.expenses to authenticated;

create policy expenses_owner_select on public.expenses
  for select to authenticated
  using ((select public.is_owner()));

create policy expenses_owner_insert on public.expenses
  for insert to authenticated
  with check ((select public.is_owner()));

create policy expenses_owner_update on public.expenses
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

grant select, insert, update on public.teacher_payouts to authenticated;

create policy teacher_payouts_owner_select on public.teacher_payouts
  for select to authenticated
  using ((select public.is_owner()));

create policy teacher_payouts_owner_insert on public.teacher_payouts
  for insert to authenticated
  with check ((select public.is_owner()));

create policy teacher_payouts_owner_update on public.teacher_payouts
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- ─────────────────────────── Debtors ─────────────────────────────
-- Owner and manager. The view runs with the caller's rights (security_invoker).

grant select on public.student_balances to authenticated;

-- ─────────────────────────── Functions ───────────────────────────

revoke execute on function
  public.app_role(),
  public.is_owner(),
  public.is_staff(),
  public.is_api_user(),
  public.attendance_is_editable(uuid),
  public.generate_link_code()
from public, anon;

grant execute on function
  public.app_role(),
  public.is_owner(),
  public.is_staff(),
  public.is_api_user(),
  public.attendance_is_editable(uuid),
  public.generate_link_code()
to authenticated, service_role;
