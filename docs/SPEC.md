# Education Centre CRM — Claude Code Build Prompts

Nov 13, 2026 · @Furqat

Thirteen copy-paste prompts plus the full spec they rely on, for building a staff-only education-centre CRM with Claude Code on Next.js, Supabase and Vercel.

## How to use this with Claude Code

Build the CRM in 13 small phases, one fresh Claude Code session per phase. `CLAUDE.md` carries the rules every session reads; `docs/SPEC.md` (this document) carries the full spec.

1. Create the accounts first: GitHub, Supabase (one project), Vercel, a Telegram bot from @BotFather, and an Eskiz.uz SMS account.
2. Make an empty folder named `edu-crm`, open a terminal in it and run `claude`.
3. Export this doc as Markdown and save it as `docs/SPEC.md` inside that folder.
4. Paste the Phase 0 prompt from "Build prompts". It scaffolds the project and creates `CLAUDE.md` from the section below.
5. For every later phase: run `/clear`, press `Shift+Tab` until the status bar shows plan mode, then paste the phase prompt.
6. Read the plan Claude proposes. Press `Ctrl+G` to edit it if something is wrong, then approve it.
7. Every prompt ends with checks Claude must run. Ask for evidence (test output, screenshots), then click through the acceptance list yourself.
8. Commit after each phase: type `commit with a descriptive message`. For Finance phases, run `/code-review` before committing.
9. If Claude gets the same thing wrong twice, run `/clear` and use a template from "Iteration prompts" instead of correcting again.

Keep phases in order. Each one depends on the tables and screens built before it.

## Decisions locked in

These come from your answers and are written into every prompt below.

| Decision | Answer |
| --- | --- |
| Build tool | Claude Code |
| Who logs in | Owner/Admin and Manager/reception only. Teachers, students and parents have no login. |
| Student fees | Fixed monthly fee per group |
| Teacher pay | All three models, chosen per teacher: fixed monthly salary, % of group revenue, fixed amount per lesson |
| Interface languages | Uzbek (Latin), Russian, English. Each user picks their own. |
| Currency | UZS only, whole soʻm, no decimals |
| Version 1 scope | Leads, Teachers, Students, Groups, Finance, Reports + attendance + Telegram/SMS reminders |
| Out of scope for v1 | Multiple branches, online payments (Click, Payme), teacher and student portals |
| Joining mid-month | System proposes a prorated first fee; the manager can switch to full month or type an amount |
| Hosting | Supabase (database, login, scheduled jobs) + Vercel (the app) |

Running it for a real business needs paid plans. Vercel's free Hobby plan is for personal, non-commercial use only, and Supabase pauses free projects after a week of low activity. Budget about $20 a month for Vercel Pro and $25 a month for Supabase Pro.

## Defaults to confirm before you build

You did not decide these, so I picked the simplest common option. Change any row here and in `docs/SPEC.md` before Phase 2; after that, changes cost a migration.

| Area | Default | Change it if |
| --- | --- | --- |
| Manager access | Leads, students, groups, attendance, taking payments, teacher list without pay rates. No expenses, salaries, profit, settings or deleting. | Managers should see money totals or salaries |
| Who marks attendance | Managers, from the group page | You want teachers to log in after all |
| Billing day and due day | Fees are charged on the 1st and due by the 5th. Owner can change both days in Settings. | Your centre bills on each student's join date |
| Discounts | Per-student discount on each enrolment, as % or a fixed soʻm amount | You never give discounts |
| Absences | A missed lesson does not reduce the monthly fee | Absences with a valid reason should be refunded |
| Leaving mid-month | No automatic refund. Manager adds a credit with a note. | You refund unused lessons automatically |
| Payment methods | Cash, card terminal, bank transfer, all entered by hand | You need others listed |
| % teacher pay basis | Share of money actually collected for that teacher's groups in the month | It should be based on fees billed, paid or not |
| Cancelled lessons | Not counted for per-lesson pay or for proration |  |
| Reminder channel | Telegram first; SMS only when the student has no Telegram linked | You want both every time |
| SMS provider | Eskiz.uz | You already use Play Mobile or another |
| Lead stages | New → Contacted → Trial lesson → Won / Lost | You use other stages |
| Sign-in | Email + password; the owner invites managers by email | You prefer phone + SMS code |
| Theme | Light mode only in v1 | You want dark mode too |
| Time zone | Asia/Tashkent (UTC+5), weeks start Monday |  |

## CLAUDE.md (project rules file)

Phase 0 saves this as `CLAUDE.md` in the project root. Claude Code reads it at the start of every session, so it stays short; the details live in `docs/SPEC.md`.

