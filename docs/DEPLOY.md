# Deploying Edu CRM

A walk-through for putting the app into production: a Supabase project for the
database and sign-in, Vercel for the app, a Telegram bot and an Eskiz account
for reminders. Do the steps in order; each one ends with a check.

Menu names in the Supabase, Vercel, Telegram and Eskiz dashboards change from
time to time. Where a label below does not match what you see, look for the
nearest equivalent; the values to enter are what matters.

You need: this repository on GitHub, Node 22.18 or newer on your computer, and
accounts at supabase.com, vercel.com and eskiz.uz, plus Telegram.

---

## 0. Before you start

Run the checks on your computer. Production should only ever get a commit that
passes all of them.

```bash
npm ci
```

```bash
npm run lint && npm run typecheck && npm run build
```

Choose now, and write down somewhere safe (a password manager, not the repo):

| What | How to get it |
| --- | --- |
| Production address | The domain the centre will use, for example `crm.example.uz` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 32` (letters, digits, `_` and `-` only) |
| Database password | Generated when you create the Supabase project |

```bash
openssl rand -hex 32
```

---

## 1. Create the production Supabase project

1. In the Supabase dashboard, create a **new project**. Do not reuse the dev
   project: production must not hold demo data.
2. Pick the region closest to Uzbekistan that is offered to you. Save the
   database password it generates.
3. Wait until the project is ready, then open **Project Settings → API** (also
   shown as "API Keys" / "Data API") and copy:
   - the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - the **publishable** key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - the **secret** key → `SUPABASE_SECRET_KEY`. This key bypasses every
     permission rule. It goes into Vercel only, never into the browser, the
     repository or a chat.
4. Note the **project ref**: the short id in the project URL
   (`https://<project-ref>.supabase.co`).

Check: you have the URL, both keys, the project ref and the database password.

---

## 2. Push the migrations

This creates every table, permission rule, function, scheduled job and the
default message templates. It does **not** load `supabase/seed.sql`; that file
is demo data for development only.

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <project-ref>
```

The project ref is the short id alone (for `https://abcd1234.supabase.co` it
is `abcd1234`), not the whole address.

Look at what will be applied before applying it:

```bash
npx supabase db push --remote --dry-run
```

```bash
npx supabase db push --remote
```

`--remote` is what makes the command act on the linked project: without it
the CLI targets the local database on your computer. The first line it prints
names the target; read it before confirming.

Never add `--include-seed` against production.

Check, in the dashboard's **SQL Editor**:

```sql
select count(*) as templates from public.message_templates;          -- 24
select centre_name, billing_day, due_day from public.centre_settings; -- one row
select count(*) as students from public.students;                    -- 0
```

After pushing, unlink your computer from production so a later `db push` or
`db reset` meant for dev cannot hit it by accident, and link the dev project
again when you go back to development:

```bash
npx supabase unlink
```

---

## 3. Check the scheduled jobs (Supabase Cron)

The migrations schedule four jobs. Times are UTC; Tashkent is UTC+5.

| Job | Schedule (UTC) | Tashkent time | What it does |
| --- | --- | --- | --- |
| `activate-groups-daily` | `5 19 * * *` | 00:05 daily | A group whose start date has come becomes active |
| `generate-lessons-daily` | `10 19 * * *` | 00:10 daily | Keeps lessons generated 30 days ahead |
| `monthly-charges-billing-day` | `10 19 * * *` | 00:10 daily | On the billing day, creates the month's charges |
| `reminders-every-15-minutes` | `*/15 * * * *` | every 15 min | Calls the app's reminders route |

Check, in the SQL Editor:

```sql
select jobname, schedule, active from cron.job order by jobname;
```

You should see the four rows above, all active.

**If the list is empty or the query fails**, the `pg_cron` or `pg_net`
extension was not enabled when the migrations ran. Enable both under
**Database → Extensions**, then run:

```sql
select cron.schedule('activate-groups-daily', '5 19 * * *', 'select public.activate_started_groups()');
select cron.schedule('generate-lessons-daily', '10 19 * * *', 'select public.generate_all_lessons()');
select cron.schedule('monthly-charges-billing-day', '10 19 * * *', 'select public.run_billing_day()');
select cron.schedule('reminders-every-15-minutes', '*/15 * * * *', 'select public.call_reminders_job()');
```

