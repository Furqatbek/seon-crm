import { botTexts, staffBotTexts } from "@/lib/notify/bot-texts";
import { runPointsMessages } from "@/lib/notify/points-messages";
import { runReminders } from "@/lib/notify/reminders";
import { secretMatches } from "@/lib/notify/secret";
import { runStaffAlerts } from "@/lib/notify/staff-alerts";
import { getProviders, messageLog, pointsMessageData, reminderData, staffAlertData } from "@/lib/notify/store";
import { createAdminClient } from "@/lib/supabase/admin";

// Sending a batch of messages can take a while.
export const maxDuration = 60;

/**
 * Supabase Cron calls this every 15 minutes with
 * `Authorization: Bearer <CRON_SECRET>`. It finds what is due (payment and
 * lesson reminders, the points messages, then alerts to staff about leads
 * in the shared inbox), fills the templates, sends and logs. Safe to call twice: every message has a dedupe key.
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
  const summary = await runReminders(now, { data: reminderData(admin), log, providers: getProviders() });
  // The points messages for students and parents ride on the same run.
  const points = await runPointsMessages(now, { data: pointsMessageData(admin), log, providers: getProviders(), texts: botTexts });
  // Leads waiting in the shared inbox: alerts that were held back at night, and the 30-minute reminder.
  const staff = await runStaffAlerts(now, {
    data: staffAlertData(admin),
    log,
    telegram: getProviders().telegram,
    texts: staffBotTexts,
    appUrl: process.env.APP_URL?.replace(/\/$/, "") ?? null,
  });
  return Response.json({ ...summary, points, staff });
}