```markdown
# Edu CRM

Staff-only CRM for one education centre in Uzbekistan. Owner and Manager log in.
Teachers, students and parents never log in. Full spec: docs/SPEC.md — read the
section each task names before writing code.

## Stack
- Next.js, App Router, TypeScript strict, Server Components + Server Actions
- Supabase: Postgres, Auth (email + password), Row Level Security, Supabase Cron
- Tailwind CSS v4 + shadcn/ui restyled to our tokens, lucide-react icons
- next-intl for uz / ru / en; zod + react-hook-form for every form
- TanStack Table for lists, Recharts for report charts
- Vitest for logic tests, Playwright for end-to-end tests; hosted on Vercel

## Commands
- npm run dev | build | lint | typecheck | test | e2e
- npx supabase migration new <name>  → new migration file
- npx supabase db push               → apply migrations to the linked dev project
- npm run db:types                   → regenerate src/lib/supabase/types.ts

## Rules
- IMPORTANT: build only what the spec lists. No extra pages, fields or settings.
- Money = UZS as bigint whole soʻm. Never floats. Display only via formatMoney().
- Time zone Asia/Tashkent. Store timestamptz; a billing month is a date (1st of month).
- Every visible string goes through next-intl. Add each key to messages/uz.json,
  ru.json and en.json in the same change. Uzbek is Latin script with ʻ (U+02BB).
- RLS on every table. Permissions are enforced in the database, not only the UI.
- Balances, proration and salaries are computed in Postgres functions or
  src/lib/domain/ with unit tests. Components never calculate money.
- Never hard-delete business records: set archived_at. Only the owner archives.
- Colours, radii, shadows only from src/styles/tokens.css. No hard-coded values.
- Schema changes only as new files in supabase/migrations/. Never edit an applied one.
- Secrets only in environment variables. Never commit .env files.

## Structure
- src/app/[locale]/(app)/{leads,students,groups,teachers,finance,reports,settings}
- src/components/ui = shared primitives; src/components/<block> = block parts
- src/lib/domain = pure business logic + tests; src/lib/supabase = clients + types
- supabase/migrations, supabase/seed.sql

## Done means
Typecheck, lint and tests pass. The feature works in uz, ru and en. Screenshots at
1440 px and 390 px wide follow the design rules in docs/SPEC.md.
```

## Design system

White does almost all the work; dark grey carries text and structure; royal purple appears only where the user should act or look. Think Apple Settings and Apple Notes: calm, roomy, hairline borders, no decoration.

### Colour tokens

Contrast is measured against white. Anything below 4.5:1 is never used for text a person must read.

| Token | Hex | Contrast | Use |
| --- | --- | --- | --- |
| `--bg` | #FFFFFF | — | App background, cards, tables, sheets |
| `--bg-subtle` | #F5F5F7 | — | Sidebar, input fill, row hover, table header |
| `--text` | #1D1D1F | 16.8:1 | Main text, dark buttons, toasts |
| `--text-secondary` | #6E6E73 | 5.1:1 | Labels, hints, secondary columns |
| `--text-tertiary` | #86868B | 3.6:1 | Placeholders and disabled text only |
| `--border` | #E5E5EA | — | Hairline dividers, card borders |
| `--border-strong` | #D2D2D7 | — | Secondary button outline, checkbox edge |
| `--purple` | #6236C9 | 7.3:1 | Primary buttons, active nav, links, focus, main chart series |
| `--purple-hover` | #5B2BC4 | 8.1:1 | Primary hover |
| `--purple-pressed` | #4E22A8 | 9.9:1 | Primary pressed |
| `--purple-tint` | #F3EEFC | — | Selected row, active nav background, avatar fill |
| `--success` | #0E7A3E | 5.4:1 | Paid, present, won |
| `--warning` | #A35200 | 5.6:1 | Due soon, late |
| `--danger` | #C62828 | 5.6:1 | Debt, absent, lost, destructive actions |

Status colours get a tint background at 10% opacity with the full colour as text.

### Type

Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", sans-serif`. Load Inter with `next/font` so Windows and Android users get the same feel; it covers Cyrillic and ʻ. Money and counts use `font-variant-numeric: tabular-nums`.

| Style | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| Large title | 28 / 34 | 600 | Page title |
| Title | 22 / 28 | 600 | Sheet title, KPI number |
| Headline | 17 / 22 | 600 | Card and section titles |
| Body | 15 / 20 | 400 | Default text, table cells |
| Footnote | 13 / 18 | 400 | Labels, hints, table header |
| Caption | 12 / 16 | 500 | Pills, badges |

Titles use letter-spacing -0.01em.

### Shape, space, motion

- Spacing on a 4 px grid; most gaps are 8, 12, 16, 24 or 32. Page padding 32 px desktop, 16 px phone.
- Radius: 8 for buttons and inputs, 12 for cards, 16 for sheets and dialogs, full for pills and avatars.
- Shadows: none on cards (hairline border instead). One shadow for floating layers only: `0 8px 30px rgba(0,0,0,0.08)`.
- Motion: 150 ms ease-out for hover and press; 250 ms `cubic-bezier(0.32, 0.72, 0, 1)` for sheets. Respect `prefers-reduced-motion`.
- Icons: lucide, 18 px, stroke 1.5, colour `--text-secondary` unless active.

### Layout

- Left sidebar, 240 px, `--bg-subtle` at 80% with a 20 px backdrop blur. Top: centre name. Middle: Leads, Students, Groups, Teachers, Finance, Reports. Bottom: Settings (owner only) and the user menu with the language switch.
- Active nav item: `--purple-tint` background, `--purple` icon and text.
- Page header: large title on the left, at most one primary button on the right, search and filters in a row below.
- Content max width 1200 px. Below 900 px the sidebar becomes a slide-over opened from a menu button.
- Create, edit and record previews open in a right-side sheet, 480 px wide (full screen on phones). Centered dialogs are only for confirmations.

### Components

