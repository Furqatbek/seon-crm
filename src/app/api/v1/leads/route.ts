import { after, type NextRequest } from "next/server";

import { handleIntakeRequest } from "@/lib/intake/api";
import { supabaseIntakeStore } from "@/lib/intake/store";
import { staffBotTexts } from "@/lib/notify/bot-texts";
import { runStaffAlerts } from "@/lib/notify/staff-alerts";
import { getProviders, messageLog, staffAlertData } from "@/lib/notify/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The intake API for websites and landing pages, on the forms host:
 * `POST https://forms.<centre>/api/v1/leads` with a source's key in
 * `Authorization: Bearer <key>` or `?key=`, and a JSON or form-encoded body.
 * docs/INTAKE.md has the details; src/lib/intake/api.ts has the rules.
 *
 * It is for servers and page builders, not for scripts in a visitor's
 * browser: no CORS headers are sent, so a browser refuses to read the answer,
 * and a key never belongs in public page code.
 */
export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  const secret = process.env.FORM_SIGNING_SECRET;
  if (!admin || !secret) return Response.json({ error: "not_configured" }, { status: 503 });

  let contentType = request.headers.get("content-type");
  let body: string;
  if (contentType?.toLowerCase().includes("multipart/form-data")) {
    // A multipart form post: its text fields, as an ordinary form post would send them.
    const form = await request.formData().catch(() => null);
    const fields = new URLSearchParams();
    for (const [name, value] of form ?? []) if (typeof value === "string") fields.append(name, value);
    body = fields.toString();
    contentType = "application/x-www-form-urlencoded";
  } else {
    body = await request.text().catch(() => "");
  }

  const result = await handleIntakeRequest(
    { authorization: request.headers.get("authorization"), queryKey: request.nextUrl.searchParams.get("key"), contentType, body },
    {
      async findSource(keyHash) {
        const { data, error } = await admin.rpc("intake_source_check", { p_key_hash: keyHash });
        if (error) throw new Error(error.message);
        const row = data?.[0];
        return row ? { id: row.id, name: row.name, fieldMap: row.field_map, formId: row.form_id, limited: row.limited } : null;
      },
      store: supabaseIntakeStore(admin),
      secret,
      // A lead entered the shared inbox: staff hear about it on Telegram.
      onLead: () =>
        after(() =>
          runStaffAlerts(new Date(), {
            data: staffAlertData(admin),
            log: messageLog(admin, admin),
            telegram: getProviders().telegram,
            texts: staffBotTexts,
            appUrl: process.env.APP_URL?.replace(/\/$/, "") ?? null,
          }).catch((error) => console.error("staff alerts", error)),
        ),
    },
  ).catch((error) => {
    console.error("intake api", error);
    return { status: 500 as const, body: { error: "server_error" }, headers: undefined };
  });

  return Response.json(result.body, { status: result.status, headers: { "cache-control": "no-store", ...result.headers } });
}
