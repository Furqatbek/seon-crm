-- The form editor. docs/SPEC.md → "Lead forms add-on": "Form builder"
-- (funnels list), "Editor with live preview".
--
-- 1. Publishing goes through publish_lead_form(): it copies the draft to the
--    published copy, numbers the version and keeps it in lead_form_versions.
--    Staff no longer write the published copy or the versions directly.
-- 2. lead_forms_overview(): the funnels list with the last 30 days' figures.
--
-- Custom error codes raised below:
--   EF001  only the owner may publish a form without a required consent box
--   EF002  the draft is not a complete form (no fields, or no name or phone)

-- ─────────────────── What staff may write directly ───────────────────

revoke insert, update on public.lead_forms from authenticated;
grant insert (name, slug, subject, source_tag, draft) on public.lead_forms to authenticated;
grant update (name, slug, status, subject, source_tag, draft, archived_at) on public.lead_forms to authenticated;

drop policy lead_form_versions_insert on public.lead_form_versions;
revoke insert on public.lead_form_versions from authenticated;

-- Who edited last: set by the database, not by the browser.
create function public.lead_forms_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A signed-in person's change, made directly or through publish_lead_form().
  if (select auth.uid()) is not null then
    new.updated_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger touch before update on public.lead_forms
  for each row execute function public.lead_forms_touch();

-- ───────────────────────────── Publish ──────────────────────────────

create function public.publish_lead_form(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  form public.lead_forms;
  next_version integer;
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into form from public.lead_forms f where f.id = p_id and f.archived_at is null for update;
  if not found then
    raise exception 'Form not found' using errcode = 'P0002';
  end if;

  if jsonb_typeof(form.draft -> 'fields') is distinct from 'array'
     or not exists (select 1 from jsonb_array_elements(form.draft -> 'fields') f where f ->> 'maps_to' = 'name')
     or not exists (select 1 from jsonb_array_elements(form.draft -> 'fields') f where f ->> 'maps_to' = 'phone' and f ->> 'type' = 'phone') then
    raise exception 'The draft is not a complete form' using errcode = 'EF002';
  end if;
  -- The consent box is required on every form; only the owner can take it off.
  if not public.is_owner() and not exists (
    select 1 from jsonb_array_elements(form.draft -> 'fields') f
    where f ->> 'type' = 'consent' and (f ->> 'required')::boolean
  ) then
    raise exception 'Only the owner can publish a form without consent' using errcode = 'EF001';
  end if;

  update public.lead_forms f
  set published = f.draft,
      published_version = f.published_version + 1,
      published_at = now(),
      status = case when f.status = 'draft' then 'live'::public.form_status else f.status end
  where f.id = p_id
  returning f.published_version into next_version;

  insert into public.lead_form_versions (form_id, version, content, published_by)
  values (p_id, next_version, form.draft, (select auth.uid()));

  return next_version;
end;
$$;

-- ─────────────────────────── Funnels list ───────────────────────────
-- One row per form that is not archived, with the last 30 days:
-- views, leads that came through it, how many of those became students, and
-- conversion = leads ÷ views.

create function public.lead_forms_overview()
returns table (
  id uuid,
  name text,
  slug text,
  status public.form_status,
  has_changes boolean,
  updated_at timestamptz,
  updated_by_name text,
  views bigint,
  leads bigint,
  won bigint,
  conversion numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select f.id, f.name, f.slug, f.status,
         f.published is null or f.published <> f.draft,
         f.updated_at, p.full_name,
         v.views, l.leads, l.won,
         case when v.views > 0 then round(l.leads * 100.0 / v.views, 1) end
  from public.lead_forms f
  left join public.profiles p on p.id = coalesce(f.updated_by, f.created_by)
  cross join lateral (
    select coalesce(sum(s.views), 0)::bigint as views
    from public.form_daily_stats s
    where s.form_id = f.id and s.day > public.tashkent_today() - 30
  ) v
  cross join lateral (
    select count(*)::bigint as leads, count(*) filter (where d.status = 'won')::bigint as won
    from public.leads d
    where d.form_id = f.id and d.archived_at is null
      and d.created_at >= (public.tashkent_today() - 29)::timestamp at time zone 'Asia/Tashkent'
  ) l
  where f.archived_at is null
  order by f.created_at desc, f.name;
end;
$$;

revoke execute on function public.publish_lead_form(uuid), public.lead_forms_overview() from public, anon;
grant execute on function public.publish_lead_form(uuid), public.lead_forms_overview() to authenticated, service_role;
revoke execute on function public.lead_forms_touch() from public, anon, authenticated;
