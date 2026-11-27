import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { after, type NextRequest } from "next/server";
import { z } from "zod";

import { staffBotTexts } from "@/lib/notify/bot-texts";
import { runReceiptAlerts } from "@/lib/notify/receipt-notify";
import { getProviders, messageLog, receiptAlertData } from "@/lib/notify/store";
import { submitReceipt, type SubmitError } from "@/lib/receipts/submit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The student app sends a receipt here after putting its file in the private
 * `receipts` bucket: `POST /api/v1/receipts` with the person's own Supabase
 * access token in `Authorization: Bearer …` and a small JSON body (the file's
 * path, the amount, the day and an optional group and comment).
 *
 * The file is read back from the bucket and its type is checked from its
 * content (PNG, JPG or PDF, up to 5 MB) before the database writes the
 * receipt; a file that is refused is removed. Only this server may write a
 * receipt, so the check cannot be skipped. docs/STUDENT_APP_SPEC.md → "Rules →
 * Receipts".
 */

const bodySchema = z.object({
  path: z.string().min(1).max(200),
  amount: z.number().int().positive().max(1_000_000_000),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  group_id: z.uuid().nullish(),
  comment: z.string().trim().max(500).nullish(),
});

const STATUS: Record<SubmitError, number> = { notStudent: 403, file: 422, fileEmpty: 422, fileTooLarge: 413, fileType: 415, group: 422, amount: 422, date: 422, generic: 500 };

export async function POST(request: NextRequest) {
  const admin = createAdminClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!admin || !url || !publishableKey) return Response.json({ error: "not_configured" }, { status: 503 });

  // Who is asking: the access token is checked by Supabase Auth, not read here.
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  const auth = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const user = await auth.auth.getUser(token);
  if (user.error || !user.data.user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid" }, { status: 400 });

  const bucket = admin.storage.from("receipts");
  const result = await submitReceipt(
    {
      async studentOf(profileId) {
        const { data } = await admin.from("profiles").select("student_id").eq("id", profileId).eq("is_active", true).eq("role", "student").maybeSingle();
        return data?.student_id ?? null;
      },
      async download(path) {
        const file = await bucket.download(path);
        return file.data ? new Uint8Array(await file.data.arrayBuffer()) : null;
      },
      async remove(path) {
        await bucket.remove([path]);
      },
      sha256: async (bytes) => createHash("sha256").update(bytes).digest("hex"),
      async save(receipt) {
        const { data, error } = await admin.rpc("submit_receipt", {
          p_profile_id: receipt.profileId,
          p_group_id: receipt.groupId,
          p_amount: receipt.amount,
          p_paid_on: receipt.paidOn,
          p_file_path: receipt.path,
          p_file_type: receipt.type,
          p_file_hash: receipt.hash,
          p_comment: receipt.comment,
        });
        return error || !data ? { code: error?.code } : { id: data };
      },
    },
    { profileId: user.data.user.id, path: body.data.path, groupId: body.data.group_id ?? null, amount: body.data.amount, paidOn: body.data.paid_on, comment: body.data.comment ?? null },
  );
  if (!result.ok) return Response.json({ error: result.error }, { status: STATUS[result.error] });

  // The owner and managers hear of it on Telegram, after the answer has gone.
  after(async () => {
    try {
      await runReceiptAlerts(new Date(), {
        data: receiptAlertData(admin),
        log: messageLog(admin, admin),
        telegram: getProviders().telegram,
        texts: staffBotTexts,
        appUrl: process.env.APP_URL?.replace(/\/$/, "") ?? null,
      });
    } catch (error) {
      console.error("receipt alert", error);
    }
  });
  return Response.json({ id: result.id }, { status: 201 });
}
