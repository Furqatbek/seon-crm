-- A student who finished their course: Graduated, set by hand.
-- A new enum value cannot be used in the transaction that adds it, so the
-- functions that use it are in the next migration.
alter type public.student_status add value if not exists 'graduated';
