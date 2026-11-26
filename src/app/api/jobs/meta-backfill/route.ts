import { runBackfill } from "@/lib/meta/leads";
import { metaDeps } from "@/lib/meta/store";
import { secretMatches } from "@/lib/notify/secret";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Supabase Cron calls this once an hour with `Authorization: Bearer <CRON_SECRET>`.
 * It reads the recent leads of every listed Meta form and takes the ones a
 * webhook missed. Safe to call twice: a lead Meta already delivered is skipped.
 */
export async function POST(request: Request) {
  const header = request.headers.get("authorization");
  const presented = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!secretMatches(presented, process.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });

  const admin = createAdminClient();
  if (!admin) return new Response("Not configured", { status: 503 });
  const deps = metaDeps(admin);
  // Meta is not set up for this centre: nothing to catch up on.
  if (!deps) return Response.json({ idle: "meta_not_configured" });
  return Response.json(await runBackfill(deps));
}
