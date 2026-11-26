-- The push for a classmate's challenge. docs/STUDENT_APP_SPEC.md → "App
-- behaviour → Game tab" (incoming challenge card and push).
--
-- A challenge lives 60 seconds, so it cannot wait for the job that runs every
-- 15 minutes: the moment an invite is written, the database asks the app to
-- push it, the same way the cron job calls the reminders (the app's address
-- and the cron secret from Vault). Without pg_net or the two secrets nothing
-- is sent, and the invite itself is never held up: the app shows it live anyway.

create function public.match_invite_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  secret text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return null;
  end if;
  select ds.decrypted_secret into app_url from vault.decrypted_secrets ds where ds.name = 'app_url';
  select ds.decrypted_secret into secret from vault.decrypted_secrets ds where ds.name = 'cron_secret';
  if coalesce(app_url, '') = '' or coalesce(secret, '') = '' then
    return null;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3)'
    using rtrim(app_url, '/') || '/api/game/invite-push',
          jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
          jsonb_build_object('invite_id', new.id);
  return null;
exception when others then
  -- A push that cannot be asked for never stops a challenge.
  return null;
end;
$$;

revoke execute on function public.match_invite_push() from public, anon, authenticated;

create trigger match_invites_push
after insert on public.match_invites
for each row execute function public.match_invite_push();
