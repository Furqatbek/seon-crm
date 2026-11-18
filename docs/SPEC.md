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
| Who logs in | Owner/Admin and Manager/reception run the centre. A teacher can be given a login that shows only their own groups. Students and parents have no login. |
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

CRM for one education centre in Uzbekistan. Owner and Manager run it. A teacher
may get a login that shows only their own groups (attendance and coins).
Students and parents never log in. Full spec: docs/SPEC.md — read the
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
- src/app/[locale]/(app)/{leads,students,groups,teachers,finance,reports,settings,my-groups}
- src/components/ui = shared primitives; src/components/<block> = block parts
- src/lib/domain = pure business logic + tests; src/lib/supabase = clients + types
- supabase/migrations, supabase/seed.sql

## Done means
Typecheck, lint and tests pass. The feature works in uz, ru and en. Screenshots at
1440 px and 390 px wide follow the design rules in docs/SPEC.md.
```

## Design system

White does almost all the work; dark grey carries text and structure; royal purple appears only where the user should act or look. Think Apple Settings and Apple Notes: calm, roomy, hairline borders, no decoration.

> **Brand colour (changed on the owner's instruction).** The accent is the orange of the SEON TOPIK mark, not purple. Wherever this document says "purple", read "brand orange". The tokens are `--brand` #F7941D (fills: primary buttons, the active tick, the main chart series; hover #EE8A10, pressed #DC7C08), `--on-brand` #1D1D1F (the text on a brand fill: dark, in both themes, because white on this orange does not reach 4.5:1), `--brand-ink` #A34A05 (orange text, icons and links on a light surface; hover #863C03), and `--brand-tint` #FFF0DC (selected row, active nav background, avatar fill). In the dark theme: brand #F9A33B, ink #FFB866, tint #3A2710. Status tints are stronger than before (success #086B33 on a 14% tint, danger #C81E1E on 12%, warning #8A5A00 on an amber tint), each at 4.5:1 or better. The mark itself sits in the middle of the left panel, behind the menu (`public/brand/seon-topik.png`).

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

### Dark theme

The app follows the device's light or dark setting. The account menu (and the sign-in page) has a Theme switch: Same as device, Light, Dark. A choice is kept in the browser and applied before the first paint. Printed pages, receipts included, are always light.

Dark values, with contrast measured against the dark `--bg`:

| Token | Hex | Contrast |
| --- | --- | --- |
| `--bg` | #131316 | — |
| `--bg-subtle` | #1E1E22 | — |
| `--text` | #F5F5F7 | 17.0:1 |
| `--text-secondary` | #A1A1A6 | 7.2:1 |
| `--text-tertiary` | #7C7C82 | 4.5:1 |
| `--border` | #2B2B30 | — |
| `--border-strong` | #3E3E45 | — |
| `--purple` | #A78BFA | 6.8:1 |
| `--purple-hover` | #B8A1FB | 8.4:1 |
| `--purple-pressed` | #9373F5 | 5.3:1 |
| `--purple-tint` | #2A2244 | — |
| `--success` | #4CC38A | 8.4:1 |
| `--warning` | #F0A04B | 8.7:1 |
| `--danger` | #FF6B6B | 6.7:1 |

In the dark a filled button is the light purple with dark text, and a toast is a light pill with dark text. Every rule below holds in both themes.

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

- Left sidebar, 240 px, `--bg-subtle` at 80% with a 20 px backdrop blur. Top: centre name. Middle: Leads, Students, Groups, Teachers, Finance, Reports. Bottom: Settings (owner only) and the user menu with the language and theme switches.
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

Nineteen tables cover all six blocks. A student's balance is never stored: it is always payments minus charges, read from one view. Every table also has `id uuid`, `created_at` and, where marked, `archived_at`.

```text
ENUMS
user_role          owner | manager
app_language       uz | ru | en
lead_status        new | contacted | trial | won | lost
lead_source        instagram | telegram | phone_call | walk_in | referral | website | other
student_status     active | paused | left | graduated
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
profiles           id = auth.users.id, full_name, role user_role (owner | manager |
                   teacher), teacher_id → teachers (set exactly when the role is
                   teacher; one login per teacher), language app_language, is_active bool
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

ROOMS
rooms              number, name, capacity smallint (> 0), is_active, archived_at
                   -- everyone signed in reads; only the owner writes

STUDENTS AND GROUPS
students           full_name, phone, parent_name, parent_phone, birth_date,
                   language app_language, telegram_chat_id bigint,
                   telegram_link_code text unique, status, lead_id → leads,
                   notes, archived_at
