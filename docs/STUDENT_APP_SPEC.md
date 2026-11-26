# Student App v2 — Claude Code Build Prompts

Nov 26, 2026 · @Furqat

Thirteen prompts, App 1 to App 13, that build the Flutter student app and its CRM changes on top of the CRM you already shipped. Everything is confirmed, and the approved Claude Design screens are the visual reference.

## How to hand off to Claude Code

This doc replaces the student app add-on and revision 2 in the main build doc. Claude Code reads it as its own spec file and checks its screens against the approved designs.

1. Export this doc as Markdown and save it in the CRM repository as `docs/STUDENT_APP_SPEC.md`.
2. Put the approved designs from Claude Design in `docs/design/student-app/` (phone screens, light and dark) and `docs/design/crm/` (reception scanner and receipts page). Use the frame names from the mockup brief, e.g. `02a-home.png` and `02a-home-dark.png`, or the hand-off files Claude Design gives you.
3. Do these by hand before App 1:
   - Supabase: turn on phone sign-up and point the Send SMS Hook at `https://<your CRM domain>/api/auth/send-sms`, then copy its secret into `SEND_SMS_HOOK_SECRET`.
   - Eskiz: get the sign-up and reset code texts approved, in Latin Uzbek with a straight apostrophe.
   - Firebase: one project with an iOS and an Android app; download the service account key for the CRM and the APNs key for iOS.
   - Apple Developer and Google Play accounts, if you don't have them yet.
4. Run the prompts in order, App 1 to App 13. Each starts in a fresh session: `/clear`, then `Shift+Tab` into plan mode, paste, read the plan, approve.
5. Every prompt ends with checks. Ask for the test output and screenshots, compare the screenshots with the designs yourself, then commit.
6. When the app and the spec disagree on behaviour, this doc wins. When a screenshot and a design disagree on looks, the design wins.

App 1, 6, 7, 9, 11 and 12 also change the CRM. App 13 is the store release.

## Decisions

Every row below is confirmed by the owner; nothing is left to guess.

| Area | Decision |
| --- | --- |
| Technology | Flutter for iOS and Android, in `mobile/` of the CRM repository, on the same Supabase project |
| Sign-up | Anyone: full name, phone, SMS code, password, Korean level. Password reset by SMS code. No logins issued by the centre. |
| Linking | Automatic by phone: the student's own phone first, the parent's phone only if exactly one student has it. Two students sharing a phone are never linked automatically. |
| Not linked | The person is an App user and becomes a lead with source Mobile app, or joins their existing open lead |
| Who uses the app | Linked students and App users; parents stay on Telegram |
| Several groups | Header switcher; next class, rank and attendance follow the chosen group; coins and balance are per student |
| Profile editing | Photo and own phone (re-verified by SMS); name, birthday and parent details only by staff |
| Coins | The CRM's points, renamed coins everywhere; one balance |
| 1v1 game | Tug of war: 10 questions, 10 s each; win = 5 coins; at most 5 rewarded wins a day and 2 rewarded games a day against the same person; random opponent of the same subject and level or a classmate challenge; practice against the computer after 30 s, no coins |
| Game questions | Written by teachers, or imported from Excel/CSV by owner and managers; 30 active questions per subject and level before random matches open |
| Unlinked players | Can play; no coins for anyone in a match with an App user; not on leaderboards |
| Mock exams | Solo, timed, TOPIK-style listening then reading; 1 coin per correct answer on the first attempt only; App users' coins are locked until they link |
| Offer | After an App user's first finished exam: a random voucher (20% off, 100 000 soʻm off, or a free trial week; equal chance; valid 14 days; one per person) and a free open lesson booking |
| Open lessons | Weekly slots set by staff; one active booking per person; cancel up to 2 hours before |
| QR check-in | Code changes every 30 s and works offline; reception scans it; arrival and leaving are logged only; parents get a Telegram message |
| Shop | Pick up at reception; variants such as sizes; Requested → Ready for pickup → Given, or Rejected; cancel while Requested; App users browse only |
| Payments | Linked students transfer to the centre's card and upload a receipt (PNG, JPG or PDF, 5 MB); owner and managers approve or reject |
| Exams in the schedule | Staff mark a lesson as an exam, with a title |
| Notifications | Push through Firebase; student messages go by push when the app is installed; parents keep Telegram |
| Leaderboards | Linked students only, first name and last initial |
| Languages | Uzbek (default), Russian, English, Korean |
| Look | Light and dark themes, electric violet #7C4DFF and cyan #00E5FF; follows the phone, can be forced |
| Account deletion | In the app, immediate; the centre keeps its business records |
| Visual source | The approved Claude Design screens |

## Users, roles and access

Three new roles join Owner, Manager and Teacher. The database enforces every cell below with RLS and SECURITY DEFINER functions; the app only hides what the role cannot use.

| Data or action | Student (linked) | App user (not linked) | Kiosk |
| --- | --- | --- | --- |
| Own profile, photo, phone, language, theme | Read and edit | Read and edit | — |
| Own groups, lessons, exams in schedule, attendance | Read | — | — |
| Own charges, payments, balance, receipts | Read; send receipts | — | — |
| Own coins and coin history | Read | Locked coins only | — |
| Leaderboards | Through a function returning first name + last initial | — | — |
| Rewards and variants | Read and order | Read only | — |
| Own orders, visits, notifications, device tokens | Read (orders: cancel while Requested) | Notifications and tokens only | — |
| Game questions | Never directly; only the current question of their own match | Same | — |
| Matches | Own, through functions | Own, through functions; random matches only | — |
| Mock exams | Published exams through functions; answers hidden until finished | Same | — |
| Voucher, open lesson bookings | — | Own | — |
| QR check-in | Show own code | — | `verify_checkin(code)` only |
| Anything about other people, staff, leads or finance totals | No | No | No |

