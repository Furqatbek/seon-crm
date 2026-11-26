-- A classmate's challenge in the 1v1 game is pushed to the invited student's
-- phone and listed among their notifications. The value is used from the next
-- migration on: a new enum value cannot be used in the transaction that adds it.

alter type public.message_type add value if not exists 'game_invite';
