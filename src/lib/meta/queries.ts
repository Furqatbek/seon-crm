import "server-only";

import { appUrl } from "@/lib/app-url";
import { formsBaseUrl } from "@/lib/forms/url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { MetaError } from "./graph";
import { metaClient, metaConfig } from "./store";

export type MetaFormRow = { id: string; metaFormId: string; name: string; funnelId: string | null };
export type MetaConnectionRow = {
  pageId: string;
  pageName: string;
  status: "connected" | "needs_reconnect";
  /** What Meta said when the token stopped working. */
  statusDetail: string | null;
  connectedAt: string;
  lastLeadAt: string | null;
  forms: MetaFormRow[];
};
export type MetaLogRow = { id: string; receivedAt: string; outcome: string; detail: string | null; leadId: string | null; leadName: string | null };

export type MetaIntegration = {
  /** META_APP_ID and META_APP_SECRET are set. */
  configured: boolean;
  verifyTokenSet: boolean;
  /** Where Meta sends leads: on the forms host. Null until FORMS_HOST is set. */
  webhookUrl: string | null;
  /** The address Facebook returns the owner to; it must be listed in the Meta app. */
  redirectUri: string;
  connections: MetaConnectionRow[];
  funnels: Array<{ id: string; name: string }>;
  /** After "Connect with Facebook": the Pages the owner manages, to choose from. */
  pages: Array<{ id: string; name: string; connected: boolean }> | null;
  /** Why the Pages could not be listed. */
  pagesError: string | null;
  /** The last requests from Meta and what became of each. */
  recent: MetaLogRow[];
};

/**
 * Settings → Integrations, for the owner. With `choosing`, the owner has just
 * come back from Facebook: the Pages they manage are read from Meta with the
 * token that waits in Vault. Null while the Meta migration is not applied.
 */
export async function getMetaIntegration(user: { id: string }, choosing: boolean): Promise<MetaIntegration | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const [connections, links, funnels, recent, base] = await Promise.all([
    supabase.from("meta_connections").select("page_id, page_name, status, status_detail, connected_at, last_lead_at").order("connected_at"),
    supabase.from("meta_form_links").select("id, meta_form_id, meta_form_name, page_id, form_id").order("meta_form_name"),
    supabase.from("lead_forms").select("id, name").is("archived_at", null).order("name"),
    supabase.from("intake_log").select("id, received_at, outcome, detail, lead_id, lead:leads(full_name)").eq("channel", "meta").order("received_at", { ascending: false }).limit(20),
    appUrl(),
  ]);
  if (connections.error || links.error || funnels.error) return null;

  const config = metaConfig();
  const forms = formsBaseUrl(process.env.FORMS_HOST);
  let pages: MetaIntegration["pages"] = null;
  let pagesError: string | null = null;
  if (choosing && config) {
    const admin = createAdminClient();
    const client = metaClient();
    const pending = admin ? await admin.rpc("meta_pending_token", { p_user: user.id }) : null;
    if (pending?.data && client) {
      try {
        const connected = new Set(connections.data.filter((row) => row.status === "connected").map((row) => row.page_id));
        pages = (await client.pages(pending.data)).map((page) => ({ id: page.id, name: page.name, connected: connected.has(page.id) }));
      } catch (error) {
        pagesError = error instanceof MetaError ? error.message : "Meta could not be reached";
      }
    }
  }

  return {
    configured: Boolean(config),
    verifyTokenSet: Boolean(config?.verifyToken),
    webhookUrl: forms ? `${forms}/api/meta/webhook` : null,
    redirectUri: `${base}/auth/meta/callback`,
    connections: connections.data.map((row) => ({
      pageId: row.page_id,
      pageName: row.page_name,
      status: row.status === "connected" ? "connected" : "needs_reconnect",
      statusDetail: row.status_detail,
      connectedAt: row.connected_at,
      lastLeadAt: row.last_lead_at,
      forms: links.data.filter((link) => link.page_id === row.page_id).map((link) => ({ id: link.id, metaFormId: link.meta_form_id, name: link.meta_form_name, funnelId: link.form_id })),
    })),
    funnels: funnels.data,
    pages,
    pagesError,
    recent: (recent.data ?? []).map((row) => ({
      id: row.id,
      receivedAt: row.received_at,
      outcome: row.outcome,
      detail: row.detail,
      leadId: row.lead_id,
      leadName: row.lead?.full_name ?? null,
    })),
  };
}