A Kiosk account exists only for the reception tablet: it can open `/checkin` in the CRM and nothing else.

## Account lifecycle

&#91;embedded content: account lifecycle · sign-up to linked student\]

`link_or_lead()` runs after the SMS code is verified and again whenever staff save a student's or lead's phone. It checks the student's own phone first, then the parent's phone if exactly one student has it; two students sharing a phone are left for staff to link by hand. An existing open lead with the same phone is reused instead of creating a new one.

## App behaviour

The designs show how each screen looks; this section says what it does. Each tab has a Student version and an App user version, chosen from the profile role.

**Sign-up and sign-in**

- Welcome → Create account: full name, phone (+998 mask), password (8+ characters, shown/hidden), Korean level (Beginner, TOPIK I, TOPIK II), consent line linking the privacy policy.
- SMS code: 6 digits, resend after 60 seconds, plain-word errors for a wrong code (tries left), too many SMS ("try again in N minutes") and an already registered phone (offers Sign in).
- After the code: "Your account is linked to the centre" with the group name, or straight to the App user Home.
- Sign in with phone and password. Forgot password: phone → code → new password twice. The session persists until Log out or Delete account.

**Home**

- Student: group switcher and bell with a live unread count; hero card with the next lesson or exam in the chosen group and a live countdown (a cancelled lesson is skipped; nothing scheduled says so); Rank and Coins; Balance and Attendance. One call to `student_home(group_id)` loads it all; pull to refresh.
- App user: greeting and bell; hero card suggesting the next unfinished mock exam for their level with Start; Locked coins; the next free open lesson or their booking; the voucher card when they have one.

**Notifications**

- Grouped by day, unread first in bold, marked read when opened, each opening its screen. Types: coins earned or taken away, order updates, receipt decisions, game challenges, lesson and exam reminders, payment due, voucher expiring, open lesson reminders, account linked.

**Game tab** — a segmented control: 1 ga 1 | Sinov imtihonlari

- 1v1: lobby (subject, Play now, Challenge a classmate for students only, rewarded wins left, last 20 matches), searching state with the 30-second practice offer, incoming challenge card, match screen on Supabase Realtime, result with answer review. App users see "No coins until you join the centre" on every result.
- Mock exams: list filtered by level, intro, listening section, reading section, question grid with flags, result with review; App users then see the offer card.

**QR tab**

- Student: the rotating code with photo and name, a 30-second countdown ring, brightness raised while open, today's status (Arrived 14:52 or Not arrived yet).
- App user: a locked state explaining that check-in is for students, with Book a free lesson.

**Shop**

- Student: grid with prices and stock, "N more coins" on items they can't afford, product page with variant picker, confirm sheet with balance before and after, My orders with Cancel while Requested.
- App user: the same grid, browse only, with the banner "Join the centre to spend coins" and their locked balance.

**More**

- Student: hero (photo, name, groups); Edit profile; Leaderboard; Schedule; Payments (balance, charges and payments, Pay by card, My receipts); Coin history; Language; Appearance; Privacy policy; About the centre; Delete account; Log out.
- App user: hero (photo, name, Korean level); Edit profile; My voucher; Open lessons (list for the next 4 weeks, Book, Cancel, my bookings); Language; Appearance; Privacy policy; About the centre; Delete account; Log out.
- Edit profile: photo from camera or gallery, cropped square; changing the phone sends a code to the new number before it is saved; Change password.
- Delete account: a sheet listing what is deleted (login, coins, results, bookings) and what the centre keeps (payment records), then immediate deletion and sign-out.

## Rules

The server decides every result, coin and check below; the app only displays state and sends taps. Each rule becomes a database function or a pure function in `src/lib/domain/` with unit tests.

### Coins

- Coins live in the existing `points_ledger`; new sources are `game_win` and `exam`. Leaderboards count earned coins, never rewards, and only linked students.
- App users' exam coins go to `locked_coins`. On linking every locked row moves into the ledger as an `exam` row with a dedupe key, so it can never move twice.

### 1v1 game

- Matchmaking pairs the first two waiting for the same subject and level. App users play at their profile level: Beginner and TOPIK I use the TOPIK I bank, TOPIK II the TOPIK II bank. Classmate challenges are for students only and expire after 60 seconds.
- A match draws 10 active questions, avoiding ones either player saw in the last 7 days where possible. Each question is shown at the same server time with 10 seconds to answer.
- A correct answer pulls the rope 1 step; the faster of two correct answers pulls 1 extra step; wrong or no answer pulls nothing. The rope runs from −5 to +5: reaching 5 wins at once; otherwise after 10 questions the side the rope is on wins; dead centre is a draw.
- Coins: 5 to the winner only when both players are linked students, within 5 rewarded wins a day and 2 rewarded games a day between the same two students. Draws give nothing.
- 20 seconds without a heartbeat forfeits the match; a job every minute closes abandoned matches. After 30 seconds without an opponent the player may practise against the computer (correct 60% of the time after 3–8 s), never for coins.

### Mock exams

- An exam has a level (TOPIK I or TOPIK II), a listening and a reading section, each with a question count and time limit, a listening play limit (1 or 2), coins per correct answer (default 1) and optional estimated-level thresholds. Writing is not included.
- Presets when creating an exam; every number stays editable:

| Preset | Listening | Reading |
| --- | --- | --- |
| TOPIK I, paper style | 30 questions, 40 min | 40 questions, 60 min |
| TOPIK II, paper style | 50 questions, 60 min | 50 questions, 70 min |
| TOPIK I, internet style (2025) | 26 questions, 30 min | 26 questions, 40 min |
| TOPIK II, internet style (2025) | 30 questions, 35 min | 30 questions, 40 min |