The reminders job does nothing until it knows where the app is and has the
secret. You will give it both in step 7, once the app has an address.

---

## 4. Configure sign-in (Supabase Auth)

In **Authentication** settings:

1. **URL configuration**
   - **Site URL**: `https://<your domain>`
   - **Redirect URLs**: add `https://<your domain>/**`

   Without the redirect URL, invitation and password-reset links send people
   to the wrong address.
2. **Sign-ups**: turn **off** "Allow new users to sign up". Staff are invited
   by the owner from Settings → Users. (Even if left on, a self-registered
   account gets an inactive profile and sees nothing.)
3. **Email**: Supabase's built-in email sender is limited to a few messages
   per hour and is meant for testing. Before inviting staff, set up **custom
   SMTP** with your own mail provider. Invitation and reset emails use
   Supabase's standard templates; you may translate their text there, but keep
   the link as it is.

Check: the Site URL and the redirect URL show your production domain.

---

## 5. Deploy the app on Vercel

1. In Vercel, **Add New → Project** and import the GitHub repository. The
   framework is detected as Next.js; leave the build settings as they are.
2. Before the first deploy, add the **environment variables** for the
   **Production** environment:

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 1 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key from step 1 |
   | `SUPABASE_SECRET_KEY` | Secret key from step 1 (mark as sensitive) |
   | `APP_URL` | `https://<your domain>`, no trailing slash |
   | `CRON_SECRET` | The value you generated in step 0 |
   | `TELEGRAM_BOT_TOKEN` | From step 8; leave empty for now |
   | `TELEGRAM_WEBHOOK_SECRET` | The value you generated in step 0 |
   | `ESKIZ_EMAIL` | From step 9; leave empty for now |
   | `ESKIZ_PASSWORD` | From step 9; leave empty for now |
   | `ESKIZ_SENDER` | Your approved sender name; empty uses Eskiz's shared `4546` |

   `SUPABASE_DB_URL` is only for running the tests. Do **not** set it in
   Vercel.

   If you use Vercel preview deployments, do not give the Preview environment
   the production Supabase keys: point previews at the dev project or leave
   them without keys.
3. Choose the production branch and press **Deploy**.

Check: the deployment finishes, and its `*.vercel.app` address shows the
sign-in page.

A changed environment variable only takes effect after a **redeploy**.

---

## 6. Connect the domain

1. In the Vercel project, **Settings → Domains → Add** your domain.
2. Vercel shows the DNS record to create (usually a `CNAME` for a subdomain or
   an `A` record for a root domain). Create it at your domain registrar.
3. Wait until Vercel shows the domain as valid; the certificate is issued
   automatically.
4. Confirm that `APP_URL` in Vercel and the Site URL in Supabase (step 4) are
   exactly this address, then redeploy if you changed `APP_URL`.

Check: `https://<your domain>` shows the sign-in page with a valid padlock.

---

## 7. Give the reminders job its address and secret (Supabase Vault)

The job that runs every 15 minutes reads two secrets from Supabase Vault. In
the SQL Editor of the **production** project:

```sql
select vault.create_secret('https://<your domain>', 'app_url');
select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');
```

`cron_secret` must be exactly the `CRON_SECRET` set in Vercel.

To change one later:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'cron_secret'),
  '<new value>'
);
```

Check from your computer. The first call must be refused, the second accepted:

```bash
curl -i -X POST https://<your domain>/api/jobs/reminders
```

```bash
curl -i -X POST https://<your domain>/api/jobs/reminders -H "Authorization: Bearer <the CRON_SECRET value>"
```

Expected: `401` for the first; `200` with a small JSON summary such as
`{"sent":0,"failed":0,"skipped":0,"duplicate":0}` for the second.

Then, after the next quarter hour, confirm Supabase reached the app:

```sql
select status_code, created from net._http_response order by created desc limit 3;
```

A `200` there means the schedule, the address and the secret all line up. A
`401` means the two secrets differ.

---

## 8. Create the owner account

There is no public registration, so the first owner is created by hand.

1. In Supabase, **Authentication → Users → Add user → Create new user**. Enter
   the owner's email and a temporary password, and tick **Auto Confirm User**.
2. A new account starts as an inactive manager. Make it the owner in the SQL
   Editor:

   ```sql
   update public.profiles
   set role = 'owner', is_active = true, full_name = '<Owner Name>', language = 'uz'
   where id = (select id from auth.users where email = '<owner email>');
   ```

   It must report `UPDATE 1`. (`language` is `uz`, `ru` or `en`.)
3. Sign in at `https://<your domain>` with that email and password.
4. Open the account menu → **Profile** and change the password.
5. Open **Settings → Centre** and set the centre's name, billing day and due
   day. The name appears on the sign-in page, receipts and messages.
