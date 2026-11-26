-- Lead forms add-on (docs/SPEC.md → "Lead forms add-on → Data model additions").
-- New ways a lead arrives. 'website' has been there from the start. New enum
-- values sit in their own migration: they cannot be used in the one that adds them.

alter type public.lead_source add value if not exists 'facebook';
alter type public.lead_source add value if not exists 'web_form';