- Listening comes first. Each section's deadline is set by the server; leaving the app doesn't stop it; reopening resumes; any call after a deadline submits that section. Audio cannot be scrubbed and counts plays on the server.
- The correct answers never reach the phone until the exam is finished. The result shows correct answers per section and in total, the estimate only when thresholds exist (labelled "Practice estimate, not an official TOPIK result"), and a review with explanations.
- Coins = correct answers × rate, for the first completed attempt of each exam only. Students get them at once; App users get locked coins.
- Exams are the centre's own material; the app calls them TOPIK-style practice exams, never official TOPIK.

### Vouchers

- Issued once per person, after an App user's first finished exam. Type drawn at random using the weights in Settings (default equal): 20% off the first month, 100 000 soʻm off the first month, or a 7-day free trial.
- Code like `KOR-7F3K9` without easily confused characters; valid 14 days; a push 3 days before expiry; status issued, redeemed or expired.
- In the CRM enrol sheet, % and fixed vouchers reduce the first charge after proration, never below 0; the trial voucher gives 7 days without charge before the monthly fee starts. Each code works once.

### Free open lessons

- Staff set weekly slots; the app shows the next 4 weeks with seats left. One active booking per person; cancel up to 2 hours before.
- Booking moves the lead to Trial with the date and a timeline entry. Pushes at 18:00 the evening before and 2 hours before. Staff mark Came or No-show.

### Receipts

- Linked students only. Amount pre-filled with the amount due; file PNG, JPG or PDF up to 5 MB, type checked from the content; images shrunk to 2000 px; stored in a private bucket behind short-lived signed links.
- Same file, or same amount and date from the same student, shows a duplicate warning to staff.
- Approve records exactly one payment (method Transfer) linked to the receipt; Reject needs a reason. The student gets a push either way.

### QR check-in

- Code `v1.<student_id>.<time_step>.<signature>`: 30-second steps signed with HMAC-SHA256 using a per-student secret kept in Supabase Vault and in the phone's secure storage, so it works offline. Changing the password or phone replaces the secret.
- `verify_checkin` accepts the current and previous step only. The first scan of the day is Arrived, the next Left, and so on; repeats within 2 minutes are ignored. Lesson attendance is never touched.
- The parent's Telegram chat gets the arrival or leaving message at once, even in quiet hours (owner can switch this off).

### Notifications

- Every message for a student creates a `notifications` row and goes by push when the student has a device token, otherwise by the student's Telegram link. Parents keep Telegram.
- Quiet hours 21:00–09:00: reminders wait or are skipped as in the CRM; visit messages and decisions on receipts are sent at once.

## CRM changes

The CRM keeps its original white and royal purple look; these are the pages and actions the app needs. Words follow the coin rename: tanga (uz), монеты (ru), coins (en) in every CRM string, bot message and template.

| Where | Change | Who |
| --- | --- | --- |
| Student page | App status (Linked / Not signed up), Send app invite (SMS with store links), Unlink / Relink, Visits tab | Owner and managers; Unlink only owner |
| Lead sheet and inbox | Source Mobile app, Korean level, voucher, open lesson bookings and results | Owner and managers |
| Lesson sheet | Mark as exam, with a title | Owner, managers, teachers |
| Enrol sheet | Voucher code field | Owner and managers |
| Points → Questions | Game question bank: list, on/off, CSV/XLSX import with a row-error report, correct-rate flags | Owner and managers; teachers edit their subjects in `/teach` |
| Points → Mock exams | Exam builder from presets, passages, audio, questions, XLSX import, preview, stats | Owner, managers, teachers (only owner and managers publish) |
| Leads → Open lessons | Weekly slots, session lists, Came / No-show | Owner and managers; teachers see their slots in `/teach` |
| Finance → Receipts | Pending list with previews, live count, Approve into Take payment, Reject with reason | Owner and managers |
| `/checkin` | Full-screen reception scanner: camera and handheld scanners, 3-second result card, search fallback | Kiosk, owner, managers |
| Settings → Points | Coins per game win, daily and same-opponent limits, exam coins per correct answer, minimum questions | Owner |
| Settings → Vouchers | Types on/off, weights, values, validity | Owner |
| Settings → Payments | Card number, holder name, bank, instructions in uz, ru, en, ko | Owner |
| Settings → About and Privacy | Texts in uz, ru, en, ko | Owner |
| Settings → Users | Create Kiosk accounts | Owner |
| Reports | Vouchers issued and redeemed by type, conversions; app sign-ups per week; exam attempts and averages | Owner and managers |

New receipts and new app leads use the existing live inbox pattern: sidebar count, toast, and Telegram alerts to staff who have them on.

## Data model

Twenty-two new tables on top of the shipped CRM, plus new columns and enum values. Money stays `bigint` soʻm and coins stay integers. Every new table has RLS on from its first migration.

