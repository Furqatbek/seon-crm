import { after, type NextRequest } from "next/server";

import { handleLeadgenEvents } from "@/lib/meta/leads";
import { metaDeps } from "@/lib/meta/store";
import { leadgenEvents, signatureMatches, verificationChallenge } from "@/lib/meta/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

// Fetching leads from Meta can take a while after the answer has gone.
export const maxDuration = 60;

/**
 * Meta's webhook for lead ads, on the forms host: `/api/meta/webhook`.
 * docs/SPEC.md → "Lead forms add-on → Public intake URL and Meta lead ads";
 * docs/META_SETUP.md says where this address and the verify token go.
 *
 * GET: Meta checks the address when it is saved. The challenge is echoed only
 * when the verify token is ours (META_VERIFY_TOKEN).
 */
export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const challenge = verificationChallenge(
    { mode: query.get("hub.mode"), token: query.get("hub.verify_token"), challenge: query.get("hub.challenge") },
    process.env.META_VERIFY_TOKEN,
  );
  if (challenge === null) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

/**
 * POST: a delivery. Refused unless X-Hub-Signature-256 matches the app secret
 * (META_APP_SECRET) over the body exactly as it arrived. Then 200 goes back at
 * once, and the leads are fetched and taken after the response: Meta gives a
 * webhook only a few seconds, and sends the delivery again if it is late.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!signatureMatches(raw, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Signed, but not JSON: nothing to do, and nothing for Meta to retry.
  }
  const events = leadgenEvents(payload);
  if (events.length > 0) {
    after(async () => {
      const admin = createAdminClient();
      const deps = admin ? metaDeps(admin) : null;
      if (!deps) return console.error("meta webhook: not configured");
      await handleLeadgenEvents(events, deps).catch((error) => console.error("meta webhook", error));
    });
  }
  return Response.json({ received: events.length }, { headers: { "cache-control": "no-store" } });
}
