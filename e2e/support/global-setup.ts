import { withDb } from "./db";

/**
 * Nothing is sent in quiet hours (21:00–09:00), so the notification tests
 * would depend on the time of day. They run with quiet hours off; the
 * teardown puts the centre's settings back.
 */
export default async function setup() {
  // Automatic reminders are off as well: with no provider configured the job
  // would log a failed message for every debtor on a payment day.
  await withDb(async (db) => {
    await db.query("update centre_settings set quiet_from = '00:00', quiet_to = '00:00', reminders_enabled = false");
    // After sign-in the app opens in the language saved on the profile; the
    // tests are written against the English screens.
    await db.query("update profiles set language = 'en' where id in (select id from auth.users where email like '%@demo.educrm.uz')");
  });
}