```text
CHANGED (tables the CRM already has)
user_role          + student | app_user | kiosk
app_language       + ko (app only)
profiles           + student_id → students, lead_id → leads, phone (unique, from auth),
                   korean_level (beginner | topik1 | topik2), avatar_path,
                   theme (system | light | dark), linked_at
students           + qr_secret_id (Vault)
lessons            + kind (lesson | exam), exam_title
lead_source        + mobile_app
points_source      + game_win | exam
redemption_status  + ready
redemptions        + variant_id
points_settings    + game_win_coins (5), game_daily_rewarded_wins (5),
                   game_pair_daily_cap (2), game_min_questions (30),
                   exam_coins_per_correct (1)
centre_settings    + about jsonb, privacy_policy jsonb (uz, ru, en, ko),
                   parent_visit_alerts bool (true), payment_card { number, holder, bank },
                   payment_instructions jsonb (uz, ru, en, ko)
message_type       + visit_arrived | visit_left | account_linked | voucher_expiring |
                   open_lesson_reminder | receipt_approved | receipt_rejected |
                   staff_new_receipt

APP BASICS
notifications      profile_id, type, title, body, data jsonb, read_at, created_at
device_tokens      profile_id, token unique, platform (ios | android), app_version, last_seen
visits             student_id, kind (arrived | left), at, method (qr | manual), scanned_by
reward_variants    reward_id, name (uz, ru, en, ko), stock
locked_coins       profile_id, amount, exam_attempt_id, created_at, moved_at

1V1 GAME
questions          subject, level, language, text, image_path, options jsonb [{ id, text }],
                   correct_option_id, explanation, difficulty (1–3), is_active,
                   times_used, times_correct, created_by, archived_at
question_imports   file_name, rows, created, errors jsonb, imported_by
match_queue        profile_id unique, subject, level, group_id, joined_at
match_invites      from_profile, to_profile, subject, level, group_id, expires_at,
                   status (pending | accepted | declined | expired)
matches            kind (random | friend | practice), subject, level, player_a, player_b
                   (null = computer), group_a, group_b, coins_eligible bool,
                   status (countdown | playing | finished | cancelled), question_ids uuid[],
                   current_index, question_started_at, rope smallint (−5…5),
                   winner (a | b | draw), rewarded bool, last_seen_a, last_seen_b,
                   created_at, finished_at
match_answers      match_id, player (a | b), question_index, option_id, is_correct,
                   answered_at, ms_taken    primary key (match_id, player, question_index)

MOCK EXAMS
exams              title, level (topik1 | topik2), audio_max_plays (1 | 2),
                   coins_per_correct (null = settings), level_thresholds jsonb,
                   status (draft | published), created_by, published_by, published_at,
                   archived_at
exam_sections      exam_id, kind (listening | reading), position, time_limit_sec,
                   question_count
exam_passages      exam_id, section_id, kind (text | audio), text, image_path, audio_path,
                   position
exam_questions     section_id, passage_id, position, prompt,
                   options jsonb [{ id, text, image_path }], correct_option_id, explanation
exam_attempts      exam_id, profile_id, status (in_progress | submitted | expired),
                   started_at, current_section, section_deadlines jsonb,
                   correct_listening, correct_reading, coins, coins_locked bool,
                   first_attempt bool, submitted_at
exam_answers       attempt_id, question_id, option_id, flagged, audio_plays, answered_at
                   primary key (attempt_id, question_id)

OFFER AND PAYMENTS
voucher_settings   single row: per type { enabled, weight, value }, valid_days (14)
vouchers           code unique, profile_id unique, lead_id, type (percent | fixed |
                   trial_week), value, issued_at, expires_at,
                   status (issued | redeemed | expired), redeemed_at, redeemed_by,
                   enrollment_id
open_lesson_slots  title, korean_level, weekday, start_time, duration_min, room,
                   teacher_id, seats, is_active
open_lesson_bookings  slot_id, session_date, profile_id, lead_id,
                   status (booked | cancelled | came | no_show), booked_at
                   unique (slot_id, session_date, profile_id)
payment_receipts   student_id, profile_id, group_id, amount, paid_on, file_path, file_type,
                   file_hash, comment, status (pending | approved | rejected),
                   reject_reason, payment_id → payments, reviewed_by, reviewed_at,
                   created_at

FUNCTIONS (SECURITY DEFINER)
link_or_lead(profile_id) · delete_my_account() · student_home(group_id)
qr_secret() · verify_checkin(code)
join_queue · leave_queue · send_invite · answer_invite · match_state · submit_answer ·
advance_match · heartbeat
start_exam · exam_state · answer_exam · record_audio_play · submit_section · finish_exam
issue_voucher · redeem_voucher(code, enrollment_id)
book_open_lesson(slot_id, session_date) · cancel_open_lesson_booking(id)
request_reward · handle_redemption (extended for variants and ready)
submit_receipt · review_receipt(id, action, reason)
```

New environment variables: `SEND_SMS_HOOK_SECRET` and the Firebase service account for push, on the CRM; `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` through `--dart-define` in the app.

## Theme and languages

These are the exact values behind the approved designs; `mobile/lib/ui/tokens.dart` holds them, and no widget uses a colour, radius or size from anywhere else. Contrast is against each theme's background; nothing under 4.5:1 is used for text.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | #FFFFFF | #0B0B14 | Page |
| `surface` | #F5F6FA | #151526 | Cards, inputs, tab bar |
| `elevated` | #FFFFFF + soft shadow | #1E1E33 | Sheets, pop-overs |
| `border` | #E4E4EE | #2A2A40 | Hairlines |
| `text` | #0F0F1A (19:1) | #F4F4FA (17.9:1) | Main text |
| `text-secondary` | #5B5B70 (6.6:1) | #A0A0B8 (7.7:1) | Labels, hints |
| `primary` | #7C4DFF (4.8:1) | #9D7BFF (6.3:1) | Links, active icons, violet text |
| `primary-fill` | #7C4DFF, white text 4.8:1 | #7C4DFF, white text 4.8:1 | Primary buttons, raised QR tab |
| `accent` | #00E5FF decoration only; text #007C91 (4.9:1) | #00E5FF (12.7:1) | Highlights, opponent side in games |
| `success` | #007A3D (5.5:1) | #00E676 (11.7:1) | Paid, correct, approved |
| `warning` | #9A5B00 (5.4:1) | #FFB300 (10.9:1) | Due soon, checking |
| `danger` | #D7263D (5.0:1) | #FF4D6D (6.1:1) | Debt, wrong, rejected |
| `gradient` | #7C4DFF → #00E5FF | same | Home hero outline, timers, game rope, progress rings only |
| `glow` | none | 0 0 24 px violet at 35% | Primary buttons and the hero card |

