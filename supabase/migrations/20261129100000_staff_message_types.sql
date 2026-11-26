-- Shared inbox and staff alerts (docs/SPEC.md → "Lead forms add-on → Shared
-- inbox and staff alerts"). Two messages that go to staff, not to families.
-- New enum values sit in their own migration.

alter type public.message_type add value if not exists 'staff_new_lead';
alter type public.message_type add value if not exists 'staff_lead_reminder';
