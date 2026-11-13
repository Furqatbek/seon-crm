import { runReminders } from "@/lib/notify/reminders";
import { secretMatches } from "@/lib/notify/secret";
import { getProviders, messageLog, reminderData } from "@/lib/notify/store";
import { createAdminClient } from "@/lib/supabase/admin";

// Sending a batch of messages can take a while.
export const maxDuration = 60;

/**
 * Supabase Cron calls this every 15 minutes with
 * `Authorization: Bearer <CRON_SECRET>`. It finds what is due, fills the
 * templates, sends and logs. Safe to call twice: every message has a dedupe key.
 */
export async function POST(request: Request) {
  const header = request.headers.get("authorization");
  const presented = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!secretMatches(presented, process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return new Response("Not configured", { status: 503 });

  const summary = await runReminders(new Date(), {
    data: reminderData(admin),
    log: messageLog(admin, admin),
    providers: getProviders(),
  });
  return Response.json(summary);
}
