import { z } from "zod";

import { studentAppTexts } from "@/lib/notify/bot-texts";
import { pushGameInvite, shortName } from "@/lib/notify/game-invite";
import { secretMatches } from "@/lib/notify/secret";
import { appEventData, appNotifyStore, getPushSender, inviteToPush } from "@/lib/notify/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The database calls this the moment a classmate's challenge is written, with
 * `Authorization: Bearer <CRON_SECRET>` and the invite's id. The invited
 * student's phones get a push. Safe to call twice: one push per invite.
 */
export async function POST(request: Request) {
  const header = request.headers.get("authorization");
  const presented = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!secretMatches(presented, process.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });
  const body = z.object({ invite_id: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return new Response("Bad request", { status: 400 });
  const admin = createAdminClient();
  if (!admin) return new Response("Not configured", { status: 503 });

  const outcome = await pushGameInvite(
    {
      store: appNotifyStore(admin),
      push: getPushSender(),
      invite: (id) => inviteToPush(admin, id, shortName),
      centreName: () => appEventData(admin).centreName(),
      texts: studentAppTexts,
    },
    body.data.invite_id,
  );
  return Response.json({ outcome });
}