- Shapes: cards radius 20 with a 1 pt hairline; buttons radius 14 and 52 pt tall; pills fully rounded. Spacing on a 4 pt grid; side padding 16 pt.
- Type: SF Pro on iPhone and Inter on Android; Hangul in the system fonts (Apple SD Gothic Neo, Noto Sans CJK). Large title 28/34, title 22/28, headline 17/22 (all semibold), body 15/20, footnote 13/18, caption 12/16; tabular figures for numbers.
- Appearance: System (default), Light, Dark, saved to the profile.
- Languages: `app_uz.arb` (default), `app_ru.arb`, `app_en.arb`, `app_ko.arb`. First launch takes the phone's language when it is one of the four. Exam content stays in Korean whatever the interface language.
- Coins are tanga, монеты, coins and 코인. Uzbek uses Latin with ʻ (U+02BB).

## mobile/CLAUDE.md

App 2 saves this as `mobile/CLAUDE.md`. Claude Code reads it whenever it works inside `mobile/`, on top of the repository's root CLAUDE.md.

```markdown
# Student app (Flutter)

Student app for the Edu CRM, in the same repo. Spec: ../docs/STUDENT_APP_SPEC.md.
Approved designs: ../docs/design/student-app/ (light and dark). Same Supabase project as
the CRM: never bypass RLS and never put a service or secret key in the app.

## Stack
- Flutter stable, Dart 3, iOS and Android only
- supabase_flutter (auth, data, realtime, RPC), flutter_riverpod, go_router
- flutter_localizations + gen-l10n: lib/l10n/app_uz.arb, app_ru.arb, app_en.arb, app_ko.arb
- qr_flutter, flutter_secure_storage, firebase_messaging, cached_network_image,
  image_picker, just_audio (exam listening)

## Commands
- flutter pub get | dart format . | flutter analyze | flutter test
- flutter test integration_test
- flutter run --dart-define-from-file=env/dev.json

## Rules
- IMPORTANT: build only what the spec lists. Match the approved design for looks; the
  spec wins for behaviour. List any conflict before coding.
- Colours, radii, spacing and type only from lib/ui/tokens.dart (light and dark).
- Every visible string goes into all four ARB files in the same change.
- Money is int soʻm, coins are int; display through formatMoney() / formatCoins().
- Results, coins, exam scores, QR checks, vouchers and leaderboards are decided by the
  server. The app only shows state and sends the user's taps.
- Every tab has a Student and an App user version, chosen from the profile role.
- Only SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY come in through --dart-define.
- Screens in lib/features/<feature>/, shared widgets in lib/ui/, data access in
  lib/data/ repositories.
- Accessibility: semantic labels, text scaling to 200% without overflow, tap targets
  at least 44 pt, 4.5:1 contrast in both themes.

## Done means
analyze is clean, tests pass, and golden screenshots at 390×844 and 412×915, in light
and dark, in uz, ru, en and ko, match the approved designs.
```

## Build prompts

Thirteen phases, run in order, one fresh session each. Every app prompt names the design frames it must match, using the frame numbers from the mockup brief.

| Phase | Builds | Changes | Designs |
| --- | --- | --- | --- |
| App 1 | Roles, SMS sign-up, linking, app leads, push, account deletion | CRM, database | — |
| App 2 | Flutter project, themes, languages, sign-up screens, tab shell | App | 01, 26 |
| App 3 | Home and notifications | App | 02, 03, 18 |
| App 4 | More tab | App | 12–17, 18h |
| App 5 | Shop with variants | CRM, app | 09–11 |
| App 6 | QR check-in and the reception scanner | CRM, app | 08, 19 |
| App 7 | 1v1 game server and question banks | CRM, database | — |
| App 8 | 1v1 game in the app | App | 04–07 |
| App 9 | Mock exams: builder and engine | CRM, database | — |
| App 10 | Mock exams in the app | App | 20–23 |
| App 11 | Vouchers and free open lessons | CRM, app | 02d, 23b, 24 |
| App 12 | Card payments and receipts | CRM, app | 25, 27 |
| App 13 | Review and store release | Both | all |

### App 1 — CRM groundwork: roles, sign-up, linking

```text
App 1: CRM groundwork for the student app. Read docs/STUDENT_APP_SPEC.md: "Decisions",
"Users, roles and access", "Account lifecycle", "Rules → Coins", "Rules →
Notifications", "CRM changes" and "Data model".

First update the root CLAUDE.md: students and the public sign up in the Flutter app in
mobile/ (spec: docs/STUDENT_APP_SPEC.md); the roles Student, App user and Kiosk exist.

Build:
- Migrations for everything under CHANGED and APP BASICS in "Data model". Game, exam,
  voucher, open lesson and receipt tables come in later phases.
- Supabase phone sign-up with a password. CRM route /api/auth/send-sms for the Send SMS
  Hook: verify the signature with SEND_SMS_HOOK_SECRET, send through the existing Eskiz
  provider, at most 3 SMS per phone per hour.
- link_or_lead(profile_id) exactly as "Account lifecycle": called after phone
  confirmation and by triggers when a student's or lead's phone changes or a lead is
  converted; locked coins move into points_ledger once, with dedupe keys.
- RLS for Student, App user and Kiosk exactly as "Users, roles and access"; a
  leaderboard function returning first name + last initial, linked students only.
- Student page: app status, Send app invite, owner-only Unlink / Relink.
- Rename points to coins in every CRM string, bot message and template.
- Lesson sheet (staff and /teach): Mark as exam, with a title.
- Settings → About and Privacy in uz, ru, en, ko; Settings → Users: Kiosk accounts.
- student_home(group_id) returning the Student Home data.
- Notify service: write a notifications row and push through the FCM HTTP v1 API
  (Firebase service account in env); student messages go by push when a device token
  exists, otherwise to the student's Telegram link.
- delete_my_account(): removes the auth user, profile, device tokens, notifications and
  locked coins, unlinks the student record, keeps business records.

Check: Vitest for link_or_lead (student phone; parent phone with one student; two
students sharing a phone; an existing open lead; a student created later linking an app
account and moving its locked coins exactly once). RLS suites for Student, App user and
Kiosk. A test of the SMS hook route with a signed sample payload. Run /code-review.
```

