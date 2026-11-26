-- Student app, step 1 of 2. docs/STUDENT_APP_SPEC.md → "Data model → CHANGED".
-- A new enum value cannot be used in the transaction that adds it, so the
-- values have a migration of their own. Everything that uses them is in the
-- next file.
--
-- app_language is left as it is. The spec lists "+ ko (app only)": Korean is
-- for the interface, and profiles.language is already ui_language (uz, ru, en,
-- ko). app_language is the language of messages to families, which stay in
-- uz, ru or en.

alter type public.user_role add value if not exists 'student';
alter type public.user_role add value if not exists 'app_user';
alter type public.user_role add value if not exists 'kiosk';

alter type public.lead_source add value if not exists 'mobile_app';

alter type public.points_source add value if not exists 'game_win';
alter type public.points_source add value if not exists 'exam';

alter type public.redemption_status add value if not exists 'ready';

alter type public.message_type add value if not exists 'visit_arrived';
alter type public.message_type add value if not exists 'visit_left';
alter type public.message_type add value if not exists 'account_linked';
alter type public.message_type add value if not exists 'voucher_expiring';
alter type public.message_type add value if not exists 'open_lesson_reminder';
alter type public.message_type add value if not exists 'receipt_approved';
alter type public.message_type add value if not exists 'receipt_rejected';
alter type public.message_type add value if not exists 'staff_new_receipt';