- Buttons, 36 px tall (44 px on touch screens): primary = purple fill, white text; secondary = white, `--border-strong` outline, dark text; ghost = text only; destructive = red text, red fill only inside its confirmation dialog.
- Inputs: 36 px, `--bg-subtle` fill, no border; on focus white fill with a 3 px purple ring at 30% opacity. Label above in Footnote, error below in red.
- Segmented control in the Apple style for view switches (Board / List, This month / Last month).
- Tables: no vertical lines, hairline row dividers, 48 px rows, sticky header, money right-aligned, row click opens the record.
- Pills for statuses, avatars as initials on `--purple-tint`, KPI cards with a Footnote label above a Title-size number.
- Toasts: dark pill at the bottom centre, white text, 4 seconds.
- Empty states: one outline icon, one sentence, one button.

### Rules

- Purple never fills large areas or backgrounds. One purple button per screen.
- No gradients, no emoji, no illustrations, no coloured page backgrounds.
- Every screen must still read clearly in greyscale; colour only reinforces meaning that a word or icon already carries.

## Data model

Seventeen tables cover all six blocks. A student's balance is never stored: it is always payments minus charges, read from one view. Every table also has `id uuid`, `created_at` and, where marked, `archived_at`.

```text
ENUMS
user_role          owner | manager
app_language       uz | ru | en
lead_status        new | contacted | trial | won | lost
lead_source        instagram | telegram | phone_call | walk_in | referral | website | other
student_status     active | paused | left
group_status       forming | active | finished
enrollment_status  active | left
lesson_status      scheduled | held | cancelled
attendance_status  present | late | absent | excused
pay_type           fixed_monthly | percent_of_revenue | per_lesson
charge_type        monthly_fee | adjustment
payment_method     cash | card | transfer
expense_category   rent | utilities | marketing | supplies | other
payout_status      draft | paid
message_channel    telegram | sms
message_type       payment_due | payment_overdue | lesson_reminder | custom
message_status     queued | sent | failed | skipped

PEOPLE AND ACCESS
profiles           id = auth.users.id, full_name, role user_role, language app_language,
                   is_active bool
centre_settings    single row: centre_name, billing_day (1), due_day (5),
                   reminders_enabled, lesson_reminder_hours (3),
                   quiet_from (21:00), quiet_to (09:00), telegram_bot_username
message_templates  type, channel, language, body with {placeholders}
                   unique (type, channel, language)

LEADS
leads              full_name, phone (+998…), source, subject_interest, preferred_time,
                   status, lost_reason, trial_group_id → groups, trial_date,
                   next_contact_at, assigned_to → profiles, notes,
                   converted_student_id → students, created_by, archived_at
lead_activities    lead_id, kind (note | call | status_change), body,
                   from_status, to_status, created_by

TEACHERS
teachers           full_name, phone, subjects text[], hired_on, is_active, notes, archived_at
teacher_pay_rates  teacher_id, pay_type, amount bigint (fixed or per lesson),
                   percent numeric(5,2), effective_from date        -- owner only

STUDENTS AND GROUPS
students           full_name, phone, parent_name, parent_phone, birth_date,
                   language app_language, telegram_chat_id bigint,
                   telegram_link_code text unique, status, lead_id → leads,
                   notes, archived_at
groups             name, subject, level, teacher_id → teachers, monthly_fee bigint,
                   days smallint[] (1 = Mon … 7 = Sun), start_time, duration_min (90),
                   room, capacity, start_date, end_date, status, archived_at
enrollments        group_id, student_id, joined_on, left_on, status,
                   discount_kind (percent | amount | null), discount_value, note
                   unique active (group_id, student_id)
lessons            group_id, teacher_id (substitute allowed), lesson_date, start_time,
                   status, cancel_reason      unique (group_id, lesson_date, start_time)
attendance         lesson_id, student_id, status, note, marked_by, marked_at
                   primary key (lesson_id, student_id)

FINANCE
charges            student_id, enrollment_id, group_id, billing_month date, type,
                   base_amount, discount_amount, amount (negative = credit),
                   is_prorated, lessons_counted, lessons_in_month, note, created_by
                   unique (enrollment_id, billing_month) where type = monthly_fee
payments           student_id, group_id, amount > 0, method, paid_at, receipt_no serial,
                   note, received_by, voided_at, void_reason, voided_by
expenses           category, amount, spent_on, note, created_by, archived_at  -- owner only
teacher_payouts    teacher_id, month, pay_type, basis (lessons or soʻm collected),
                   rate, calculated, bonus, deduction, final_amount,
                   breakdown jsonb (per group), status, paid_at, paid_by, note
                   unique (teacher_id, month)                       -- owner only

NOTIFICATIONS
messages           student_id, channel, type, recipient, body, status, error,
                   dedupe_key text unique, sent_at

VIEWS
student_balances   student_id, charged, paid, balance (paid − charged), oldest_unpaid_month
```

All money columns are `bigint` soʻm. Phones are stored as `+998XXXXXXXXX` and shown as `+998 90 123 45 67`.

## Roles and permissions

The owner sees everything; a manager runs the front desk but never sees profit, expenses or teacher pay. Enforce every row below with RLS policies and hide the matching buttons in the UI.

| Area | Owner | Manager |
| --- | --- | --- |
| Leads | Full | Full, except archive |
| Students | Full | Create, edit, enrol, transfer, mark as left |
| Groups and lessons | Full | Create, edit, cancel a lesson, mark attendance |
| Teachers | Full, including pay rates | Contact details and schedule only |
| Payments | Take and void | Take only |
| Charges | Generate a month, add credits | Set the first-month amount at enrolment; add a credit with a required note |
| Debtors list | Yes | Yes |
| Expenses | Full | No access |
| Teacher salaries | Full | No access |
| Reports | All | Leads, attendance and student counts; no money figures |
| Messages | Send, edit templates | Send a one-off message to a student |
| Settings and users | Full | Own name and language only |
| Archive any record | Yes | No |

