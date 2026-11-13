-- Leads: every status change writes a row to the lead's timeline, whoever
-- makes it and however (board, sheet, API). A trial needs its group and date.

create function public.log_lead_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.lead_activities (lead_id, kind, body, from_status, to_status, created_by)
    values (
      new.id,
      'status_change',
      case when new.status = 'lost' then new.lost_reason end,
      old.status,
      new.status,
      (select auth.uid())
    );
  end if;
  return new;
end;
$$;

create trigger log_status_change
  after update of status on public.leads
  for each row execute function public.log_lead_status_change();

revoke execute on function public.log_lead_status_change() from public, anon, authenticated;

alter table public.leads
  add constraint leads_trial_shape
  check (status <> 'trial' or (trial_group_id is not null and trial_date is not null));
