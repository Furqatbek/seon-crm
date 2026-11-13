import { withDb } from "./db";

/**
 * Nothing is sent in quiet hours (21:00–09:00), so the notification tests
 * would depend on the time of day. They run with quiet hours off; the
 * teardown puts the centre's settings back.
 */
export default async function setup() {
  // Automatic reminders are off as well: with no provider configured the job
  // would log a failed message for every debtor on a payment day.
  await withDb((db) =>
    db.query("update centre_settings set quiet_from = '00:00', quiet_to = '00:00', reminders_enabled = false"),
  );
}