Every credit and voided payment appears in the owner's Finance → Adjustments list with who did it and why.

## Business rules

Money follows one ledger: charges go out, payments come in, and the balance is the difference. Every rule below becomes a Postgres function or a `src/lib/domain` function with unit tests. All computed amounts round to the nearest 1,000 soʻm, half up.

&#91;embedded content: money flow · charges and payments feed balances, salaries and profit\]

Charges and payments are the only money inputs. Balances, % pay and the profit report are all read from them, so the numbers always agree.

### Monthly billing

- A daily Supabase Cron job at 00:10 Tashkent time calls `generate_monthly_charges(month)` when today is the billing day. The owner can also run it from Finance with a preview first.
- It creates one `monthly_fee` charge per active enrolment in an active group, for a student whose status is not `paused`. Running it twice creates nothing new.
- Amount = group fee minus the enrolment discount (percent or fixed soʻm).
- A changed group fee applies from the next billing month, never to charges already created.

### Joining mid-month

When a student is enrolled after the group's first lesson of the month, the enrol sheet proposes a prorated first charge:

```latex
\text{first charge} = \text{fee after discount} \times \frac{\text{lessons from join date}}{\text{lessons in the month}}
```

Cancelled lessons are not counted. Example: fee 600,000 soʻm, 12 lessons in November, joins on 13 November with 7 left → 350,000 soʻm.

- The sheet offers three choices: Prorated (selected, shows "7 of 12 lessons"), Full month, or Custom amount with a required note.
- Joining before the month's first lesson charges the full month. Joining with no lessons left charges nothing until next month.
- The charge is created the moment enrolment is saved.

### Leaving and transfers

- Marking a student as left from a group sets `left_on`. No refund happens automatically; the manager can add a credit (negative charge, note required).
- A transfer is one sheet that leaves group A and enrols group B on the same date, showing the optional credit for A and the prorated charge for B together.

### Payments and balance

- A payment needs amount, method, date (default now) and group. The group is pre-selected when the student has one active group.
- Balance = non-voided payments minus all charges. Below zero is debt, shown in red with a Debt pill. Above zero is credit and simply covers the next charges.
- A student is a debtor when the balance is below zero after the due day of the current month. Before the due day an unpaid fee shows as Due.
- Each payment gets a receipt number and a print view sized for an 80 mm receipt printer and A4.
- Only the owner can void a payment, with a reason. Voided payments drop out of every total.

### Lessons and attendance

- Lessons are generated from the group's days and start time: when the group is created, and by a daily job that keeps 30 days ahead. Changing the schedule rebuilds future lessons that have no attendance yet.
- Saving attendance marks the lesson `held`. The manager opens the lesson, everyone starts as Present, and taps to switch to Late, Absent or Excused.
- Managers can edit attendance for 7 days; the owner any time. Attendance never changes charges. Attendance rate = (present + late) ÷ (present + late + absent); excused is left out.
- A substitute teacher can be set on a single lesson; per-lesson pay goes to whoever taught it.

### Teacher salaries

The owner runs Calculate for a month, which creates or refreshes a draft payout per active teacher using the rate in effect on the 1st of that month.

| Pay type | Formula |
| --- | --- |
| Fixed monthly | The fixed amount |
| Per lesson | Amount × held lessons the teacher taught that month |
| % of revenue | Percent × non-voided payments received that month for groups where they are the teacher |

The owner can add a bonus or deduction with a note, then Mark paid, which locks the payout. Paid payouts are never recalculated.

### Leads

- Moving a lead to Lost requires a reason: price, schedule, chose another centre, no answer, or other with text.
- A trial lesson stores a group and date; the group page lists that week's trial visitors.
- Won opens Convert: it creates the student from the lead, then opens the enrol sheet. The lead becomes read-only with a link to the student.
- Saving a phone number that already exists on a lead or student shows a warning with a link to the match.
- Leads with a next contact date of today or earlier appear in a Follow up today strip.

## Screens

Six blocks plus Settings, each a list page and a record page. After sign-in the owner lands on Reports and a manager on Groups → Today. Lists show 50 rows per page, search waits 300 ms after typing, and filters live in the URL so a link reopens the same view.

### Sign-in

- White page, one centred card: centre name, email, password, Sign in, Forgot password. Language switch in the top-right corner.

### Leads — `/leads`

- Board view by default with five columns: New, Contacted, Trial, Won, Lost. Won and Lost show the last 30 days. Cards show name, subject, source icon and next contact date. Dragging to Lost asks for the reason.
- List view (segmented control): Name, Phone, Subject, Source, Status, Next contact, Assigned to, Created.
- Follow up today strip above the board.
- New lead sheet: name, phone, source, subject, preferred time, assigned to, next contact, notes.
- Lead sheet: details, timeline of notes, calls and status changes; actions Log call, Add note, Book trial, Convert to student, Mark lost.

### Students — `/students` and `/students/[id]`

- List: Name, Phone, Groups (chips), Balance (red when in debt), Status, Telegram linked icon. Filters: status, group, debt only.
- New student sheet: name, phone, parent name and phone, birth date, message language, notes; then an optional Enrol step.
- Student page header: name, status pill, balance as a large number, Take payment (primary), Enrol, Send message, and a menu with Pause and Mark as left.
- Tabs: Overview (contacts, groups with fee and discount, Telegram link to copy or show as QR), Ledger (date, description, charge, payment, running balance), Attendance (month grid per group with attendance %), Messages (everything sent and its status).

