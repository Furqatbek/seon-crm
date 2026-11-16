-- Teacher login, step 1 of 2. docs/SPEC.md → "Roles and permissions".
-- A new enum value cannot be used in the transaction that adds it, so it has
-- a migration of its own. Everything that uses it is in the next file.

alter type public.user_role add value if not exists 'teacher';
