-- Points messages for students and parents. New enum values cannot be used in
-- the transaction that adds them, so the templates are in the next migration.
alter type public.message_type add value if not exists 'points_weekly';
alter type public.message_type add value if not exists 'points_deduction';
alter type public.message_type add value if not exists 'points_month_result';
alter type public.message_type add value if not exists 'reward_update';
