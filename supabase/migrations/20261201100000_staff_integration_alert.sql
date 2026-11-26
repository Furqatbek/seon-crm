-- Meta lead ads (docs/SPEC.md → "Lead forms add-on → Public intake URL and Meta
-- lead ads"). One more message to staff: an integration needs attention.
-- New enum values sit in their own migration.

alter type public.message_type add value if not exists 'staff_integration_alert';
