"use server";

// Settings → Integrations: connecting Facebook Pages for lead ads. Owner only.
// docs/SPEC.md → "Lead forms add-on → Public intake URL and Meta lead ads".

import { refresh } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SettingsResult } from "@/lib/validation/settings";

import { MetaError, type MetaClient } from "./graph";
import { metaClient } from "./store";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function owner() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  return user?.role === "owner" && supabase ? { user, supabase } : null;
}

/** What Meta said, shown under the form; never a token. */
const failed = (error: unknown): SettingsResult<never> & { ok: false } => ({
  ok: false,
  error: "generic",
  detail: error instanceof MetaError ? error.message : undefined,
});

const pageId = z.string().regex(/^[0-9]{1,32}$/);

/** The Page's lead forms as Meta lists them now. A form's funnel is kept. */
async function syncForms(admin: Admin, client: MetaClient, page: string, token: string): Promise<void> {
  const forms = await client.forms(page, token);
  if (forms.length === 0) return;
  const { error } = await admin.from("meta_form_links").upsert(
    forms.map((form) => ({ meta_form_id: form.id, meta_form_name: form.name || form.id, page_id: page })),
    { onConflict: "meta_form_id" },
  );
  if (error) throw new Error(error.message);
}

/**
 * Connects the chosen Pages: each Page's long-lived token goes to Vault, the
 * Page is subscribed to "a lead was submitted", and its lead forms are listed.
 * The person's own token, kept while they chose, is then thrown away.
 */
export async function connectMetaPages(input: unknown): Promise<SettingsResult<{ connected: number }>> {
  const chosen = z.array(pageId).min(1).max(25).safeParse(input);
  if (!chosen.success) return { ok: false, error: "generic" };
  const ctx = await owner();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const admin = createAdminClient();
  const client = metaClient();
  if (!admin || !client) return { ok: false, error: "notConfigured" };

  const pending = await admin.rpc("meta_pending_token", { p_user: ctx.user.id });
  if (!pending.data) return { ok: false, error: "notFound" };
  try {
    const pages = (await client.pages(pending.data)).filter((page) => chosen.data.includes(page.id));
    if (pages.length === 0) return { ok: false, error: "notFound" };
    for (const page of pages) {
      const saved = await admin.rpc("meta_save_connection", { p_page_id: page.id, p_page_name: page.name, p_token: page.accessToken, p_user: ctx.user.id });
      if (saved.error) throw new Error(saved.error.message);
      await client.subscribe(page.id, page.accessToken);
      await syncForms(admin, client, page.id, page.accessToken);
    }
    await admin.rpc("meta_set_pending", { p_user: ctx.user.id, p_token: "" });
    refresh();
    return { ok: true, data: { connected: pages.length } };
  } catch (error) {
    console.error("meta connect", error instanceof Error ? error.message : error);
    refresh();
    return failed(error);
  }
}

/** Reads the Page's lead forms from Meta again: new forms appear, names follow. */
export async function refreshMetaForms(input: unknown): Promise<SettingsResult> {
  const page = pageId.safeParse(input);
  if (!page.success) return { ok: false, error: "notFound" };
  const ctx = await owner();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const admin = createAdminClient();
  const client = metaClient();
  if (!admin || !client) return { ok: false, error: "notConfigured" };

  const token = await admin.rpc("meta_page_token", { p_page_id: page.data });
  if (!token.data) return { ok: false, error: "notFound" };
  try {
    await syncForms(admin, client, page.data, token.data);
  } catch (error) {
    if (error instanceof MetaError && error.reconnect) await admin.rpc("meta_mark_reconnect", { p_page_id: page.data, p_detail: error.message });
    refresh();
    return failed(error);
  }
  refresh();
  return { ok: true };
}

/** The CRM funnel a Meta form's leads count in, or none. */
export async function setMetaFormFunnel(linkInput: unknown, funnelInput: unknown): Promise<SettingsResult> {
  const link = z.uuid().safeParse(linkInput);
  const funnel = z.uuid().nullable().safeParse(funnelInput);
  if (!link.success || !funnel.success) return { ok: false, error: "notFound" };
  const ctx = await owner();
  if (!ctx) return { ok: false, error: "notAllowed" };
  // As the owner: row level security decides.
  const { data, error } = await ctx.supabase.from("meta_form_links").update({ form_id: funnel.data }).eq("id", link.data).select("id");
  if (error) return { ok: false, error: error.code === "42501" ? "notAllowed" : "generic" };
  if (data.length === 0) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true };
}
