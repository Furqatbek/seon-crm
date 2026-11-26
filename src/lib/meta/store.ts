import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseIntakeStore } from "@/lib/intake/store";
import { staffBotTexts } from "@/lib/notify/bot-texts";
import { runStaffAlerts, type StaffLanguage } from "@/lib/notify/staff-alerts";
import { getProviders, messageLog, staffAlertData } from "@/lib/notify/store";
import type { Database } from "@/lib/supabase/types";

import { GraphClient, type MetaClient } from "./graph";
import type { MetaConnection, MetaDeps, MetaStore } from "./leads";

type Db = SupabaseClient<Database>;

/** The Meta app's settings from the environment, or null until they are set. */
export function metaConfig(): { appId: string; appSecret: string; verifyToken: string | null } | null {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  return appId && appSecret ? { appId, appSecret, verifyToken: process.env.META_VERIFY_TOKEN || null } : null;
}

/** The real Graph API client, or null when the Meta app is not configured. */
export function metaClient(): MetaClient | null {
  const config = metaConfig();
  return config ? new GraphClient({ id: config.appId, secret: config.appSecret }) : null;
}

/** Connections, forms and known lead ids, read with the server's own key. */
export function supabaseMetaStore(admin: Db): MetaStore {
  const withToken = async (row: { page_id: string; page_name: string; status: string }): Promise<MetaConnection> => {
    const { data } = await admin.rpc("meta_page_token", { p_page_id: row.page_id });
    return { pageId: row.page_id, pageName: row.page_name, status: row.status === "connected" ? "connected" : "needs_reconnect", token: data ?? null };
  };
  return {
    async connection(pageId) {
      const { data, error } = await admin.from("meta_connections").select("page_id, page_name, status").eq("page_id", pageId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? withToken(data) : null;
    },
    async connections() {
      const { data, error } = await admin.from("meta_connections").select("page_id, page_name, status").eq("status", "connected");
      if (error) throw new Error(error.message);
      return Promise.all(data.map(withToken));
    },
    async forms(pageId) {
      const { data, error } = await admin.from("meta_form_links").select("meta_form_id, form_id").eq("page_id", pageId);
      if (error) throw new Error(error.message);
      return data.map((row) => ({ metaFormId: row.meta_form_id, funnelId: row.form_id }));
    },
    async funnelOf(pageId, metaFormId) {
      const { data, error } = await admin.from("meta_form_links").select("form_id").eq("meta_form_id", metaFormId).maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return data.form_id;
      // A form made after the Page was connected: listed now, named when the owner refreshes the list.
      await admin.from("meta_form_links").upsert({ meta_form_id: metaFormId, meta_form_name: metaFormId, page_id: pageId }, { onConflict: "meta_form_id", ignoreDuplicates: true });
      return null;
    },
    async known(leadgenIds) {
      const { data, error } = await admin.rpc("meta_known_leads", { p_ids: leadgenIds });
      if (error) throw new Error(error.message);
      return new Set((data ?? []) as string[]);
    },
    async markReconnect(pageId, detail) {
      const { data, error } = await admin.rpc("meta_mark_reconnect", { p_page_id: pageId, p_detail: detail });
      if (error) throw new Error(error.message);
      return data === true;
    },
    async touch(pageId, at) {
      await admin.from("meta_connections").update({ last_lead_at: at.toISOString() }).eq("page_id", pageId);
    },
  };
}

const staffLanguage = (value: string | null): StaffLanguage => (value === "ru" || value === "en" || value === "ko" ? value : "uz");

/**
 * Tells every owner with Telegram linked that a Page must be connected again.
 * Logged in the messages table; at most once a day per Page and person.
 */
export async function alertOwners(admin: Db, page: { pageId: string; pageName: string }, now: Date = new Date()): Promise<number> {
  const { data: owners, error } = await admin
    .from("profiles")
    .select("id, language, telegram_chat_id")
    .eq("role", "owner")
    .eq("is_active", true)
    .not("telegram_chat_id", "is", null);
  if (error) throw new Error(error.message);
  const log = messageLog(admin, admin);
  const telegram = getProviders().telegram;
  const day = new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let sent = 0;
  for (const owner of owners) {
    const recipient = String(owner.telegram_chat_id);
    const body = staffBotTexts(staffLanguage(owner.language))("metaReconnect", { page: page.pageName });
    const id = await log.begin(
      { studentId: null, staffId: owner.id, type: "staff_integration_alert", channel: "telegram", recipient, body, dedupeKey: `meta_reconnect:${page.pageId}:${day}:${owner.id}` },
      "queued",
    );
    if (id === null) continue;
    const result = await telegram.send(recipient, body);
    await log.finish(id, { status: result.ok ? "sent" : "failed", error: result.ok ? null : result.error, sentAt: result.ok ? now.toISOString() : null });
    if (result.ok) sent += 1;
  }
  return sent;
}

/** Everything the webhook and the hourly catch-up need, or null when Meta or the signing secret is not configured. */
export function metaDeps(admin: Db): MetaDeps | null {
  const client = metaClient();
  const secret = process.env.FORM_SIGNING_SECRET;
  if (!client || !secret) return null;
  return {
    client,
    store: supabaseMetaStore(admin),
    intake: supabaseIntakeStore(admin),
    secret,
    alertOwner: async (page) => void (await alertOwners(admin, page)),
    // A lead entered the shared inbox: staff hear about it on Telegram.
    onLead: () =>
      void runStaffAlerts(new Date(), {
        data: staffAlertData(admin),
        log: messageLog(admin, admin),
        telegram: getProviders().telegram,
        texts: staffBotTexts,
        appUrl: process.env.APP_URL?.replace(/\/$/, "") ?? null,
      }).catch((error) => console.error("staff alerts", error)),
  };
}