groups             name, subject, level, teacher_id → teachers, monthly_fee bigint,
                   days smallint[] (1 = Mon … 7 = Sun), start_time, duration_min (90),
                   room_id → rooms, capacity (≤ the room's capacity), start_date,
                   end_date, status, archived_at
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
                   is_prorated, lessons_counted, lessons_in_month, note, created_by,
                   archived_at
                   unique (enrollment_id, billing_month) where type = monthly_fee
                   and not archived
payments           student_id, group_id, amount > 0, method, paid_at, receipt_no serial,
                   note, received_by, voided_at, void_reason, voided_by, archived_at
expenses           category, amount, spent_on, note, created_by, archived_at  -- owner only
teacher_payouts    teacher_id, month, pay_type, basis (lessons or soʻm collected),
                   rate, calculated, bonus, deduction, final_amount,
                   breakdown jsonb (per group), status, paid_at, paid_by, note,
                   archived_at
                   unique (teacher_id, month) where not archived    -- owner only

NOTIFICATIONS
messages           student_id, channel, type, recipient, body, status, error,
                   dedupe_key text unique, sent_at

COINS
coin_transactions  student_id, group_id (where they were earned; null when spent),
                   amount (> 0 earned, < 0 spent), reason, created_by
                   -- a ledger: rows are never edited or removed

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
| Rooms | Full: create, edit, archive | Read only: choose a room for a group |
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

### Teacher login

A teacher is not staff. A user with the role Teacher is linked to one teacher record and gets nothing from the table above: no table is readable to them except their own profile. They work through database functions that check the group is their own:

| A teacher can | A teacher cannot |
| --- | --- |
| See the groups they teach (active or forming): name, days, time, room | See any other group, or a group's fee |
| See the names of the students in those groups | See phones, parents, balances, payments, notes or a student's other groups |
| Mark attendance for a lesson of their own group, today and up to 7 days back | Mark a future, cancelled or older lesson; cancel a lesson; set a substitute |
| Give 1 to 10 coins at a time to a student of their own group | Spend or take away coins |
| Change their own name, language and password | Open Leads, Students, Groups, Teachers, Finance, Reports or the owner's Settings |

The owner creates a teacher login in Settings → Users, by inviting with the role Teacher or by changing an existing user's role to Teacher, and picks which teacher it is. Deactivating works as for any user.

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
- Mark as graduated (owner and manager, by hand) sets the student's status to Graduated and ends every active enrolment today, exactly like leaving; nothing is refunded or written off. Enrolling a student who left or graduated makes them active again.
- A transfer is one sheet that leaves group A and enrols group B on the same date, showing the optional credit for A and the prorated charge for B together.

### Payments and balance

- A payment needs amount, method, date (default now) and group. The group is pre-selected when the student has one active group.
- Balance = non-voided payments minus all charges. Below zero is debt, shown in red with a Debt pill. Above zero is credit and simply covers the next charges.
- A student is a debtor when the balance is below zero after the due day of the current month. Before the due day an unpaid fee shows as Due.
- A student whose status is Left is not chased: their debt is left out of the Debtors list, the debt totals in Finance and Reports, the debt-age report and the reminders. The balance is unchanged and still shows on the student's own page. A graduate who owes stays a debtor.
- Each payment gets a receipt number and a print view sized for an 80 mm receipt printer and A4.
- Only the owner can void a payment, with a reason. Voided payments drop out of every total.
- Archiving (owner only) is how a wrong or test record is removed; nothing is deleted. An archived payment is also voided. An archived charge is no longer owed, and its monthly fee can be generated again. An archived payout leaves the salaries total, even a paid one, and Calculate makes a new draft. Archived records leave every list, balance, total and report, including Adjustments.

### Lessons and attendance

- Lessons are generated from the group's days and start time: when the group is created, and by a daily job that keeps 30 days ahead. Changing the schedule rebuilds future lessons that have no attendance yet.
- Saving attendance marks the lesson `held`. The manager opens the lesson, everyone starts as Present, and taps to switch to Late, Absent or Excused.
- Attendance is marked on the day of the lesson, by a teacher, a manager or the owner; nobody marks or changes it for a past or a future day. A student with two enrolments that cover the day (taken out and put back) is listed once. Attendance never changes charges. Attendance rate = (present + late) ÷ (present + late + absent); excused is left out.
- A substitute teacher can be set on a single lesson; per-lesson pay goes to whoever taught it.
- A teacher with a login marks attendance for their own groups, for 7 days like a manager.

### Coins

- Coins are points a student earns in class. They are a ledger like money: every change is a row with who, where and why, and rows are never edited.
- A teacher gives 1 to 10 coins at a time to a student of their own group, with an optional reason. Owner and manager give up to 1,000 at a time.
- Owner and manager spend a student's coins (a prize) or take coins away (a correction): a reason is required and the balance never goes below zero.
- A student's balance = everything earned in any group minus everything spent.
- The ranking in a group is by coins earned in that group; equal counts share a place, and spending does not move anyone down. A student with no coins has no place.
- Coins have nothing to do with fees, balances or teacher pay.

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
- Every phone field shows the country code +998 fixed in front; the person types the nine digits after it. A pasted full number loses its own +998.
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
- Students list subtitle under the title: how many students are studying now (status Active), have left and have graduated.
- New student sheet: name, phone, parent name and phone, birth date, message language, notes; then an optional Enrol step.
- Student page header: name, status pill, balance as a large number, Take payment (primary), Enrol, Send message, and a menu with Pause, Mark as graduated and Mark as left.
- Tabs: Overview (contacts, groups with fee and discount, Telegram link to copy or show as QR), Ledger (date, description, charge, payment, running balance), Attendance (month grid per group with attendance %), Messages (everything sent and its status).

### Groups — `/groups` and `/groups/[id]`

- Today tab: today's lessons by time with group, teacher, room, student count and a Mark attendance button that turns into a green tick once saved. A room is shown as "number · name" here, on the group page and on the lesson sheet.
- All groups tab: name, subject, teacher, days and time, students / capacity, monthly fee, status.
- New group sheet: name, subject, level, teacher, monthly fee, weekdays as toggle chips, start time, duration, room, capacity, start date. Room is a dropdown of the active rooms, each with its capacity. Capacity defaults to the room's capacity and cannot exceed it.
- A room holds one group at a time. A group cannot be saved when another group that is active or forming uses the same room on a shared weekday at an overlapping time; the error names the clashing group. Back-to-back lessons (one ends as the next starts) are allowed.
- Group page tabs: Students (balance, attendance %, coins with the place in the group, joined date; the row menu has Coins to give or spend them; Add student opens the enrol sheet with proration), Attendance (students × lesson dates grid; a date opens that lesson), Lessons (cancel, restore, set substitute), Trials (this week's trial visitors).
- Lesson sheet: one row per student with a Present / Late / Absent / Excused segmented control, then Save.

### Teachers — `/teachers` and `/teachers/[id]`

- List: Name, Phone, Subjects, Groups, Lessons this month; Pay type column for the owner only.
- Teacher page: contacts, groups, this month's lessons. Pay tab (owner only): rate history, Set new rate with an effective date, past payouts.

### My groups — `/my-groups` and `/my-groups/[id]` (teacher)

- The teacher's whole app: the sidebar has My groups only, plus the account menu with Profile. Any other address takes them back here.
- List: one card per group with days, time, room and number of students.
- Group: Lessons from 7 days back to 14 ahead with a Mark attendance button on those that can be marked (a sheet with Present / Late / Absent / Excused per student); Students and coins, ranked by coins earned in the group, with a Give coins button per student (1, 2, 3, 5 or 10, and an optional reason).

### Finance — `/finance`

- Owner sees a month strip on top, in two rows. First row, always adding up: Billed for the month = Paid of it + Still unpaid of it. A student's payments settle their charges oldest month first, so "unpaid" is the part of that month's fees their payments, up to today, have not reached; credits lower what was billed; archived charges and voided payments count nowhere; students who left are included. Second row, separate figures: Money received in the month (everything taken during it, whatever it paid for), Debt today (all months, without students who left) and Expenses.
- Payments tab: date, receipt no., student, group, method, amount, received by; filters for month and method; Take payment opens a sheet with student search.
- Debtors tab: student, groups, debt, oldest unpaid month, last payment date, a Remind button per row and Remind all.
- Charges tab: month picker, billed vs collected, Generate charges with a preview list before confirming (owner).
- Expenses tab (owner): list and Add expense sheet. The owner corrects a wrong expense with Edit on its row (same sheet).
- Salaries tab (owner): month picker, Calculate, one row per teacher with an expandable breakdown, bonus and deduction fields, Mark paid.
- Adjustments tab (owner): every credit and voided payment with who, when and why.
- Owner: an Archive button on every row of Payments, Charges, Expenses and Salaries, with a confirmation that says what changes; Charges also has Archive all charges for the chosen month.

### Reports — `/reports`

- Period picker: this month, last month, 3, 6 or 12 months, custom range.
- KPI row: collected, expenses + salaries, profit, active students, new leads, lead conversion %, total debt, attendance rate.
- Charts: collected vs expenses by month; revenue by group and by subject; lead funnel by stage with a split by source; active students over time with joins and leaves; attendance rate by group; debt by age (0–30, 31–60, over 60 days).
- Each chart has Export CSV. Managers see only the lead, attendance and student-count parts.

### Settings — `/settings`

- Centre (owner): name, billing day, due day.
- Rooms (owner): list with number, name, capacity and the groups using each room; Add room and Edit room sheets; a room can be archived only when no active or forming group uses it.
- Users (owner): invite by email, role (Owner, Manager or Teacher; a teacher login also names its teacher), change a role, deactivate.
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

## Points and rewards add-on

Students earn points automatically and from teachers, compete on monthly leaderboards, and spend points on rewards such as a branded T-shirt. Build it after Phase 12 as Phases 13–18. It also gives teachers their own login and moves attendance to them.

### Decisions locked in

| Decision | Answer |
| --- | --- |
| How teachers award points | Their own web login, limited to their own groups |
| Attendance | Teachers mark it for their own lessons; managers and the owner can still correct it |
| Automatic points | Attending a lesson, a full month with no absences, fee paid on time, a friend who enrols |
| Teacher points | Teachers can award points and take them away; taking away needs a reason |
| Where students see points | Telegram bot commands, a weekly Telegram summary, a TV screen in the centre |
| Who gets messages | Student and parent, each through their own Telegram link |
| Leaderboard | Monthly race that restarts on the 1st, plus all-time; ranked inside each group and across the centre |

### Defaults to confirm

| Area | Default | Change it if |
| --- | --- | --- |
| Point values | Present 2, late 1, perfect month 10, fee on time 10, friend enrols 50. The owner can change every value in Settings. | Rewards come too fast or too slow |
| Rank vs spending | The leaderboard ranks points earned. Redeeming a reward lowers the spendable balance, not the rank. | Spending should drop a student's rank |
| Teacher limits | 1–5 points per award or deduction; at most 10 points per student per day from one teacher | Teachers need more room |
| Balance floor | A deduction never takes the balance below 0 | Negative balances are fine |
| Expiry | Points never expire | You want a yearly reset of balances |
| Redeeming | Student asks in the bot or at reception; points are held at once; a manager hands over the reward and marks it given, or rejects it and the points return | Only reception should redeem |
| Group ranking | Counts only points earned in that group (attendance and teacher points there). The centre ranking counts everything. |  |
| Names on the TV | First name and last initial; a parent can ask to hide their child | Full names are fine |
| Referral | Points arrive when the friend's first payment is recorded, not when the lead is created |  |
| Teacher privacy | Teachers see student names, attendance and points, not phones, balances or fees | Teachers need parent phones |
| Points messages | Telegram only, never SMS; weekly summary on Sunday at 18:00 |  |

At these values a student with perfect attendance in a 12-lesson month who pays on time earns 44 points, plus whatever teachers award. A 100-point T-shirt then takes about two months of good work.

### Point rules

All points live in one append-only ledger, like money. Rows are never edited or deleted; a correction is a new row. Earned points (for ranking) = every row except reward rows. Spendable balance = every row.

| Source | Default points | When it is posted | Counts for group |
| --- | --- | --- | --- |
| Present at a lesson | +2 | When attendance is saved | That group |
| Late to a lesson | +1 | When attendance is saved | That group |
| Perfect month | +10 | On the 1st, for last month, per group with at least 4 held lessons and no Absent (Late and Excused allowed) | That group |
| Fee paid on time | +10 | The day after the due day, if that month's charges were covered by the end of the due day | None |
| Friend enrols | +50 | When the referred student's first payment is recorded | None |
| Teacher award | +1 to +5 | Teacher picks a preset or types a reason | That group |
| Teacher deduction | −1 to −5 | Teacher picks a preset or types a reason (required) | That group |
| Owner adjustment | Any | Owner, with a reason | Optional |
| Reward requested | − reward cost | Bot or reception request | None, not earned |
| Reward rejected or cancelled | + cost back | Manager rejects or cancels | None, not earned |

- Every automatic row has a unique `dedupe_key` (for example `attendance:<lesson>:<student>`), so jobs can run twice safely.
- Editing attendance posts only the difference: Present → Absent posts −2. Cancelling a lesson reverses its attendance points.
- Teacher points go through one database function, `award_points()`, which checks: the caller teaches that group today (or is the lesson's substitute), the student is actively enrolled, the amount is 1–5, today's total from that teacher to that student stays at or under 10, and a deduction never takes the balance below 0 (it is reduced to the balance, and the teacher is told).
- Seeded presets, editable by the owner: Active in class +2, Homework done +2, Great test result +5, Helped a classmate +3; Homework not done −2, Disrupted the lesson −3, Phone in class −2.
- Changing a point value applies from that moment on, never to rows already posted.
- Turning the programme off in Settings stops new points; existing points and rewards stay.

### Leaderboard rules

- Monthly boards use rows posted in that calendar month, Tashkent time. All-time boards use every row.
- Group board: only that group's rows, only students actively enrolled in it. Centre board: all earned points, all active students.
- Ties share a rank (1, 2, 2, 4) and are then listed by name.
- A student marked as hidden is left out of the TV and the bot's top lists, but staff still see their rank.

### Teacher role

A teacher sees only the groups they teach, works mostly from a phone during class, and never sees money or contact details. The owner gives a teacher a login from the teacher's page; the invite links the new profile to that teacher record.

| Area | Owner | Manager | Teacher |
| --- | --- | --- | --- |
| Groups and lessons | All | All | Groups they teach, plus single lessons where they are the substitute |
| Students | Everything | Everything | Name, attendance, points and rank in their groups only |
| Attendance | Edit any time | Edit for 7 days | Mark own lessons; edit until 23:59 the next day |
| Award or deduct points | Owner adjustment, any amount, reason required | No | 1–5 per action within the daily limit, own groups only |
| Leaderboards | All | All | Their groups and the centre board |
| Rewards | Catalogue and settings | Handle requests, hand over rewards | View catalogue |
| Points settings | Yes | No | No |
| Points reports | All | All | Their own groups |
| Leads, Finance, Teachers, Settings | As before | As before | No access, except their own Profile |

Teachers land on `/teach` after sign-in. They see how many lessons they taught this month but never pay rates or payouts. All of this is enforced with RLS: a teacher querying `payments`, `charges`, `leads` or another group's students gets zero rows.

### Data model additions

Six new tables and a few changed columns. The existing single Telegram link per student becomes the parent link, and each student gets a second link of their own.

```text
CHANGED
user_role          owner | manager | teacher
profiles           + teacher_id → teachers (set only when role = teacher)
students           − telegram_chat_id, telegram_link_code (moved, see telegram_links)
                   + student_link_code, parent_link_code (22 chars, unique)
                   + leaderboard_hidden bool default false
leads              + referred_by_student_id → students
message_type       + points_weekly | points_deduction | points_month_result | reward_update

NEW ENUMS
points_source      attendance | perfect_month | on_time_payment | referral | teacher_award
                   | teacher_deduction | owner_adjustment | reward_hold | reward_return
link_role          student | parent
preset_kind        award | deduction
redemption_status  requested | given | rejected | cancelled

NEW TABLES
telegram_links     student_id, role link_role, chat_id bigint, language, linked_at
                   unique (student_id, role)
points_settings    single row: enabled, present (2), late (1), perfect_month (10),
                   perfect_month_min_lessons (4), on_time (10), referral (50),
                   max_per_action (5), teacher_daily_cap (10),
                   weekly_day (7 = Sunday), weekly_time (18:00), tv_token, tv_language (uz)
point_presets      kind, points, label_uz, label_ru, label_en, sort, is_active
points_ledger      student_id, delta int <> 0, source, group_id, lesson_id, preset_id,
                   redemption_id, reason, created_by, created_at,
                   dedupe_key text unique                  -- insert only
rewards            name, description, photo_path, cost int > 0,
                   stock int (null = unlimited), is_active, archived_at
redemptions        student_id, reward_id, cost, status, via (bot | desk),
                   requested_by (student | parent | staff), handled_by, handled_at, note

VIEWS AND FUNCTIONS
student_points     student_id, balance, earned_this_month, earned_all_time
leaderboard(scope group | centre, group_id, period month | all, month)
                   → student_id, display_name, points, rank
award_points(student_id, group_id, points, preset_id, reason, lesson_id)
request_reward(student_id, reward_id, via) · handle_redemption(id, action, note)
```

The migration moves each existing `telegram_chat_id` into a parent row of `telegram_links` and keeps the old code as `parent_link_code`, so linked parents do not need to relink. One parent link per student; a second parent is out of scope.

### Screens

Teachers get a phone-first workspace; staff get a new Points item in the sidebar, after Groups; the centre gets a TV page.

**Teacher workspace — `/teach`** (designed at 390 px first)

- Bottom tab bar on phones, sidebar on desktop: Today, My groups, History, Profile.
- Today: one card per lesson with time, group, room and student count.
- Lesson screen: one row per student with name, this month's points in the group, a Present / Late / Absent / Excused control (all Present to start), and + and − buttons. Save attendance is a sticky button at the bottom.
- - opens a bottom sheet of award presets plus Custom (1–5 with a reason). − opens deduction presets plus Custom (reason required). Points post at once with a toast and a 10-second Undo, which posts a reversing row.
- My groups: each group's leaderboard, this month and all-time. History: every point this teacher gave this month.

**Staff: student page**

- New Points tab: balance, earned this month, rank in each group and in the centre, and the ledger (date, source, reason, by whom, ± points).
- Buttons: Redeem reward (opens the catalogue, posts a desk request) and Adjust points (owner only, reason required).
- Overview now shows two Telegram links, Student and Parent, each with its QR code and linked or not linked.
- A Hide from public leaderboards switch.

**Staff: Points — `/points`**

- Leaderboard tab: Centre or a chosen group, This month or All-time, month picker for past months.
- Rewards tab: cards with photo, name, cost and stock. The owner adds, edits and archives rewards.
- Requests tab: date, student, reward, cost, from bot or desk, status. Give marks it handed over; Reject needs a reason and returns the points and the stock. The sidebar shows a count of open requests.
- Group page gets its own Leaderboard tab as well.

**TV screen — `/tv/<token>`**

- No login; the secret token comes from Settings, and regenerating it kills old links.
- Full screen at 1920 × 1080, white background, names at 32 px or larger. Shows the centre's top 10 this month, then rotates through each active group's top 5 every 15 seconds.
- First name and last initial, hidden students left out, data refreshed every 60 seconds, "Updated hh:mm" and the centre name in the footer. Purple marks only first place.
- The owner picks the TV language in Settings (default uz).

**Settings → Points** (owner)

- Programme on or off, every point value, per-action limit, teacher daily cap, presets editor in three languages, weekly summary day and time, TV link with Copy and Regenerate.

**Reports → Points tab**

- Uses the same period picker as other reports. KPIs: points earned, points deducted, points spent on rewards, unspent points across all students, rewards given, active students with no points this month.
- Charts: points earned by source per month; awards and deductions per teacher, to spot inflation; top 10 students; rewards given by reward; average points per student by group.
- Export CSV per chart. Owner and manager see everything; a teacher sees the same tab filtered to their groups from `/teach`.

### Telegram for students and parents

The bot becomes the students' window into the programme: each student and each parent links their own chat, checks points with commands, and gets progress messages. Points messages are never sent by SMS.

**Linking**

- The student page shows two links: `https://t.me/<bot>?start=s_<student_link_code>` and `?start=p_<parent_link_code>`, each with a QR code.
- Start saves a `telegram_links` row with that role and replies in the student's language. `/stop` removes only that chat's link.
- A parent linked to several children is asked "Which child?" with buttons before any command answers.

**Who gets what**

| Message | Student chat | Parent chat | SMS if no Telegram |
| --- | --- | --- | --- |
| Payment due and overdue | No | Yes | Yes, to the parent phone |
| Lesson reminder | Yes | Only if the student has no link | No |
| Weekly points summary | Yes | Yes | No |
| Points taken away | Yes | Yes | No |
| Month results | Yes | Yes | No |
| Reward request updates | Yes | Yes | No |

Awards are not messaged one by one; they appear in the weekly summary, so families are not spammed.

**Bot commands** (registered with `setMyCommands` in uz, ru and en)

- `/points` — balance, earned this month, this month's rank in each group and in the centre, last 5 entries, and the nearest reward ("8 more points for the T-shirt").
- `/top` — the centre's top 10 this month, the student's group top 5, and the student's own rank. Hidden students are left out.
- `/rewards` — the catalogue with cost and stock. Rewards the student can afford have a Request button with a confirm step; the request holds the points and one unit of stock and appears in staff Requests.
- `/language` — switch this chat's language. `/stop` — unlink.

**Scheduled points messages**

- Weekly summary, Sunday 18:00 by default: points this week and the top reason, balance, this month's ranks, next reward goal. Sent only for active students.
- Points taken away: sent as soon as it happens (held until 09:00 during quiet hours), with the group and the reason.
- Month results, on the 1st at 10:00: last month's points, final rank in each group and the centre, and the perfect-month bonus if earned.
- Reward updates: request received, reward handed over, request rejected with the reason.
- Each message has a `dedupe_key` such as `weekly:<student>:<role>:<week>` and goes through the existing quiet hours and message log.

New template placeholders: `{week_points}`, `{balance}`, `{group_rank}`, `{centre_rank}`, `{reason}`, `{reward}`, `{points_needed}`. Weekly summary, as an example:

| Language | Text |
| --- | --- |
| uz | {student} bu hafta {week\_points} ball to'pladi. Jami: {balance} ball. Oy reytingi: {group} guruhida {group\_rank}-o'rin, markazda {centre\_rank}-o'rin. {reward} uchun yana {points\_needed} ball kerak. |
| ru | {student} заработал(а) {week\_points} баллов за неделю. Всего: {balance}. Рейтинг за месяц: {group\_rank}-е место в группе {group}, {centre\_rank}-е в центре. До «{reward}» осталось {points\_needed}. |
| en | {student} earned {week\_points} points this week. Total: {balance}. This month: #{group\_rank} in {group}, #{centre\_rank} in the centre. {points\_needed} more for {reward}. |

## Build prompts — points and rewards

First export this doc again and overwrite docs/SPEC.md, so Claude Code can read the add-on. Then run six more phases the same way as before: `/clear`, plan mode, paste, review the plan, check, commit. Each of your six deliverables maps to these phases:

| Deliverable | Phases |
| --- | --- |
| 1. Points and ranking system | 14, 15 |
| 2. Automatic points for students | 14 |
| 3. Teachers can award points | 13, 14 |
| 4. Student leaderboard | 15 |
| 5. Redeem points for rewards | 16 |
| 6. Points reports and notifications to students and parents | 17, 18 |

### Phase 13 — Teacher login and attendance

```text
Phase 13: Teacher role. Read docs/SPEC.md: "Points and rewards add-on → Decisions locked
in" and "Teacher role", plus "Roles and permissions" and "Business rules → Lessons and
attendance".

First update CLAUDE.md: Owner, Manager and Teacher log in; teachers see only their own
groups; students and parents never log in and use the Telegram bot.

Build:
- Migration: add teacher to user_role and profiles.teacher_id → teachers. RLS matching
  the Teacher column in "Teacher role": groups they teach, lessons where they substitute,
  students through a view teacher_students with names only (no phones, birth date,
  parents or balances), attendance writes for their own lessons until 23:59 the next day,
  Tashkent time.
- Teacher page: Give login (owner) invites the teacher by email and links the profile.
- /teach, phone-first: Today, Lesson screen with attendance (no points yet), My groups,
  Profile; bottom tab bar under 900 px. Teachers land on /teach and are redirected away
  from every staff route.

Do not build points yet.
Check: a Vitest RLS suite signed in as a teacher proves zero rows from payments, charges,
leads, teacher_pay_rates and other groups' students, no phone column in teacher_students,
and attendance edits refused after the window. e2e at 390 px: a teacher marks today's
attendance and the manager sees it on the group page. Screenshots at 390 and 1440 px.
```

### Phase 14 — Points engine and teacher awards

```text
Phase 14: Points engine. Read docs/SPEC.md, in the points add-on: "Defaults to confirm",
"Point rules", "Data model additions", "Screens → Teacher workspace", "Staff: student
page" and "Settings → Points".

Build:
- Migrations: points_settings (seeded with the defaults), point_presets (seeded in uz, ru,
  en), points_ledger (insert only: revoke update and delete from every role), the
  points_source and preset_kind enums, leads.referred_by_student_id,
  students.leaderboard_hidden, the student_points view.
- Automatic points, all idempotent through dedupe_key: an attendance trigger that posts
  the difference whenever attendance is saved or changed and reverses points when a lesson
  is cancelled; perfect month and fee on time in a daily Supabase Cron job at 00:20
  Tashkent time; referral when the referred student's first non-voided payment is recorded.
- award_points() as SECURITY DEFINER with every check in "Point rules". Undo posts a
  reversing row within 10 seconds.
- Teacher lesson screen: points per student, + and − bottom sheets with presets and
  Custom; History tab.
- Lead form: "Referred by" student search. Student page Points tab with balance, ledger and
  owner-only Adjust points. Settings → Points: on/off, values, limits, presets editor.
- Rules live in src/lib/domain/points.ts (pure) and are mirrored in SQL.

Unit tests: Present → Absent posts −2; running every job twice posts nothing new; perfect
month needs at least 4 held lessons and allows Late and Excused; fee on time with a
prorated first month; referral only after the first non-voided payment; the 10-per-day
teacher cap; 1–5 per action; a deduction reduced to the balance; programme off posts
nothing; changed values never touch old rows.
Check: as a teacher, award_points for a student outside their groups is refused.
Run /code-review.
```

### Phase 15 — Leaderboards and TV screen

```text
Phase 15: Leaderboards. Read docs/SPEC.md, in the points add-on: "Leaderboard rules",
"Screens → Staff: Points" and "Screens → TV screen".

Build:
- SQL leaderboard(scope, group_id, period, month) following "Leaderboard rules": Tashkent
  months, group boards count only that group's rows, ties share a rank, hidden students
  flagged.
- /points Leaderboard tab (centre or group, month or all-time, past months), a Leaderboard
  tab on the group page, and leaderboards in the teacher's My groups.
- /tv/[token]: public route checked against points_settings.tv_token that exposes nothing
  else; 1920 × 1080 layout; centre top 10, then each group's top 5, rotating every 15 s;
  data refresh every 60 s; first name + last initial; TV language setting; Copy and
  Regenerate link in Settings → Points.

Check: unit tests for ranking: ties give 1, 2, 2, 4; the month boundary is 00:00 Tashkent;
a student in two groups is ranked separately in each. e2e: a wrong token returns 404; a
hidden student is missing from the TV but visible on the staff board. Screenshot the TV
page at 1920 × 1080.
```

### Phase 16 — Rewards and redemption

```text
Phase 16: Rewards. Read docs/SPEC.md, in the points add-on: "Point rules" (reward rows),
"Screens → Staff: Points" (Rewards and Requests tabs) and "Defaults to confirm →
Redeeming".

Build:
- rewards and redemptions tables, the redemption_status enum, reward photos in a Supabase
  Storage bucket (owner uploads, signed-in users read).
- request_reward(): refuses when the balance is below the cost or stock is 0; posts a
  reward_hold row and takes one unit of stock in the same transaction.
- handle_redemption(): Give (status given, handled_by, handled_at) or Reject / Cancel
  (reason required, reward_return row, stock restored). Given is final.
- Rewards tab (owner edits, others view), Requests tab with an open-request count in the
  sidebar, Redeem reward button on the student page for desk requests.
- Seed rewards: Branded T-shirt 100 points, Notebook set 40, Free lesson 150 (unlimited).

Check: unit tests that two simultaneous requests cannot overspend a balance or take the
last unit twice (use row locks), that Reject returns points and stock, and that redeeming
does not change leaderboard rank. e2e: a manager redeems a T-shirt at the desk and marks
it given.
```

### Phase 17 — Telegram for students and parents

```text
Phase 17: Telegram for students and parents. Read docs/SPEC.md: "Telegram for students
and parents" in the points add-on, and "Notifications".

Build:
- telegram_links and the link_role enum. The migration moves each
  students.telegram_chat_id into a parent link and keeps the old code as parent_link_code;
  add student_link_code. The student page shows both links with QR codes.
- Webhook: /start s_<code>, /start p_<code>, /stop, /language, and a child picker for
  parents with several children.
- Commands /points, /top and /rewards (Request with a confirm step through
  request_reward(via = bot)), registered with setMyCommands in uz, ru and en.
- Re-route existing reminders to match the "Who gets what" table.
- New message types with uz/ru/en templates: weekly summary (Sunday 18:00 by default),
  points taken away (immediately, quiet hours respected), month results (the 1st at
  10:00), reward updates. Telegram only, a dedupe_key on each.

Unit tests with the FakeProvider: the routing table, a parent with two children, quiet
hours for deductions, no weekly summary for inactive students, no SMS for points messages,
dedupe.
Then give me a script that links my own Telegram as a test student and sends one of each
new message, and wait for me to run it.
```

### Phase 18 — Points reports and final review

```text
Phase 18: Points reports. Read docs/SPEC.md, in the points add-on: "Screens → Reports →
Points tab" and "Teacher role".

Build the Points tab in /reports: period picker, KPIs and the five charts, one SQL
function each, following our chart rules (purple main series, dark grey comparison,
greys after that, no gradients). Export CSV per chart. Teachers get the same tab inside
/teach, filtered to their groups by RLS.

Check: report totals equal sums from points_ledger for the same period, and awards per
teacher match each teacher's History tab. Then use a subagent to review Phases 13–18
against the points add-on in docs/SPEC.md and report only gaps that break the spec or
correctness. Fix them and run every test.
```

> **Built so far (Phase 14), and where it differs from the text above.** On the owner's instruction, what already worked was kept:
>
> - The teacher area is `/my-groups` (not `/teach`): the lesson's attendance sheet has the + and − buttons, and History is `/my-groups/history`. A teacher login is given in Settings → Users, a teacher edits attendance for 7 days, and the earlier Coins feature stays next to points.
> - `award_points()` also accepts a substitute for a lesson they teach today, but the `/my-groups` screens show a teacher only their own groups.
> - Awards and deductions each have their own daily allowance per teacher and student (10 by default); an undone row gives its allowance back. Undo is accepted for 15 seconds on the server; the button shows for 10.
> - The owner's adjustment is refused, not reduced, when it would take the balance below zero.
> - `points_settings.started_at`: nothing from before the programme existed earns points. Perfect month is posted for the first month that ends after the start; fee on time for the first due day after it.
> - Phase 15, leaderboards: `/points` is one page (the Leaderboard) until Phase 16 adds the Rewards and Requests tabs. The TV link is `/<language>/tv/<token>` and a link in another language is sent to the TV language chosen in Settings; a wrong or old token is a 404. The TV shows at most 10 and 5 lines, cutting a tie at the end by name, and leaves out students with no points. A teacher sees each of their groups' boards on the group's page; the centre board is open to them in the database but has no teacher screen yet. The Hide from public leaderboards switch is on the student's Points tab (owner and manager).
> - Fee on time (changed in Phase 15): the month's fee counts whenever it was written, so fees generated after the due day do not block the points; what matters is that payments made by the end of the due day cover everything charged up to that month.
> - Phase 16, rewards: a reward has one name and description (not one per language); the seeded three are in Uzbek and the owner can rename them. Photos are in the private `reward-photos` bucket (JPG, PNG or WebP, up to 2 MB), shown through one-hour signed links. Redeeming stays possible while the programme is switched off: it spends points, it does not create them. The Requests tab offers Give and Reject; Cancel exists in `handle_redemption()` for the bot in Phase 17. Teachers may read the catalogue in the database but have no screen for it yet.
> - Phase 17, Telegram for students and parents:
>   - `telegram_links` holds both chats. The old single link became the parent link: `students.telegram_link_code` was renamed `parent_link_code` and each chat moved to a parent row, so nobody links again. A link without `s_` or `p_` (printed before) is still read as the parent's.
>   - The four points messages are sent by the same 15-minute job as the reminders, so "as soon as it happens" means within 15 minutes, and never in quiet hours (they wait for them to end). A deduction is announced only after its Undo window, and an event older than 48 hours is not announced.
>   - The weekly summary and the month results go to active students who are in at least one group; the group named is the one where they have most points that month.
>   - Templates: the weekly one ends in `{goal}` and the month one in `{bonus}`, whole sentences the app writes in the chat's language, so nothing odd is left when there is no next reward or no bonus. `{reward}` and `{points_needed}` remain available. The reward update has one template with `{update}` (request received, handed over, or rejected with the reason). The weekly summary does not name a "top reason".
>   - A one-off message from staff by Telegram goes to the parent's chat, or to the student's own when no parent is linked.
>   - After deploying, press Settings → Notifications → Connect webhook once more: it now also asks Telegram for button presses and registers the command menu in uz, ru and en.
> - Phase 18, points reports: Reports has two tabs, Overview and Points. A teacher's report is at `/my-groups/reports`; the database narrows it to their groups (points that count for those groups, the students in them, their own awards and deductions). Definitions: earned is every non-reward row except teacher deductions and negative owner adjustments, corrections included; deducted is those two as a positive number; earned minus deducted is what the leaderboards count. "Unspent points" is today's total, whatever the period; "Students with no points" counts active students with nothing earned in the period.
> - After the review of Phases 13–18:
>   - While the programme is off nothing new is given, but points that are no longer deserved are still taken back (a mark changed to Absent, a lesson cancelled).
>   - The daily job also settles fee on time for last month, so a due day that ends as the next month starts is not missed.
>   - A reward request from the bot is made once per confirm message; stock returns on reject only if the request took a unit; editing a reward changes its stock only when the owner types a different number.
>   - `/top` counts the student's own place the same way as the list above it.
>   - A teacher's report has no spending or balances (they belong to no group): three KPIs and four charts. For staff, Unspent points is every point in the ledger.
>   - A teacher sees how many lessons they taught this month on My groups.
> - Still not built: ranks on the student's Points tab.

## Lead forms add-on

Staff build branded sign-up forms, one per funnel, on a separate public address. Website forms and Facebook/Instagram lead ads feed the same intake. Every lead lands in a shared inbox that updates live and pings staff on Telegram. Build it as Phases 19–23, after the points add-on or straight after Phase 12.

### Decisions locked in

| Decision | Answer |
| --- | --- |
| Outside lead sources | Your website or landing pages, and Facebook/Instagram lead ads connected directly |
| Who builds forms | Owner and managers |
| Who owns a new lead | Nobody at first: it waits in a shared queue until a manager takes it |
| Staff alerts | Live in the CRM, plus a Telegram message to staff |
| Spam protection | Hidden trap field and rate limits only; no CAPTCHA |
| Languages | One form per funnel, every text in uz, ru and en, with a switch for the visitor |
| Ad tracking | None for now: no pixels or analytics scripts |
| Address | A forms subdomain, e.g. `forms.yourcentre.uz/ielts-autumn` |

### Defaults to confirm

| Area | Default | Change it if |
| --- | --- | --- |
| Required fields | Every form has Name and Phone. Editors can relabel them but not delete them. |  |
| Phone input | Uzbek format `+998 __ ___ __ __`; a field option allows other countries |  |
| Consent | A required consent checkbox with editable text sits on every form; only the owner can remove it |  |
| Trap | Hidden field plus a signed timestamp: anything filled in under 3 seconds or holding the hidden field is dropped silently and logged as spam |  |
| Rate limits | 5 submissions per visitor per form per 10 minutes; 3 per phone number per day | Real families submit more often |
| Duplicates | Same phone as an open lead: no new lead; an activity "Submitted \<form> again" is added and it goes back to the inbox. Same phone as a student: a new lead tagged Existing student. |  |
| Drafts | Edits save automatically as a draft. Visitors see the published version until someone presses Publish. The last 20 versions can be restored. | Edits should go live at once |
| Funnel numbers | Page views counted on the server, no cookies, so each form shows views → leads → students won | You want no counting at all |
| Untaken leads | If nobody takes a lead within 30 minutes (09:00–21:00), staff get one reminder |  |
| Who gets Telegram alerts | Every owner and manager who linked Telegram and left alerts on in Profile |  |
| API keys and the Meta connection | Owner only | Managers should manage them too |
| Fonts | 8 fonts that cover Latin and Cyrillic: Inter, Manrope, Montserrat, Roboto, Open Sans, PT Sans, Nunito, Rubik | You have a brand font file |
| Uploads | PNG, JPG or WebP up to 5 MB, converted to WebP; no SVG uploads, since SVG can carry scripts |  |
| Editor screens | The editor needs a screen at least 1024 px wide; on phones it shows "Open on a computer" |  |

Public forms collect personal data from strangers. Uzbekistan's 2026 change to its personal data law lets most personal data be stored abroad, in countries on an approved list that includes Germany and the USA. So pick a Supabase region in a listed country, such as Frankfurt. This is not legal advice; confirm it with a lawyer before launch.

### How a lead arrives

&#91;embedded content: lead intake · 3 sources, 1 shared inbox\]

All three sources go through the same intake function, so spam, duplicate and validation rules can never differ between them.

### Form builder

Each form is one funnel: its own address, fields, look and texts, stored as one JSON document with a draft copy and a published copy. The public page and the editor preview render that document with the same `FormRenderer` component, so what staff see is exactly what visitors get.

**Field types**

| Type | Notes | Can map to |
| --- | --- | --- |
| Short text | One line, optional min and max length | Name, subject, preferred time, notes, custom |
| Long text | Several lines | Notes, custom |
| Phone | Uzbek mask by default, international option | Phone |
| Email | Format checked | Custom |
| Number | Min and max | Custom |
| Date | Date picker, Monday-first week | Custom |
| Single choice | Radio buttons or dropdown | Subject, preferred time, custom |
| Multiple choice | Checkboxes | Custom |
| Consent | Required checkbox with a link-capable text | Saved with the lead |
| Hidden value | Fixed value, never shown, e.g. a campaign name | Custom |
| Heading, paragraph, image | Content only, no answer | — |

Every field has, per language: label, placeholder and help text; plus required on/off, full or half width, and "maps to". Answers mapped to a lead column fill that column; all other answers are saved in `leads.answers` together with the label as it read at submission time.

**Design settings**

- Logo: upload, position at the top or on the left.
- Background: a colour, or an image with a darkening overlay from 0 to 80%.
- Colours: page text, card, card text, button, button text. Hex input plus swatches that include the brand purple. A warning appears under any text and background pair below 4.5:1 contrast.
- Font: one of the eight fonts, with a live sample.
- Corners: square, rounded or pill. Layout: centred card, or split with an image on one side.

**Form settings**

- Name, address (lowercase Latin letters, digits and hyphens; words like api and admin are reserved). Changing the address of a live form warns that old links will break.
- Subject the lead gets automatically, and a source tag (e.g. "Autumn IELTS ads").
- Languages switched on and the default language.
- After submit: a thank-you title and text, or a redirect to a URL.
- Closed-form message, page title, description and share image for link previews in Telegram.
- Embed code: an iframe snippet that resizes itself, for putting the form on another website.
- Status: Draft, Live or Closed.

**Funnels list — Leads → Forms tab**

- One row per form: name, status, address with Copy, views, leads and students won in the last 30 days, conversion %, last edited by.
- New form from blank or from a template: Course sign-up, Free trial lesson, Consultation call. Duplicate and Archive on every row.

### Editor with live preview — `/leads/forms/[id]/edit`

The editor fills the whole window: settings on the left, the real form on the right, updating as you type.

- **Top bar:** back arrow, form name (click to rename), status pill, "Saved" or "Saving…", Undo and Redo (last 50 changes, also Ctrl/Cmd+Z), preview language uz / ru / en, screen size Phone 390 · Tablet 768 · Desktop 1280 as a segmented control, Open live, and Publish (primary; reads "Publish changes" when the draft differs). A menu holds Version history, Close form and Duplicate.
- **Left panel, 400 px, three tabs:**
  - Fields: cards you drag to reorder. A card opens to edit its texts, with uz / ru / en tabs; a dot marks a missing translation. Add field opens a grid of field types. Name and Phone show a lock instead of Delete.
  - Design: everything in "Design settings", each change visible immediately.
  - Settings: everything in "Form settings".
- **Right side:** a light grey canvas with the form in a frame at the chosen width. When the frame is wider than the space, it scales down and shows the scale, e.g. 75%.
- The preview renders the in-memory draft and updates within 100 ms of a keystroke. You can type into it and see validation; Submit shows the thank-you screen and never creates a lead. A "Show thank-you screen" switch previews it directly.
- The draft auto-saves 1 second after the last change. If a second person opens the same form, both see a banner like "Malika is also editing" (Supabase Realtime presence), and the later save wins.
- Version history lists each publish with who and when, and a Restore button that loads that version into the draft.

### Public intake URL and Meta lead ads

Outside senders use one endpoint with a secret key per source; Facebook and Instagram use their own webhook. Both run the same checks as the CRM's own forms and write every request to an intake log.

**Website and landing pages — `POST https://forms.yourcentre.uz/api/v1/leads`**

- The owner creates a key per source in Settings → Lead sources. The full key is shown once; only a hash and a short prefix are stored.
- The key goes in `Authorization: Bearer <key>`, or as `?key=` for page builders that cannot set headers.
- Accepts JSON or ordinary form posts. Each source has a field map from incoming names to lead fields; common names (name, ism, имя, phone, tel, telefon, телефон) are recognised without setup. Unmapped fields go to `answers`.
- A source can be tied to a funnel, so its leads count in that form's numbers.
- Responses: `201` with the lead id and `created` or `merged`; `400` with field errors; `401` for a bad key; `429` when rate-limited (60 requests a minute per key). A request without a phone that only carries a `test` field gets `200`, so builders' connection checks pass.
- Settings → Lead sources shows the last 100 requests per source with their outcome, to debug a website form quickly.
- A website that cannot post server-side should embed the CRM form with the iframe snippet instead, so no key ends up in public page code.

**Facebook and Instagram lead ads — direct connection**

- Settings → Integrations (owner): Connect with Facebook, choose the Page(s). The app stores a long-lived Page token encrypted and subscribes the Page to the `leadgen` field through `/{page-id}/subscribed_apps`.
- `/api/meta/webhook`: answers Meta's GET verification with the challenge when the verify token matches; rejects any POST whose `X-Hub-Signature-256` does not match the app secret; replies 200 at once and processes afterwards.
- Each notification carries a `leadgen_id`, `form_id`, `page_id` and `ad_id`. The app fetches the lead by `leadgen_id`, maps full name, phone and email, and saves custom questions to `answers`. The `leadgen_id` is stored as `external_id`, so a lead is never created twice.
- An hourly job reads recent leads from each linked Meta form to catch anything a webhook missed.
- Each Meta form can be linked to a CRM funnel so its leads count in that funnel's numbers.
- If the token stops working, the integration shows Needs reconnect and the owner gets a Telegram alert.

Meta setup is the slow part. You need a Meta app that passes App Review for `leads_retrieval` and `pages_manage_ads`, then Business Verification; an app still in Development mode cannot read real leads. Start the review early. Until it passes, Make or Zapier can forward Meta leads to the website endpoint above with a source key.

### Shared inbox and staff alerts

A new lead is unassigned until someone presses Take. Everyone sees the queue live, and nobody can miss it for long.

**In the CRM (owner and managers)**

- Leads page: an Inbox strip above the board, "New from forms — 3 waiting". Each card shows name, phone, form, a one-line answer summary, how long it has waited, and Take.
- Take sets `assigned_to` to you and records `taken_at`; the owner can also assign a lead to someone else. Two people pressing Take together: the first wins, the second sees who took it.
- New leads appear without refreshing, through Supabase Realtime on `leads` inserts with RLS applied. A toast names the form and lead. A short sound plays unless turned off in Profile. The sidebar shows a count of untaken leads, and the browser tab title reads "(3) Leads".
- The lead sheet shows the form, the visitor's language, submission time, and every answer with its label as it read then.
- Teachers never see the inbox or get alerts.

**On Telegram**

- Staff link their own Telegram from Profile with `?start=u_<code>`, and can switch alerts off there.
- Each new lead sends: name, phone, form, the top answers, an Open in CRM button, and a Take button. Take works from Telegram too; if someone was faster, the bot replies with who took it.
- A lead untaken after 30 minutes, between 09:00 and 21:00, gets one reminder to everyone. Leads arriving at night alert at 09:00.
- Staff alerts go only to owners and managers, never to student or parent chats.

**Reports**

- The lead funnel in Reports gains a split by form: views, leads, taken, won, conversion %, and the median time to Take.

### Data model additions

Eight new tables. A form's fields, texts and design live in one JSON document, so adding a field never needs a migration.

```text
CHANGED
lead_source        + facebook | web_form | website
leads              + form_id → lead_forms, answers jsonb, submitted_language,
                   taken_at, external_id text unique (Meta leadgen id),
                   tags text[] (e.g. existing_student)
                   unassigned + status new = in the shared inbox
profiles           + telegram_chat_id bigint, staff_link_code, alerts_on bool (true),
                   alert_sound bool (true)
message_type       + staff_new_lead | staff_lead_reminder

NEW ENUMS
form_status        draft | live | closed
intake_channel     form | api | meta
intake_outcome     created | merged | spam | rate_limited | invalid | test | error

NEW TABLES
lead_forms         name, slug unique, status, subject, source_tag, draft jsonb,
                   published jsonb, published_version, published_at,
                   created_by, updated_by, archived_at
lead_form_versions form_id, version, content jsonb, published_by, published_at
form_assets        form_id, kind (logo | background | image | share), path, width, height
form_daily_stats   form_id, day, views, submissions      unique (form_id, day)
intake_sources     name, key_prefix, key_hash, field_map jsonb, form_id,
                   is_active, last_used_at, created_by
meta_connections   page_id, page_name, token_secret_id (Vault), status,
                   connected_by, connected_at, last_lead_at
meta_form_links    meta_form_id, meta_form_name, page_id, form_id → lead_forms
intake_log         received_at, channel, source_id, form_id, outcome, lead_id,
                   detail, ip_hash                         -- kept 90 days

FORM DOCUMENT (draft and published)
{ languages, default_language,
  texts:  { title, subtitle, button, thank_you_title, thank_you_text,
            closed_text, consent_text }               each as { uz, ru, en },
  fields: [ { id, type, maps_to, label, placeholder, help, required,
              width (full | half), options [ { id, label } ], value } ],
  design: { font, logo { asset, position }, background { color | asset, overlay },
            colors { text, card, card_text, button, button_text },
            corners (square | rounded | pill), layout (card | split) },
  after_submit { mode (message | redirect), url },
  share { page_title, description, image_asset } }
```

Form editors are owners and managers; `intake_sources` and `meta_connections` are owner-only; the public pages read only `published` through a server route, never the tables directly. New env variables: `FORMS_HOST`, `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `FORM_SIGNING_SECRET`.

### Built so far — lead forms

**Phase 19 (public forms).** What was built, and where it differs from the text above:

- **The public page is plain HTML.** Any page of the app ships more than 100 KB of framework JavaScript, so a form is served by a route (`src/app/form/[slug]/route.ts`) that renders `FormRenderer` to HTML with one small inline script and no script files. It works with JavaScript off: the form posts to its own address and the answer is a redirect to the thank-you screen (or the page again with the errors). The published document is cached per slug (`getPublicForm`), refreshed by `refreshPublicForm(slug)` and at most a minute old.
- **Hosts.** On `FORMS_HOST` only `/<slug>`, `/api/v1/*` and `/api/meta/*` are served; everything else is 404. On the staff host `/form/*` is 404. Until `FORMS_HOST` and `FORM_SIGNING_SECRET` are set, forms are not reachable anywhere.
- **Field types** in the document are `short_text, long_text, phone, email, number, date, radio, dropdown, multiple_choice, consent, hidden, heading, paragraph, image` (single choice is two types, `radio` and `dropdown`). An image field's `value` is its asset id.
- **Answers.** Fields mapped to name, phone, subject, preferred time or notes fill the lead's columns. Every other answer goes to `leads.answers` as `[{ id, type, label, value }]` in the visitor's language, consent included (the label is the consent text they agreed to).
- **Phones.** A lead's phone may be any full international number (`+` and 8–15 digits). Students and teachers still need an Uzbek number, so a lead with a foreign number cannot be converted until its phone is changed.
- **Duplicates.** A repeat from an open lead's phone adds the timeline entry `form_resubmitted`, clears `assigned_to` and `taken_at` and sets the stage back to New — except a lead on a trial, which keeps its stage. The tag for a known student is `existing_student`; a parent's phone counts too. The form's source tag is the lead's first tag.
- **Rate limits** are counted in `intake_log`: created, merged and spam rows count towards a visitor's five; a visitor is a keyed hash of the address. A limited visitor is told to try later; only spam gets the fake success. A page open for more than 24 hours asks the visitor to send again.
- **Fonts** load from Google Fonts. Form pictures are in the public `form-assets` storage bucket.
- **The three templates** are seeded live at `/course-signup`, `/free-trial` and `/consultation` (`src/lib/forms/templates.ts`; the migration is generated by `scripts/gen-form-templates-sql.mjs`).
- Not built yet: the editor and publishing (Phase 20), the inbox and alerts (Phase 21), the intake API (Phase 22), Meta lead ads (Phase 23). The `profiles` and `message_type` additions come with Phase 21.

## Build prompts — lead forms

Export this doc again and overwrite `docs/SPEC.md` first. By hand, add the forms subdomain to your Vercel project, point its DNS record where Vercel tells you, and add the new environment variables. Then run five phases the usual way: `/clear`, plan mode, paste, review, check, commit.

| Deliverable | Phases |
| --- | --- |
| 1. Public URL that accepts lead data | 22, 23 |
| 2. Public form page for leads | 19 |
| 3. Editable fields, new fields | 19, 20 |
| 4. Editable design: font, background, logo, colours | 19, 20 |
| 5. Different forms for different funnels | 19, 20 |
| 6. New leads reach owner and managers | 21 |
| 7. Live editor with screen-size buttons | 20 |

### Phase 19 — Forms subdomain and public form page

```text
Phase 19: Public lead forms. Read docs/SPEC.md, in the lead forms add-on: "Decisions
locked in", "Defaults to confirm", "Form builder" and "Data model additions".

Build:
- Migrations for lead_forms, lead_form_versions, form_assets, form_daily_stats,
  intake_log, the new enums and the new leads columns. RLS: owner and managers edit
  forms; no anonymous access to any table.
- Host routing in middleware: on FORMS_HOST serve only /[slug], /api/v1/* and
  /api/meta/*; every staff route returns 404 there, and form pages return 404 on the
  staff host.
- src/components/forms/FormRenderer: renders a form document (fields, design, texts in
  the visitor's language with a uz/ru/en switch). The editor preview will reuse it.
  Server-rendered, cached per slug and refreshed on publish, under 100 KB of JavaScript,
  accessible labels and error messages.
- One intake function in src/lib/intake/ used by every channel: zod validation built
  from the document, honeypot plus signed timestamp (3 s minimum, 24 h maximum,
  FORM_SIGNING_SECRET), rate limits (5 per visitor per form per 10 minutes, 3 per phone
  per day, stored in Postgres), duplicate rules, consent saved, lead created with
  form_id, answers with labels, submitted_language, source web_form, subject and tags.
  Spam gets a fake success and an intake_log row.
- Server-side view counting into form_daily_stats, no cookies.
- Thank-you screen or redirect, closed-form message, Open Graph tags from the share
  settings.
- Seed the three templates (Course sign-up, Free trial lesson, Consultation call) and
  publish them so they can be tested before the editor exists.

Check: unit tests for the validator builder, duplicate rules, trap timing and rate
limits. e2e on the forms host at 390 px: a submit in Russian creates a lead with Russian
answers; a honeypot submit shows success but creates nothing; a staff route on the forms
host returns 404. Screenshots of each template at 390 and 1280 px.
```

### Phase 20 — Form editor with live preview

```text
Phase 20: Form editor. Read docs/SPEC.md, in the lead forms add-on: "Form builder" and
"Editor with live preview".

Build:
- Leads → Forms tab: the funnels list with 30-day views, leads, students won and
  conversion; New (blank or template), Duplicate, Archive.
- /leads/forms/[id]/edit, full window, exactly as specified: top bar, left panel with
  Fields, Design and Settings tabs, right preview canvas with Phone 390 / Tablet 768 /
  Desktop 1280 and automatic scaling with the scale shown.
- One editor store (zustand) holding the form document; the preview renders
  FormRenderer from it, so every change shows within 100 ms. Undo and redo of the last
  50 changes, also with Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z.
- Fields: @dnd-kit reordering, type picker, uz/ru/en tabs with missing-translation dots,
  locked Name and Phone, options editor for choice fields.
- Design: uploads to Supabase Storage through a server action (PNG, JPG, WebP, 5 MB,
  converted to WebP), colour pickers with a contrast warning below 4.5:1, the eight
  fonts through next/font, corners, layout.
- Settings: slug with reserved words and a warning for live forms, subject, source tag,
  languages, after-submit, closed text, share settings, embed snippet that resizes
  itself through postMessage.
- Draft auto-save 1 s after the last change. Publish copies the draft to published,
  writes lead_form_versions and refreshes the cached page. Version history with Restore.
  Realtime presence banner when two people edit.
- Under 1024 px show "Open on a computer".

Check: unit tests for undo/redo and the contrast function. e2e: create a form from a
template, add a dropdown in all three languages, change the button colour and font,
switch to Phone and see the preview change, publish, then open the live page and confirm
the same field, colour and font. Screenshots of the editor at 1440 px for each screen size.
```

### Phase 21 — Shared inbox and staff alerts

```text
Phase 21: Shared inbox. Read docs/SPEC.md, in the lead forms add-on: "Shared inbox and
staff alerts".

Build:
- Inbox strip on /leads with Take (atomic: the first Take wins), owner Assign, and
  waiting timers.
- Supabase Realtime subscription to new leads with RLS applied; toast with sound (Profile
  switch); untaken count in the sidebar; "(n)" in the tab title.
- Lead sheet: form name, language, submission time, answers with their saved labels.
- Staff Telegram: Profile → Link Telegram (?start=u_<code>), alerts on/off, sound
  on/off. The bot handles u_ codes and a Take button that uses the same atomic Take and
  replies with who took it when someone was faster.
- An alert for every new lead; one reminder after 30 untaken minutes; leads arriving at
  night alert at 09:00. Use the existing message log and dedupe keys.
- Reports: lead funnel split by form with views, leads, taken, won, conversion and the
  median time to Take.

Check: a unit test that two simultaneous Takes give one winner. e2e with two browser
contexts: a form submit appears in the second manager's inbox without refreshing within
3 seconds, and Take in one removes it from the other. FakeProvider tests for alerts,
reminder timing and the night delay.
```

### Phase 22 — Public intake URL for websites

```text
Phase 22: Website intake. Read docs/SPEC.md, in the lead forms add-on: "Public intake URL
and Meta lead ads" (website part) and "Data model additions".

Build:
- intake_sources and owner-only Settings → Lead sources: create a key (shown once, hash
  and prefix stored), field-map editor with the built-in name recognition, optional
  funnel, on/off, last used, and the last 100 intake_log rows.
- POST /api/v1/leads on the forms host: Bearer header or ?key=, JSON and form-encoded
  bodies, field mapping, then the shared intake function (same validation, duplicate and
  rate rules, plus 60 per minute per key), the test-request rule, and responses
  201/400/401/429 as specified. No CORS for browsers.
- docs/INTAKE.md: how to connect a website or page builder, with curl examples.

Check: unit tests for field mapping (ism, имя, phone, telefon), key verification and
each response code. An integration test posting a JSON lead and a form-encoded lead.
```

### Phase 23 — Facebook and Instagram lead ads

```text
Phase 23: Meta lead ads. Read docs/SPEC.md, in the lead forms add-on: "Public intake URL
and Meta lead ads" (Meta part).

Build:
- meta_connections and meta_form_links. Settings → Integrations (owner): Connect with
  Facebook, Page picker, long-lived Page token stored in Supabase Vault, Page subscribed
  to leadgen, the Page's lead forms listed with a funnel picker, status and Reconnect.
- /api/meta/webhook on the forms host: GET verification with META_VERIFY_TOKEN; POST
  refused unless X-Hub-Signature-256 matches META_APP_SECRET; reply 200 at once and
  process after the response.
- Fetch each lead by leadgen_id, map name, phone and email, put custom questions in
  answers, store external_id, then call the shared intake function.
- Hourly Supabase Cron job that reads recent leads per linked Meta form to catch missed
  webhooks.
- A failing token sets Needs reconnect and sends the owner a Telegram alert.
- docs/META_SETUP.md: creating the Meta app, permissions, App Review and Business
  Verification steps, and the Make/Zapier fallback through a website source key.

Check: unit tests with recorded sample payloads: signature check, verification
handshake, mapping, a duplicate webhook delivery creates one lead, the backfill skips
known external_ids. Never call Meta in tests. Then wait for me to connect a real Page and
send a test lead with Meta's Lead Ads Testing Tool.
```

## Interface languages

The interface comes in uz, ru, en and ko (Korean, added for the centre's staff and teachers). A person's choice is kept on their profile (`profiles.language`, type `ui_language`). Messages to students and parents, templates, Telegram chats and the TV stay in uz, ru or en (`app_language`). Korean formats: money "1,250,000숨", dates "2026년 11월 10일", months "2026년 11월".

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
