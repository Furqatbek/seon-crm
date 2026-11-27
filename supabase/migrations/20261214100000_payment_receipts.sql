-- Card payments and receipts. docs/STUDENT_APP_SPEC.md → "Rules → Receipts"
-- and "Data model" (payment_receipts).
--
-- A linked student transfers money to the centre's card and sends a receipt
-- from the app. The file goes straight to a private bucket; the CRM then reads
-- it, checks from its content that it is a PNG, a JPG or a PDF of at most
-- 5 MB, and only then writes the receipt with submit_receipt(). The owner or
-- a manager approves it (exactly one payment, by transfer, linked to the
-- receipt) or rejects it with a reason.

create type public.receipt_status as enum ('pending', 'approved', 'rejected');

create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id),
  -- Who sent it; kept when the account is deleted in the app.
  profile_id uuid references public.profiles (id) on delete set null,
  group_id uuid not null references public.groups (id),
  amount bigint not null check (amount > 0),
  paid_on date not null,
  -- An object in the receipts bucket, under the student's own folder.
  file_path text not null unique,
  file_type text not null check (file_type in ('png', 'jpg', 'pdf')),
  -- SHA-256 of the file, worked out by the server that checked it.
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  comment text check (comment is null or length(comment) <= 500),
  status public.receipt_status not null default 'pending',
  reject_reason text,
  payment_id uuid unique references public.payments (id),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_receipts_approved_shape check ((status = 'approved') = (payment_id is not null)),
  constraint payment_receipts_rejected_shape check ((status = 'rejected') = (btrim(coalesce(reject_reason, '')) <> '')),
  constraint payment_receipts_reviewed_shape check ((status = 'pending') = (reviewed_at is null))
);

create index payment_receipts_student_idx on public.payment_receipts (student_id, created_at desc);
create index payment_receipts_pending_idx on public.payment_receipts (created_at) where status = 'pending';
create index payment_receipts_hash_idx on public.payment_receipts (file_hash);

alter table public.payment_receipts enable row level security;
revoke all on public.payment_receipts from public, anon, authenticated;
grant select on public.payment_receipts to authenticated;

-- The owner and managers see every receipt; a student sees their own. Nobody
-- writes one through the API: sending and reviewing are functions.
create policy payment_receipts_select on public.payment_receipts for select to authenticated
  using ((select public.is_staff()) or student_id = (select public.my_student_id()));

-- New receipts reach the CRM live (row level security applies to Realtime too).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_receipts') then
    alter publication supabase_realtime add table public.payment_receipts;
  end if;
end;
$$;

-- The files: private, 5 MB, PNG, JPG or PDF. A student puts a file in their
-- own folder (<student id>/…) and reads their own; the owner and managers
-- read them all, through short-lived signed links. Nobody changes or removes
-- a file through the API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/png', 'image/jpeg', 'application/pdf'])
on conflict (id) do nothing;

create policy receipts_read on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (
    (select public.is_staff())
    or (storage.foldername(name))[1] = (select public.my_student_id())::text
  ));

create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select public.my_student_id())::text);

