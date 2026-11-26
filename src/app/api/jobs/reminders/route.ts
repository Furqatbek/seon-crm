import { runAppNotifications, studentPush } from "@/lib/notify/app-notify";
import { studentAppTexts, botTexts, staffBotTexts } from "@/lib/notify/bot-texts";
import { runPointsMessages } from "@/lib/notify/points-messages";
import { runReminders } from "@/lib/notify/reminders";
import { secretMatches } from "@/lib/notify/secret";
import { runStaffAlerts } from "@/lib/notify/staff-alerts";
import {
  appEventData,
  appNotifyStore,
  getProviders,
  getPushSender,
  messageLog,
  pointsMessageData,
  reminderData,
  removeDeletedAvatars,
  staffAlertData,
} from "@/lib/notify/store";
import { createAdminClient } from "@/lib/supabase/admin";

// Sending a batch of messages can take a while.
export const maxDuration = 60;

/**
 * Supabase Cron calls this every 15 minutes with
 * `Authorization: Bearer <CRON_SECRET>`. It finds what is due (payment and
 * lesson reminders, the points messages, the student app's notifications,
 * then alerts to staff about leads in the shared inbox), fills the templates, sends and logs. Safe to call twice: every message has a dedupe key.
 */
export async function POST(request: Request) {
  const header = request.headers.get("authorization");
  const presented = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!secretMatches(presented, process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return new Response("Not configured", { status: 503 });

  const now = new Date();
  const log = messageLog(admin, admin);
  // A student who has the app is told by push; everyone else on Telegram as before.
  const appDeps = { store: appNotifyStore(admin), push: getPushSender() };
  const events = appEventData(admin);
  const app = studentPush(appDeps, events.centreName);
  const summary = await runReminders(now, { data: reminderData(admin), log, providers: getProviders(), app });
  // The points messages for students and parents ride on the same run.
  const points = await runPointsMessages(now, { data: pointsMessageData(admin), log, providers: getProviders(), texts: botTexts, app });
  // "Your account is linked to the centre", for accounts linked since the last runs.
  const appNotifications = await runAppNotifications(now, { ...appDeps, data: events, texts: studentAppTexts });
  // Leads waiting in the shared inbox: alerts that were held back at night, and the 30-minute reminder.
  const staff = await runStaffAlerts(now, {
    data: staffAlertData(admin),
    log,
    telegram: getProviders().telegram,
    texts: staffBotTexts,
    appUrl: process.env.APP_URL?.replace(/\/$/, "") ?? null,
  });
  // Profile photos of accounts deleted in the app since the last runs.
  const photosRemoved = await removeDeletedAvatars(admin).catch((error) => {
    console.error("deleted avatars", error);
    return 0;
  });
  return Response.json({ ...summary, points, staff, app: appNotifications, photosRemoved });
}
