import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/types";

import type { IntakeStore } from "./intake";

/** The intake's database side: two functions only the server's own key may call. */
export function supabaseIntakeStore(db: SupabaseClient<Database>): IntakeStore {
  return {
    async submit({ channel, formId, ipHash, lead, language }) {
      const { data, error } = await db.rpc("intake_submit", {
        p_channel: channel,
        p_form_id: formId,
        p_ip_hash: ipHash as string,
        p_full_name: lead.fullName,
        p_phone: lead.phone,
        p_subject: lead.subject as string,
        p_preferred_time: lead.preferredTime as string,
        p_notes: lead.notes as string,
        p_answers: lead.answers as unknown as Json,
        p_language: language,
      });
      if (error) throw new Error(error.message);
      const row = data?.[0];
      if (!row) throw new Error("intake_submit returned nothing");
      return { outcome: row.outcome, leadId: row.lead_id };
    },
    async reject({ channel, formId, outcome, detail, ipHash }) {
      const { error } = await db.rpc("intake_reject", {
        p_channel: channel,
        p_form_id: formId,
        p_outcome: outcome,
        p_detail: detail,
        p_ip_hash: ipHash as string,
      });
      if (error) throw new Error(error.message);
    },
  };
}