-- Writes a receipt for a student's app account. Called by the CRM's server
-- only, after it has read the uploaded file and checked its type from its
-- content and its size: the type and the hash given here are the server's.
--   ER001 not a linked student · ER002 not one of the student's groups
--   ER003 amount · ER004 date · ER005 file
create function public.submit_receipt(
  p_profile_id uuid,
  p_group_id uuid,
  p_amount bigint,
  p_paid_on date,
  p_file_path text,
  p_file_type text,
  p_file_hash text,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  target uuid;
  new_id uuid;
begin
  select * into p from public.profiles x where x.id = p_profile_id and x.is_active and x.role = 'student' and x.student_id is not null;
  if not found then
    raise exception 'Receipts are for linked students' using errcode = 'ER001';
  end if;
  -- The group paid for: the one named, or the student's only running one.
  if p_group_id is not null then
    select e.group_id into target from public.enrollments e where e.student_id = p.student_id and e.group_id = p_group_id limit 1;
  else
    select min(e.group_id::text)::uuid into target from public.enrollments e
    where e.student_id = p.student_id and e.status = 'active'
    having count(distinct e.group_id) = 1;
  end if;
  if target is null then
    raise exception 'Not one of the student''s groups' using errcode = 'ER002';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then
    raise exception 'Invalid amount' using errcode = 'ER003';
  end if;
  if p_paid_on is null or p_paid_on > public.tashkent_today() or p_paid_on < public.tashkent_today() - 90 then
    raise exception 'Invalid date' using errcode = 'ER004';
  end if;
  if p_file_type is null or p_file_type not in ('png', 'jpg', 'pdf')
    or coalesce(p_file_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_file_path, '') not like p.student_id::text || '/%'
    or exists (select 1 from public.payment_receipts r where r.file_path = p_file_path)
  then
    raise exception 'Invalid file' using errcode = 'ER005';
  end if;
  insert into public.payment_receipts (student_id, profile_id, group_id, amount, paid_on, file_path, file_type, file_hash, comment)
  values (p.student_id, p.id, target, p_amount, p_paid_on, p_file_path, p_file_type, p_file_hash, nullif(btrim(coalesce(p_comment, '')), ''))
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.submit_receipt(uuid, uuid, bigint, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_receipt(uuid, uuid, bigint, date, text, text, text, text) to service_role;

-- Receipts for the Finance → Receipts list, with what makes one look like a
-- duplicate: the same file as another receipt (whoever sent it), or the same
-- amount and date from the same student. Rejected receipts are not counted
-- against the others.
create function public.receipts_for_review(p_status public.receipt_status default 'pending', p_limit integer default 200)
returns table (
  id uuid, student_id uuid, student_name text, group_id uuid, group_name text, amount bigint, paid_on date,
  file_path text, file_type text, comment text, status public.receipt_status, reject_reason text,
  payment_id uuid, receipt_no bigint, created_at timestamptz, reviewed_at timestamptz, reviewed_by_name text,
  same_file boolean, same_amount_date boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only the owner and managers review receipts' using errcode = '42501';
  end if;
  return query
  select r.id, r.student_id, s.full_name, r.group_id, g.name, r.amount, r.paid_on,
         r.file_path, r.file_type, r.comment, r.status, r.reject_reason,
         r.payment_id, pay.receipt_no, r.created_at, r.reviewed_at, reviewer.full_name,
         exists (select 1 from public.payment_receipts o where o.id <> r.id and o.file_hash = r.file_hash and o.status <> 'rejected'),
         exists (select 1 from public.payment_receipts o where o.id <> r.id and o.student_id = r.student_id
                 and o.amount = r.amount and o.paid_on = r.paid_on and o.status <> 'rejected')
  from public.payment_receipts r
  join public.students s on s.id = r.student_id
  join public.groups g on g.id = r.group_id
  left join public.payments pay on pay.id = r.payment_id
  left join public.profiles reviewer on reviewer.id = r.reviewed_by
  where r.status = p_status
  order by case when p_status = 'pending' then r.created_at end, r.reviewed_at desc nulls last
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke execute on function public.receipts_for_review(public.receipt_status, integer) from public, anon;
grant execute on function public.receipts_for_review(public.receipt_status, integer) to authenticated;

-- Approve or reject a pending receipt; the owner and managers.
--   approve: records exactly one payment by transfer, linked to the receipt.
--            The group, amount, time and note default to the receipt's own;
--            Take payment may correct them. Returns the payment's id.
--   reject:  needs a reason. Returns null.
--   ER006 the receipt is not pending any more · ER007 a rejection needs a reason
create function public.review_receipt(
  p_id uuid,
  p_action text,
  p_reason text default null,
  p_group_id uuid default null,
  p_amount bigint default null,
  p_paid_at timestamptz default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.payment_receipts;
  target uuid;
  payment uuid;
begin
  if not public.is_staff() then
    raise exception 'Only the owner and managers review receipts' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  select * into r from public.payment_receipts x where x.id = p_id for update;
  if not found then
    raise exception 'No such receipt' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'The receipt has already been reviewed' using errcode = 'ER006';
  end if;

  if p_action = 'reject' then
    if btrim(coalesce(p_reason, '')) = '' then
      raise exception 'A rejection needs a reason' using errcode = 'ER007';
    end if;
    update public.payment_receipts
    set status = 'rejected', reject_reason = left(btrim(p_reason), 300), reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = r.id;
    return null;
  end if;

  target := coalesce(p_group_id, r.group_id);
  perform 1 from public.enrollments e where e.student_id = r.student_id and e.group_id = target;
  if not found then
    raise exception 'Not one of the student''s groups' using errcode = 'ER002';
  end if;
  if coalesce(p_amount, r.amount) <= 0 then
    raise exception 'Invalid amount' using errcode = 'ER003';
  end if;
  if p_paid_at is not null and p_paid_at > now() + interval '1 minute' then
    raise exception 'Invalid date' using errcode = 'ER004';
  end if;
  insert into public.payments (student_id, group_id, amount, method, paid_at, note, received_by)
  values (
    r.student_id, target, coalesce(p_amount, r.amount), 'transfer',
    -- The day the student says they paid, at noon; today's payments at this moment.
    coalesce(p_paid_at, case when r.paid_on = public.tashkent_today() then now() else (r.paid_on + time '12:00') at time zone 'Asia/Tashkent' end),
    nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid())
  )
  returning id into payment;
  update public.payment_receipts
  set status = 'approved', payment_id = payment, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = r.id;
  return payment;
end;
$$;

revoke execute on function public.review_receipt(uuid, text, text, uuid, bigint, timestamptz, text) from public, anon;
grant execute on function public.review_receipt(uuid, text, text, uuid, bigint, timestamptz, text) to authenticated;

-- What the app's Pay by card page shows a student: the centre's card, the
-- instructions in the four languages, what the student owes, and where the
-- app asks for an uploaded receipt to be checked (the CRM's address, from
-- Vault; null when it is not set, and receipts cannot be sent).
create function public.pay_by_card_info()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  student uuid := public.my_student_id();
  app_url text;
begin
  if student is null then
    raise exception 'Card payments are for linked students' using errcode = '42501';
  end if;
  begin
    execute 'select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = ''app_url''' into app_url;
  exception when others then
    app_url := null;
  end;
  return (
    select jsonb_build_object(
      -- The folder of the receipts bucket the student's files go to.
      'student_id', student,
      'card', c.payment_card,
      'instructions', c.payment_instructions,
      -- A debt is a balance below zero.
      'amount_due', greatest(0, -coalesce((select b.balance from public.student_balances b where b.student_id = student), 0)),
      'submit_url', case when coalesce(app_url, '') <> '' then rtrim(app_url, '/') || '/api/v1/receipts' end
    )
    from public.centre_settings c
  );
end;
$$;

revoke execute on function public.pay_by_card_info() from public, anon;
grant execute on function public.pay_by_card_info() to authenticated;
