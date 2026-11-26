import { handleSendSms } from "@/lib/app-auth/sms-hook";
import { getProviders } from "@/lib/notify/store";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Supabase Auth's Send SMS hook: Supabase calls this with the sign-up or
 * confirmation code for the student app, signed with SEND_SMS_HOOK_SECRET,
 * and the CRM sends it through Eskiz — at most 3 codes per phone per hour.
 * docs/STUDENT_APP_SPEC.md → "How to hand off to Claude Code".
 */
export async function POST(request: Request) {
  const admin = createAdminClient();
  if (!admin) {
    return Response.json({ error: { http_code: 503, message: "Not configured" } }, { status: 503 });
  }
  const result = await handleSendSms(
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    await request.text(),
    {
      secret: process.env.SEND_SMS_HOOK_SECRET,
      async allowed(phone) {
        const { data, error } = await admin.rpc("sms_code_allowed", { p_phone: phone });
        if (error) throw new Error(error.message);
        return data;
      },
      async release(phone) {
        const { error } = await admin.rpc("sms_code_release", { p_phone: phone });
        if (error) console.error("send-sms hook", error.message);
      },
      async centreName() {
        const { data } = await admin.from("centre_settings").select("centre_name").maybeSingle();
        return data?.centre_name ?? "";
      },
      send: (phone, text) => getProviders().sms.send(phone, text),
    },
  );
  return Response.json(result.body, { status: result.status, headers: result.headers });
}