### App 2 — Flutter foundation: themes, languages, sign-up, tabs

```text
App 2: Flutter foundation. Read docs/STUDENT_APP_SPEC.md: "mobile/CLAUDE.md", "Theme and
languages" and "App behaviour → Sign-up and sign-in". Designs: 01a–01f, and the dark
frames in 26 for the dark palette.

Ask me for the app name and bundle id first. Then build in mobile/:
- A Flutter project for iOS and Android; mobile/CLAUDE.md with exactly the content of its
  section; env/dev.json.example.
- lib/ui/tokens.dart with both palettes, shapes and type; light and dark ThemeData;
  Appearance (System / Light / Dark) saved to the profile; gradient and glow widgets used
  only where the spec allows; shared widgets AppCard, StatCard, Pill, MoneyText,
  CoinsText, EmptyState, Skeleton, PrimaryButton, SecondaryButton.
- gen-l10n with uz (default), ru, en, ko; formatMoney and formatCoins with tests;
  first-launch language from the phone.
- Welcome, Create account, SMS code (resend after 60 s), Sign in, Forgot password and the
  linked confirmation; plain-word errors; persisted session.
- go_router with the five-tab shell (Home, Game, raised QR, Shop, More); each tab picks
  its Student or App user version from the profile role and shows an EmptyState for now.
- Firebase on both platforms; token saved to device_tokens after sign-in and removed on
  log out; tapping a notification opens its screen.

Check: analyze clean; unit tests for the formatters; widget tests for sign-up validation
and the code screen; golden screenshots of 01a–01f and the shell in light and dark, in
uz, ru, en and ko, at 390×844 and 412×915, compared with the designs.
```

### App 3 — Home and notifications

```text
App 3: Home and notifications. Read docs/STUDENT_APP_SPEC.md: "App behaviour → Home" and
"App behaviour → Notifications". Designs: 02a–02e, 03, 18a–18d.

Build:
- Student Home from one student_home(group_id) call: group switcher (remembered on the
  device), bell with a live unread count (Realtime on notifications), hero card with a
  live countdown, Rank and Coins, Balance and Attendance, pull to refresh, skeletons,
  offline banner; taps go to their screens (placeholders until later phases).
- App user Home: greeting, bell, hero card for the next unfinished mock exam (a
  placeholder until App 10), Locked coins, the open lesson card and voucher card
  (placeholders until App 11).
- Notifications grouped by day, marked read on open, a deep link for every type.

Check: widget tests for every card state (lesson vs exam, cancelled next lesson, nothing
scheduled, paid vs debt with due date, no lessons yet, App user with and without a
voucher); goldens against 02a–02e, 03 and 18 in both themes, also at 200% text size.
```

### App 4 — More tab

```text
App 4: More. Read docs/STUDENT_APP_SPEC.md: "App behaviour → More" and "Theme and
languages". Designs: 12a–12b, 13, 14, 15, 16, 17a–17d, 18h.

Build every More page for both roles: hero; Edit profile (photo crop and upload to
Supabase Storage, phone change with an SMS code to the new number, change password);
Leaderboard (group or centre, month or all-time, own row pinned); Schedule (week view,
exams highlighted, cancelled struck through, Monday start, Tashkent time); Payments
(balance, charges and payments, receipt numbers; Pay by card and My receipts disabled
until App 12); Coin history; My voucher and Open lessons for App users (placeholders until
App 11); Language (four languages, switching instantly); Appearance; Privacy policy and
About from centre settings; the Delete account sheet calling delete_my_account(); Log out.

Check: widget tests for both More versions, leaderboard pinning and schedule week
boundaries; an integration test that switches to Korean and dark mode and sees Home
change; an integration test that deletes a test account and confirms it can no longer
sign in; goldens against the designs in both themes.
```

### App 5 — Shop

```text
App 5: Shop. Read docs/STUDENT_APP_SPEC.md: "App behaviour → Shop", "Users, roles and
access" and "Data model" (reward_variants and the redemption changes). Designs:
09a–09b, 10a–10b, 11.

Build:
- CRM: variants in the Rewards editor (names in four languages, stock per variant); the
  Requests tab gets Mark ready, which sends a push, before Give.
- request_reward() and handle_redemption() extended for variants, the ready status and
  cancellation by the student while Requested (coins and stock returned). App users can
  never order.
- App: grid, product page with variant picker and stock, confirm sheet with the balance
  before and after, My orders with statuses and Cancel; the App user browse-only version
  with the banner and locked balance.

Check: unit tests that a variant's last unit cannot be ordered twice at once, that Cancel
returns coins and stock, that Ready sends exactly one push, and that the database refuses
an App user's order. An integration test: order a size M T-shirt in the app, mark it
ready and given in the CRM, and watch the app follow. Goldens against the designs.
```

### App 6 — QR check-in and the reception scanner

```text
App 6: QR check-in. Read docs/STUDENT_APP_SPEC.md: "Rules → QR check-in", "App
behaviour → QR tab" and "CRM changes" (/checkin and the Visits tab). Designs: 08a–08c,
and 19a–19d in docs/design/crm/.

Build:
- A per-student QR secret in Supabase Vault, created on linking and replaced when the
  password or phone changes; qr_secret() hands it only to that signed-in student.
- App QR tab: offline code generation (v1.<student_id>.<time_step>.<signature>, 30 s
  steps, HMAC-SHA256), countdown ring, brightness raised while open, today's status; the
  App user locked state with Book a free lesson.
- verify_checkin(code) for Kiosk, owner and managers: current or previous step only,
  alternating Arrived/Left per day, repeats within 2 minutes ignored, a visits row.
- CRM /checkin full screen: camera plus keyboard-style handheld scanners, the 3-second
  result card (photo, name, Arrived/Left, today's lessons, Debt badge), sound,
  plain-word errors, search by name.
- Parent Telegram visit messages (sent at once, owner toggle) and the student page Visits
  tab.

Check: unit tests with fixed clocks in Dart and on the server producing the same code;
expiry after two steps; tampered signatures refused; the alternating rule. e2e: a Kiosk
account can open only /checkin and logs an arrival from a generated code. Goldens
against 08, and /checkin screenshots against 19.
```

