-- Korean as an interface language. Staff and teachers can work in Korean;
-- the choice is remembered on their profile. Messages to students and
-- parents stay in uz, ru or en, so app_language (students, templates,
-- Telegram chats, the TV) is unchanged and profiles get a type of their own.

create type public.ui_language as enum ('uz', 'ru', 'en', 'ko');

alter table public.profiles alter column language drop default;
alter table public.profiles
  alter column language type public.ui_language using language::text::public.ui_language;
alter table public.profiles alter column language set default 'uz';

-- A new login may be invited in Korean. The rest of the function is unchanged.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  app_role_text text := new.raw_app_meta_data ->> 'role';
  invite_role_text text := new.raw_user_meta_data ->> 'role';
  language_text text := new.raw_user_meta_data ->> 'language';
  name_text text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  teacher_text text;
  role_text text;
  new_role public.user_role := 'manager';
  new_teacher uuid;
  active boolean := false;
begin
  if app_role_text in ('owner', 'manager', 'teacher') then
    role_text := app_role_text;
    teacher_text := new.raw_app_meta_data ->> 'teacher_id';
    active := true;
  elsif new.invited_at is not null then
    role_text := case when invite_role_text in ('owner', 'manager', 'teacher') then invite_role_text else 'manager' end;
    teacher_text := new.raw_user_meta_data ->> 'teacher_id';
    active := true;
  end if;

  if role_text = 'teacher' then
    if teacher_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select t.id into new_teacher
      from public.teachers t
      where t.id = teacher_text::uuid
        and t.archived_at is null
        and not exists (select 1 from public.profiles p where p.teacher_id = t.id);
    end if;
    if new_teacher is null then
      -- No usable teacher record: an inactive profile the owner can sort out.
      role_text := 'manager';
      active := false;
    end if;
  end if;

  if role_text is not null then
    new_role := role_text::public.user_role;
  end if;

  insert into public.profiles (id, full_name, role, teacher_id, language, is_active)
  values (
    new.id,
    coalesce(name_text, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'User'),
    new_role,
    new_teacher,
    case when language_text in ('uz', 'ru', 'en', 'ko')
      then language_text::public.ui_language else 'uz' end,
    active
  )
  on conflict (id) do nothing;

  return new;
end;
$function$
;
