import { withDb } from "./db";

/** Puts back what the notification tests changed. */
export default async function teardown() {
  await withDb(async (db) => {
    await db.query("update centre_settings set quiet_from = '21:00', quiet_to = '09:00', reminders_enabled = true");
    // No provider is configured in tests, so every send is logged as failed.
    await db.query("delete from messages where error in ('SMS is not configured', 'Telegram is not configured')");
    await db.query("update students set telegram_chat_id = null where telegram_chat_id between 990000000 and 990000999");
  });
}