### App 7 — 1v1 game server and question banks

```text
App 7: 1v1 game server and question banks. Read docs/STUDENT_APP_SPEC.md: "Rules → 1v1
game", "CRM changes" (Points → Questions) and "Data model" (1V1 GAME).

Build:
- Migrations for questions, question_imports, match_queue, match_invites, matches,
  match_answers and the game settings.
- Question banks: /teach → Questions (own subjects, preview) and CRM Points →
  Questions (all questions, on/off, CSV/XLSX import with a template download and a
  row-error report before saving, flags below 15% or above 95% correct).
- Matchmaking: join_queue for students and App users (level mapping from the spec);
  send_invite / answer_invite for students only (60 s expiry); practice against the
  computer after 30 s.
- Engine as SECURITY DEFINER functions: draw 10 questions avoiding 7-day repeats;
  match_state never includes the answer; submit_answer records server time; scoring
  exactly as "Rules → 1v1 game"; advance_match after deadlines; heartbeat and the
  20-second forfeit; a Supabase Cron job every minute closes abandoned matches.
- Coins: coins_eligible only when both players are linked students; game_win rows for
  the lobby group; daily and same-opponent limits from Settings → Points.

Check: tests for scoring with every mix of right, wrong, late and missing answers; early
win; draw; forfeit; both limits; no coins when an App user plays; no way to read
correct_option_id before answering; two simultaneous submits for one question count
once. Run /code-review.
```

### App 8 — 1v1 game in the app

```text
App 8: 1v1 game in the app. Read docs/STUDENT_APP_SPEC.md: "App behaviour → Game tab"
and "Rules → 1v1 game". Designs: 04, 05a–05d, 06a–06b, 07a–07c.

Build in mobile/:
- The Game tab's segmented control (1 ga 1 | Sinov imtihonlari; the exam side is a
  placeholder until App 10).
- Lobby: subject picker, Play now with the searching state and the 30-second practice
  offer, Challenge a classmate (students only), incoming challenge card and push,
  rewarded wins left, last 20 matches.
- Match screen on Supabase Realtime: opponent header, 3-2-1 countdown, question with
  options and a 10-second timer synced to server time, the rope with violet and cyan
  sides sliding each step, light haptics and sounds (silent mode respected), heartbeat
  every 5 seconds, reconnect handling.
- Result: winner, rope score, coins won or why none were given (daily limit, or an App
  user in the match), and the question review.

Check: widget tests for the rope at every position and for timer drift correction; an
integration test playing a full match between two simulated clients on the dev project,
one of them an App user; goldens against 04–07 in both themes.
```

### App 9 — Mock exams: builder and engine

```text
App 9: Mock exams, builder and engine. Read docs/STUDENT_APP_SPEC.md: "Rules → Mock
exams", "Rules → Coins", "CRM changes" (Points → Mock exams) and "Data model" (MOCK
EXAMS).

Build:
- Migrations for exams, exam_sections, exam_passages, exam_questions, exam_attempts and
  exam_answers; a storage bucket for exam audio and images (staff write; signed reads for
  users with an attempt on that exam).
- CRM Points → Mock exams: list with status and stats; builder from the four presets;
  passages, audio (MP3 or M4A up to 10 MB), questions with text or picture options; XLSX
  import with audio matched by file name and a row-error report; preview as a student;
  Publish for owner and managers. Teachers get the builder in /teach without Publish.
- Engine as SECURITY DEFINER functions: start_exam, exam_state (never includes correct
  answers before finish), answer_exam, record_audio_play (enforces the play limit),
  submit_section, finish_exam; section deadlines on the server; any call after a deadline
  submits that section.
- Scoring and coins: correct answers per section; coins = correct × rate for the first
  completed attempt only; points_ledger rows (source exam) for students, locked_coins for
  App users; estimated level only from the exam's thresholds.

Check: tests for the presets, deadlines, play limits, correct_option_id unreadable during
an attempt, first-attempt-only coins, locked vs real coins by role, linking that moves
locked exam coins, and import errors. Run /code-review.
```

### App 10 — Mock exams in the app

```text
App 10: Mock exams in the app. Read docs/STUDENT_APP_SPEC.md: "App behaviour → Game
tab" and "Rules → Mock exams". Designs: 20a–20b, 21, 22a–22b, 23a–23b, and 02d for
the Home hero card.

Build in mobile/:
- The Mock exams side of the Game tab: list by level with past results, intro,
  listening with just_audio (plays left from the server, no scrubbing) and picture
  options, reading with passages, question grid with flags, section timers from server
  deadlines, resume after reopening, auto-submit.
- Result: per-section results, the estimate label when set, review with explanations,
  coins earned or locked coins; for App users the offer card (a placeholder until
  App 11).
- Home: the App user hero card now opens the next unfinished exam.

Check: widget tests for the timers, play counter and question grid; an integration test
completing a short exam on the dev project as a student and as an App user, checking
coins vs locked coins; goldens against 20–23 in both themes and in Korean.
```

### App 11 — Vouchers and free open lessons