### Groups — `/groups` and `/groups/[id]`

- Today tab: today's lessons by time with group, teacher, room, student count and a Mark attendance button that turns into a green tick once saved.
- All groups tab: name, subject, teacher, days and time, students / capacity, monthly fee, status.
- New group sheet: name, subject, level, teacher, monthly fee, weekdays as toggle chips, start time, duration, room, capacity, start date.
- Group page tabs: Students (balance, attendance %, joined date, Add student opens the enrol sheet with proration), Attendance (students × lesson dates grid; a date opens that lesson), Lessons (cancel, restore, set substitute), Trials (this week's trial visitors).
- Lesson sheet: one row per student with a Present / Late / Absent / Excused segmented control, then Save.

### Teachers — `/teachers` and `/teachers/[id]`

- List: Name, Phone, Subjects, Groups, Lessons this month; Pay type column for the owner only.
- Teacher page: contacts, groups, this month's lessons. Pay tab (owner only): rate history, Set new rate with an effective date, past payouts.

### Finance — `/finance`

- Owner sees a month strip on top: Collected, Billed, Debt, Expenses.
- Payments tab: date, receipt no., student, group, method, amount, received by; filters for month and method; Take payment opens a sheet with student search.
- Debtors tab: student, groups, debt, oldest unpaid month, last payment date, a Remind button per row and Remind all.
- Charges tab: month picker, billed vs collected, Generate charges with a preview list before confirming (owner).
- Expenses tab (owner): list and Add expense sheet.
- Salaries tab (owner): month picker, Calculate, one row per teacher with an expandable breakdown, bonus and deduction fields, Mark paid.
- Adjustments tab (owner): every credit and voided payment with who, when and why.

### Reports — `/reports`

- Period picker: this month, last month, 3, 6 or 12 months, custom range.
- KPI row: collected, expenses + salaries, profit, active students, new leads, lead conversion %, total debt, attendance rate.
- Charts: collected vs expenses by month; revenue by group and by subject; lead funnel by stage with a split by source; active students over time with joins and leaves; attendance rate by group; debt by age (0–30, 31–60, over 60 days).
- Each chart has Export CSV. Managers see only the lead, attendance and student-count parts.

### Settings — `/settings`

- Centre (owner): name, billing day, due day.
- Users (owner): invite by email, role, deactivate.
- Notifications (owner): on/off, lesson reminder hours, quiet hours, Telegram bot status with Connect webhook, Eskiz status with Send test SMS.
- Templates (owner): one editor per message type, channel and language, with placeholder chips and a live preview.
- Profile (everyone): name, interface language, password.

## Notifications

Telegram goes first because it is free; SMS through Eskiz.uz is used only for students with no Telegram linked. Every send, failed or not, is written to `messages` with a `dedupe_key`, so the same reminder is never sent twice.

### What gets sent

| Message | When | Sent if | Channels |
| --- | --- | --- | --- |
| Payment due | 10:00 on the billing day | This month's charge exists and balance is below zero | Telegram, else SMS |
| Payment overdue | 10:00 the day after the due day, then every 7 days, at most 3 times | Balance still below zero | Telegram, else SMS |
| Lesson reminder | N hours before the lesson (default 3) | Active in the group, lesson still scheduled | Telegram only by default |
| Remind (button) | When staff press it on Debtors | At most once per student per day | Telegram, else SMS |
| Custom | When staff send it from a student page | — | Staff choose |

Nothing is sent between 21:00 and 09:00. A lesson reminder that would land in quiet hours is skipped; payment messages wait until 09:00.

### Linking Telegram

- Each student has a random `telegram_link_code` (22 letters and digits). The student page shows `https://t.me/<bot_username>?start=<code>` as a link and a QR code.
- When the parent taps Start, the bot receives `/start <code>`, saves the chat id on that student and replies with a confirmation in the student's language. One parent can link several children with separate links. `/stop` unlinks.
- The webhook route is `/api/telegram/webhook`. Register it with `setWebhook` and a `secret_token`, and reject any request whose `X-Telegram-Bot-Api-Secret-Token` header does not match.

### SMS through Eskiz

- API base `https://notify.eskiz.uz/api`: log in with email and password at `/auth/login` to get a token, cache it, refresh on a 401, send with `/message/sms/send`. Wrap it in an `SmsProvider` interface so another provider can replace it.
- New Eskiz accounts in test status can only send Eskiz's fixed test texts, so get your template texts approved by Eskiz before going live.
- Send to the parent's phone when there is one, otherwise the student's.
- Keep SMS templates in plain Latin with a straight apostrophe (o'quv, not oʻquv). Cyrillic or ʻ switches the message to Unicode, which fits 70 characters per SMS instead of 160 and roughly doubles the cost.

### Scheduled jobs

- Supabase Cron calls `POST /api/jobs/reminders` every 15 minutes with `Authorization: Bearer <CRON_SECRET>`; keep that secret in Supabase Vault. The route finds what is due, fills the templates, sends and logs.
- Supabase Cron also runs two SQL jobs daily at 00:10 Tashkent time: monthly charges (on the billing day) and generating lessons 30 days ahead.
- Cron schedules are written in UTC; Tashkent is UTC+5, so 00:10 local is `10 19 * * *`.

### Templates

Placeholders: `{student}`, `{group}`, `{month}`, `{amount}`, `{due_date}`, `{time}`, `{centre}`. Seed every type in all three languages. Payment due, as an example:

| Language | Text |
| --- | --- |
| uz | Assalomu alaykum! {student} uchun {month} oyi to'lovi: {amount} so'm. Iltimos, {due\_date} gacha to'lang. {centre} |
| ru | Здравствуйте! Оплата за {month} для {student}: {amount} сум. Пожалуйста, оплатите до {due\_date}. {centre} |
| en | Hello! The {month} fee for {student} is {amount} UZS. Please pay by {due\_date}. {centre} |

## Build prompts

Paste one prompt per fresh session, in order, in plan mode. Each names the spec sections to read, what to build, what not to touch, and the checks that prove it works.

### Phase 0 — Project setup

```text
We are starting the education-centre CRM described in docs/SPEC.md. Read the whole file first.

1. Scaffold a Next.js app in this folder (latest stable, App Router, TypeScript strict,
   ESLint, src/ directory, npm). Do not touch docs/.
2. Add: Tailwind CSS v4, shadcn/ui, lucide-react, next-intl, zod, react-hook-form,
   @tanstack/react-table, recharts, @dnd-kit/core, qrcode, sonner, @supabase/supabase-js,
   @supabase/ssr, vitest, @playwright/test, and the supabase CLI as a dev dependency.
3. Create CLAUDE.md with exactly the content of the "CLAUDE.md (project rules file)"
   section of docs/SPEC.md.
4. npm scripts: dev, build, lint, typecheck (tsc --noEmit), test (vitest run),
   e2e (playwright test), db:types (supabase gen types typescript --linked >
   src/lib/supabase/types.ts).
5. Create the folder structure listed in CLAUDE.md with placeholder files only.
6. Create .env.example with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
   SUPABASE_SECRET_KEY, SUPABASE_DB_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET,
   ESKIZ_EMAIL, ESKIZ_PASSWORD, ESKIZ_SENDER, CRON_SECRET, APP_URL. Ignore every other
   .env file in git.
7. git init and make the first commit.

Do not build any screens.
Finish by running build, lint and typecheck and show me the output.
```

Then you do two things by hand: copy `.env.example` to `.env.local` and fill it from your Supabase dev project, and run `npx supabase login` then `npx supabase link`.

### Phase 1 — Design system, app shell, sign-in, languages

```text
Phase 1. Read docs/SPEC.md: "Design system", "Screens → Sign-in", "Roles and permissions".

Build:
- src/styles/tokens.css with every colour, radius, shadow and motion token in the spec,
  exposed through Tailwind v4 @theme (bg-bg-subtle, text-text-secondary, bg-purple …).
- Restyle shadcn/ui Button, Input, Select, Textarea, Checkbox, Switch, Tabs, Sheet, Dialog,
  Table, Badge, Tooltip, DropdownMenu and sonner toasts to the spec. Add SegmentedControl,
  StatusPill, MoneyText, EmptyState, KpiCard and PageHeader.
- src/lib/format.ts: formatMoney(amount, locale) and formatPhone(), with unit tests:
  uz "1 250 000 soʻm", ru "1 250 000 сум", en "UZS 1,250,000", phone "+998 90 123 45 67".
- next-intl: locales uz (default), ru, en under /[locale]; messages/uz.json, ru.json,
  en.json; language switch in the user menu, stored in a cookie for now.
- Supabase Auth with @supabase/ssr: sign-in, sign-out, forgot password, middleware that
  protects everything under (app).
- App shell: frosted sidebar with the six blocks + Settings, active state, user menu,
  slide-over below 900 px. Each block route shows a PageHeader and an EmptyState.
- /dev/components (development only) showing every component in every state.

Do not create database tables.
Check: unit tests pass. Take Playwright screenshots of /dev/components and the shell at
1440 px and 390 px, compare them with the design rules, list differences and fix them.
```

### Phase 2 — Database, permissions, demo data

```text
Phase 2. Read docs/SPEC.md: "Data model", "Roles and permissions", "Business rules".

Build as migrations in supabase/migrations/:
- Every enum, table, constraint, index, foreign key and the student_balances view exactly
  as listed in "Data model". updated_at triggers on edited tables.
- SQL helpers: app_role() returning the caller's user_role, is_owner().
- RLS policies for every table matching "Roles and permissions". A manager must get zero
  rows from teacher_pay_rates, expenses and teacher_payouts.
- A trigger that creates a profiles row for each new auth user (role from invite metadata,
  default manager).
- supabase/seed.sql with realistic Uzbek demo data: 1 owner and 1 manager login, 6 teachers
  covering all three pay types, 10 groups, 80 students, 3 months of lessons, attendance,
  charges and payments (some debtors), 40 leads in every stage, expenses, and message
  templates in uz, ru and en.
- Apply with npx supabase db push, load seed.sql into the dev project with psql using
  SUPABASE_DB_URL, then run npm run db:types. Ask me before running anything against a
  database that is not the dev project.

Do not build UI.
Check: a Vitest suite that signs in as owner and as manager and proves every row of the
permissions table. Show the results.
```

### Phase 3 — Leads

```text
Phase 3: Leads. Read docs/SPEC.md: "Screens → Leads", "Business rules → Leads",
"Design system".

Build /leads as specified: Board and List views, Follow up today strip, New lead sheet,
Lead sheet with timeline and the actions Log call, Add note, Book trial, Mark lost (reason
required). Convert to student stays disabled until Phase 5.
- Server actions validated with zod. Every status change writes a lead_activities row.
- Board drag and drop with @dnd-kit, keyboard accessible.
- Duplicate phone warning across leads and students.
- Every string in uz, ru and en.

Check: Playwright e2e that creates a lead, moves it New → Contacted → Trial → Lost and
confirms each step in the timeline. As manager, Archive must not appear. Screenshots at
1440 and 390 px.
```

### Phase 4 — Teachers

```text
Phase 4: Teachers. Read docs/SPEC.md: "Screens → Teachers", "Roles and permissions",
"Business rules → Teacher salaries".

Build /teachers and /teachers/[id]. The Pay tab (owner only) shows rate history and
Set new rate: pay type, amount or percent, effective from. Fixed and per-lesson need an
amount above 0; percent must be 1–100. Payout history is an empty read-only list until
Phase 8.

Check: as manager the Pay tab and pay column are absent and a direct query to
teacher_pay_rates returns nothing. e2e: create a teacher and set two rates with different
effective dates.
```

### Phase 5 — Students

```text
Phase 5: Students. Read docs/SPEC.md: "Screens → Students", "Business rules → Payments
and balance", "Business rules → Leads".

Build /students (filters, balance from student_balances) and /students/[id] with the
header and the Overview, Ledger (running balance), Attendance and Messages tabs.
- New student sheet; telegram_link_code generated on create; Overview shows the t.me link
  and a QR code.
- Pause and Mark as left.
- Enable Convert to student on leads: create the student, link both ways, mark the lead
  Won. The Enrol step stays disabled with a tooltip until Phase 6.
- Take payment is visible but disabled until Phase 7.

Check: e2e converting a lead into a student. Unit tests for the running balance in
src/lib/domain/ledger.ts.
```

### Phase 6 — Groups, lessons, attendance, enrolment

```text
Phase 6: Groups. Read docs/SPEC.md: "Screens → Groups", "Business rules → Joining
mid-month", "Leaving and transfers", "Lessons and attendance".

Build:
- /groups with Today and All groups tabs, New group sheet, /groups/[id] with Students,
  Attendance grid, Lessons and Trials tabs, and the Lesson sheet.
- SQL generate_lessons(group_id, from, to), called when a group is created and by a
  daily Supabase Cron job keeping 30 days ahead. Schedule changes rebuild future lessons
  that have no attendance.
- Enrol sheet (from group and student pages) with discount and the first-charge choice:
  Prorated / Full month / Custom with note. Proration lives in
  src/lib/domain/proration.ts (pure) and is mirrored in SQL propose_first_charge().
- Leave group and Transfer sheet; substitute teacher per lesson; cancel and restore a
  lesson with reason; attendance edit window of 7 days for managers.

Proration unit tests must cover: 600,000 soʻm with 12 lessons joining with 7 left =
350,000; joining before the first lesson; joining after the last; cancelled lessons;
a 15% discount; rounding to 1,000.
Check: e2e that creates a Mon/Wed/Fri 18:00 group, enrols a student mid-month with the
prorated charge, marks today's attendance, and confirms the lesson is held and the charge
is on the student's ledger.
```

### Phase 7 — Finance: billing, payments, debtors

```text
Phase 7: Finance billing. Read docs/SPEC.md: "Business rules → Monthly billing",
"Payments and balance", "Screens → Finance".

Build:
- SQL generate_monthly_charges(month), idempotent, plus a daily Supabase Cron job that
  runs it on the billing day. Charges tab: month picker, billed vs collected, Generate
  charges with a preview list before confirming (owner).
- Take payment sheet (from Finance, the student page and a debtor row): student search,
  group pre-selected when there is only one, amount, method, date, note, receipt number,
  print view for 80 mm and A4.
- Payments tab with filters. Debtors tab with debt, oldest unpaid month, last payment.
  Remind buttons are visible but disabled until Phase 10.
- Void payment (owner, reason required). Add credit (owner and manager, note required).
- Owner month strip: Collected, Billed, Debt, Expenses (0 until Phase 8).

Check: tests proving generate_monthly_charges creates no duplicates when run twice, skips
paused students and finished groups, applies discounts, and applies a fee change only
from the next month. e2e: generate a month, take a payment, confirm balance and debtors
update. Then run /code-review and fix every finding that affects money.
```

### Phase 8 — Finance: expenses, salaries, adjustments

```text
Phase 8: Finance owner tools. Read docs/SPEC.md: "Business rules → Teacher salaries",
"Screens → Finance", "Roles and permissions".

Build, all owner only:
- Expenses tab with Add expense sheet and category filter.
- SQL calculate_teacher_payouts(month): creates or refreshes draft payouts with a
  per-group breakdown in jsonb, using the rate in effect on the 1st of the month.
  Pure mirror in src/lib/domain/salary.ts.
- Salaries tab: month picker, Calculate, expandable breakdown, bonus and deduction with
  note, Mark paid (locks the row). The teacher Pay tab now lists payouts.
- Adjustments tab listing every credit and voided payment.

Unit tests: one teacher of each pay type; a substitute lesson pays the substitute; voided
payments are excluded from % pay; a rate change on the 15th applies next month; a paid
payout is never recalculated.
Check: as manager nothing from this phase is visible and its tables return no rows.
Run /code-review.
```

### Phase 9 — Reports

```text
Phase 9: Reports. Read docs/SPEC.md: "Screens → Reports", "Design system".

Build /reports with the period picker, KPI row and six charts in Recharts using our
tokens: purple for the main series, dark grey for the comparison, greys for the rest,
2 px lines, no gradients, tabular numbers. One SQL function per chart so every number
matches Finance. Export CSV per chart. Managers see only the lead, attendance and
student-count parts.

Check: a test that report totals equal Finance totals for the same month on seed data.
Screenshots at 1440 and 390 px.
```

### Phase 10 — Telegram and SMS reminders

```text
Phase 10: Notifications. Read docs/SPEC.md: "Notifications".

Build:
- src/lib/notify/: TelegramProvider, an SmsProvider interface and EskizProvider (token
  cache, refresh on 401), template rendering in the recipient's language.
- /api/telegram/webhook with the secret-token check, handling /start <code> and /stop.
- /api/jobs/reminders protected by CRON_SECRET and called by Supabase Cron every
  15 minutes: payment due, payment overdue (at most 3), lesson reminders, quiet hours,
  Telegram first with SMS fallback, a dedupe_key on every message.
- Enable Remind and Remind all on Debtors and Send message on the student page.
  The student Messages tab shows the log.

Unit tests: channel choice, quiet hours, overdue schedule (day after due, +7, +14, then
stop), dedupe. Tests use a FakeProvider and never send real messages.
Then give me a script that sends one real test message to my Telegram and phone, and wait
for me to run it.
```

### Phase 11 — Settings and users

```text
Phase 11: Settings. Read docs/SPEC.md: "Screens → Settings", "Roles and permissions".

Build /settings: Centre; Users (invite by email from a server action with the Supabase
admin API, change role, deactivate — a deactivated user is signed out and blocked by
RLS); Notifications (toggles, hours, Connect webhook that calls setWebhook, Eskiz test
SMS); Templates (placeholder chips, live preview, character count and SMS part count);
Profile (name, language now saved to profiles.language, password).

Check: e2e where the owner invites a manager, the manager signs in and sees only manager
screens, and deactivating the manager blocks their next request.
```

### Phase 12 — Review, polish, deploy

```text
Phase 12: Hardening and deploy.

1. Use a subagent to review the whole app against docs/SPEC.md: every screen, rule and
   permission. Report only gaps that break the spec or correctness, then fix them.
2. Run @axe-core/playwright on every page and fix serious issues. Check keyboard use of
   sheets, the leads board and the attendance sheet.
3. Check every page in uz, ru and en for missing keys and overflowing text.
4. Add loading skeletons and error states to every list and record page.
5. Write docs/DEPLOY.md: create the production Supabase project, push migrations, set
   Vercel environment variables, connect the domain, register the Telegram webhook,
   schedule the Supabase Cron jobs, create the owner account. Do not deploy yourself;
   walk me through it step by step.

Check: build, lint, typecheck, unit and e2e tests all pass. Show the output.
```

## Iteration prompts

Use these after `/clear` when something needs fixing or changing. Fill the angle brackets.

**Fix a bug**

```text
Bug: I <did what> on <page URL>, signed in as <owner|manager>, language <uz|ru|en>.
It <did what>. It should <do what>.
Write a failing test that reproduces it, fix the root cause, then run typecheck, lint
and tests. Do not change unrelated code.
```

**Polish a screen**

```text
[paste a screenshot] This screen breaks "Design system" in docs/SPEC.md: <what looks
wrong>. Fix it using only tokens from src/styles/tokens.css. Take screenshots at
1440 and 390 px and list what changed.
```

**Add a field**

```text
Add <field> (<type>, <required|optional>) to <table>. First update "Data model" in
docs/SPEC.md, then add a new migration, RLS if needed, run db:types, and update the
forms, list columns and uz/ru/en translations where it appears. Show me the migration
before applying it.
```

**Change a business rule**

```text
Change the rule "<quote it from docs/SPEC.md>" to "<new rule>". Update docs/SPEC.md
first, then the SQL function and its src/lib/domain mirror, then the unit tests with a
case for the new behaviour. Tell me which existing records it affects. Never rewrite
past charges or paid payouts.
```

**Fix a translation**

```text
On <page> the <uz|ru|en> text "<current text>" is <wrong|missing|too long>. Fix it in
messages/<lang>.json only and keep the keys identical across all three files.
```

## Sources

- [Claude Code best practices](https://code.claude.com/docs/en/best-practices.md) — plan mode, `/clear`, CLAUDE.md, verification, `/code-review`
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby) — non-commercial use, Pro at $20 per user a month
- [Vercel cron jobs usage and pricing](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing) — Hobby crons run at most once a day
- [Supabase pricing](https://supabase.com/pricing) — Pro from $25 a month, free projects pause after a week of inactivity
- [Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) — paid projects are never paused
- [Supabase Cron](https://supabase.com/docs/guides/cron) — scheduled SQL, functions and HTTP requests
- [Telegram deep linking](https://core.telegram.org/bots/features#deep-linking) — `?start=` parameter, up to 64 characters
- [Telegram setWebhook](https://core.telegram.org/bots/api#setwebhook) — `secret_token` and its header
- [Eskiz API client (iota-uz/eskiz)](https://github.com/iota-uz/eskiz) — endpoints at notify.eskiz.uz and test-status text limits