6. Invite everyone else from **Settings → Users**. Do not create further
   accounts by hand.

Check: the owner sees all six sections plus Settings; an invited manager gets
an email, sets a password and lands on Groups.

---

## 9. Telegram: create the bot and register the webhook

1. In Telegram, talk to **@BotFather**: `/newbot`, choose a name and a
   username. BotFather replies with the bot **token**.
2. Put the token in Vercel as `TELEGRAM_BOT_TOKEN` (Production) and
   **redeploy**.
3. Sign in as the owner and open **Settings → Notifications**. The Telegram
   card should show the bot's username and "Webhook not connected".
4. Press **Connect webhook**. The app calls Telegram's `setWebhook` with
   `https://<your domain>/api/telegram/webhook` and the secret token, and
   saves the bot's username for the links on student pages. The card turns to
   "Connected".

   The button is disabled on anything but the deployed `https` address.

Check:

- Open any student → the Telegram card shows a link and a QR code.
- Open that link on your own phone and press **Start**. The bot answers that
  the student is linked, and the student page shows "Linked".
- Send `/stop` to the bot to unlink again.

If the card later shows "Last delivery error … 403", the
`TELEGRAM_WEBHOOK_SECRET` in Vercel changed after connecting: press **Connect
webhook** again.

---

## 10. Eskiz SMS

1. Register at eskiz.uz and top up the balance.
2. Put the account's email and password in Vercel as `ESKIZ_EMAIL` and
   `ESKIZ_PASSWORD`, then **redeploy**.
3. A new Eskiz account is in **test status**: it only delivers Eskiz's own
   fixed test text. Submit your message texts for approval in the Eskiz
   cabinet. Copy them from **Settings → Templates** (SMS channel), and keep
   them in plain Latin with a straight apostrophe: Cyrillic or `ʻ` halves how
   much fits in one SMS and roughly doubles the cost. The Templates screen
   shows the SMS count for each text.
4. If Eskiz gives you your own sender name, set it as `ESKIZ_SENDER` and
   redeploy.
5. In **Settings → Notifications**, the Eskiz card should say "Configured".
   Enter your own number and press **Send test SMS**.

Check: the SMS arrives. If it does not, the card shows what Eskiz answered.

You can also test both channels from your computer, with the production
values in `.env.local`:

```bash
node scripts/notify-test.mjs --phone +998901234567
```

---

## 11. Switch reminders on and do a last pass

1. **Settings → Notifications**: check the quiet hours (21:00–09:00 by
   default) and the lesson reminder hours, and that "Send automatic reminders"
   is on.
2. Go through one real flow end to end: add a teacher and set a pay rate,
   create a group, add a student, enrol them, take a payment, print the
   receipt.
3. Open a student → **Messages** after the first reminders are due and confirm
   they are logged as sent.

---

## After go-live

- **Updating the app**: push to the production branch; Vercel deploys it. If
  the change includes new files in `supabase/migrations/`, link the production
  project and run `npx supabase db push --remote` first, so the database is never
  behind the code.
- **Backups**: check which backup schedule your Supabase plan includes, and
  whether it is enough for a system that holds payments.
- **A paused database stops everything**: on Supabase's free plan a project is
  paused after a period without activity, and scheduled jobs stop with it. A
  centre in daily use should be on a plan that is not paused.
- **Rotating a secret**: change it in Vercel, redeploy, then update the
  matching place: Vault for `CRON_SECRET` (step 7), **Connect webhook** for
  `TELEGRAM_WEBHOOK_SECRET` (step 9).
- **If reminders stop**: run the two checks at the end of step 7, then look at
  Settings → Notifications for the Telegram and Eskiz status.