```text
App 11: Vouchers and free open lessons. Read docs/STUDENT_APP_SPEC.md: "Rules →
Vouchers", "Rules → Free open lessons", "CRM changes" and "Data model" (the voucher and
open lesson tables). Designs: 02d, 23b, 24a–24c.

Build:
- voucher_settings, vouchers, open_lesson_slots, open_lesson_bookings.
- issue_voucher on an App user's first finished exam: weighted random type, value from
  settings, unambiguous code, 14-day expiry, one per profile ever; an expiry job and the
  3-day reminder push.
- CRM: Settings → Vouchers; the voucher on the lead sheet; the Voucher code field in the
  enrol sheet applying % or fixed to the first charge after proration (never below 0) or
  the 7-day free trial; each code once. Leads → Open lessons: slots editor and session
  lists with Came / No-show; teachers see their slots in /teach. Reports: vouchers
  issued and redeemed, conversions.
- App: the offer card on the exam result; My voucher; open lessons for the next 4 weeks
  with seats left, Book, Cancel (2-hour cutoff), one active booking; Home cards for the
  voucher and the booking; reminder pushes.

Check: tests for the weighted draw (10 000 draws within tolerance), one voucher per
person, discount maths with proration, the free trial week, double booking and the
cutoff. e2e: an App user finishes an exam, gets a voucher and books an open lesson; staff
enrol them with the code and the account links automatically. Goldens against the
designs.
```

### App 12 — Card payments and receipts

```text
App 12: Card payments and receipts. Read docs/STUDENT_APP_SPEC.md: "Rules → Receipts",
"CRM changes" (Finance → Receipts, Settings → Payments) and "Data model"
(payment_receipts). Designs: 25a–25c and 16; 27a–27b in docs/design/crm/.

Build:
- payment_receipts, a private storage bucket, submit_receipt (type checked from content:
  PNG, JPG, PDF; 5 MB; duplicate warning) and review_receipt.
- CRM Settings → Payments: card details and instructions in uz, ru, en, ko.
- CRM Finance → Receipts: pending list with previews, live updates, sidebar count, staff
  Telegram alerts; Approve opens Take payment pre-filled and links the payment; Reject
  with a reason.
- App: enable Pay by card (amount due, card with Copy, instructions, form, upload with
  image shrinking) and My receipts with statuses; a push on each decision.

Check: tests that a renamed .exe sent as .jpg is refused, a 6 MB file is refused,
duplicates are flagged, approving creates exactly one payment, and a student reads only
their own receipts. e2e: a student uploads a receipt in the app, a manager approves it,
and the balance updates in the app. Goldens against 25, screenshots against 27.
```

### App 13 — Review and store release

```text
App 13: Review and store release.

1. Use a subagent to review mobile/ and every CRM change from App 1–12 against
   docs/STUDENT_APP_SPEC.md; fix only gaps that break the spec, security or correctness.
2. Compare every screen with its design in light and dark, list differences, fix them.
3. Create demo accounts for store reviewers: a linked student in a demo group (lessons,
   coins, an order, match and exam history) and an App user with a voucher and a booking.
4. App icon and splash screen from the centre logo; app name in four languages.
5. Write docs/MOBILE_RELEASE.md: Apple Developer and Google Play accounts, bundle ids,
   signing, Firebase keys (APNs for iOS), privacy policy URL, store data-safety answers
   based on what the app really collects (phone, name, photos, receipts, exam answers),
   the screenshot list from the designs, the demo logins for reviewers, the in-app
   account deletion path, and how to build iOS on a Mac or with Codemagic.
6. Build a release Android App Bundle and, if a Mac is available, an iOS archive.
   Upload nothing yourself; walk me through submission.

Check: flutter analyze, all tests and goldens pass; the CRM build, lint, typecheck, unit
and e2e tests pass. Show the output.
```

## Iteration prompts

Use these after `/clear` when something needs fixing. Fill in the angle brackets.

**Fix a bug**

```text
Bug in the student app: as a <Student | App user>, in <light | dark>, language
<uz | ru | en | ko>, on <screen>, I <did what>. It <did what>. It should <do what>,
according to "<section>" in docs/STUDENT_APP_SPEC.md.
Write a failing test first, fix the root cause, then run analyze and all tests. Change
nothing else.
```

**Screen doesn't match its design**

```text
[paste a screenshot] Screen <frame number, e.g. 02a> doesn't match
docs/design/student-app/<file>: <what differs>. Fix it using only lib/ui/tokens.dart,
then take light and dark screenshots at 390×844 and list what changed.
```

**Fix a translation**

```text
On <screen> the <uz | ru | en | ko> text "<current text>" is <wrong | missing | too long>.
Fix it in lib/l10n/app_<lang>.arb only, keep the keys identical in all four files, and
update the goldens for that screen.
```

**Change a rule**

```text
Change the rule "<quote it from docs/STUDENT_APP_SPEC.md>" to "<new rule>". Update the
spec first, then the database function and its src/lib/domain mirror, then the tests
with a case for the new behaviour. Tell me which existing records it affects; never
rewrite past coins, payments or exam results.
```

## Sources

- [Claude Code best practices](https://code.claude.com/docs/en/best-practices.md) — plan mode, `/clear`, CLAUDE.md, verification, `/code-review`
- [Supabase Send SMS Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook) — sending auth codes through your own SMS provider
- [Flutter getMaterialTranslation](https://api.flutter.dev/flutter/flutter_localizations/getMaterialTranslation.html) — supported Flutter locales, including Uzbek
- [Apple App Review 5.1.1(v) account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion) — in-app deletion for apps that support account creation
- [UAB: TOPIK levels and test structure](https://webs.uab.cat/topik/?p=103) — paper test sections, question counts and times
- [HKEAA: TOPIK](https://hkeaa.edu.hk/en/IPE/TOPIK/TOPIK.html) — 2025 internet-test sections, question counts and times
- [Cost to publish an app (Choicely)](https://www.choicely.com/tutorials/how-much-does-it-cost-to-publish-an-app) — Apple $99 a year, Google Play $25 once
