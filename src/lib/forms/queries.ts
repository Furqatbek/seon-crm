import "server-only";

import { createClient } from "@/lib/supabase/server";

import { formDocumentSchema, formDraftSchema, type FormDocument } from "./document";
import { formAssetUrl, type FormAsset } from "./public";

export type FormOverview = {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "live" | "closed";
  hasChanges: boolean;
  updatedAt: string;
  updatedBy: string | null;
  /** The last 30 days. */
  views: number;
  leads: number;
  won: number;
  /** Leads ÷ views, in per cent; null with no views. */
  conversion: number | null;
};

// The app may be deployed before its migration is applied: a missing function
// or column is an empty list, not a crash.
const MISSING = new Set(["PGRST202", "PGRST205", "PGRST204", "42P01", "42883", "42703"]);

/** The funnels list. Null when the forms migrations are not applied yet. */
export async function getFormsOverview(): Promise<FormOverview[] | null> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("lead_forms_overview");
  if (error) {
    if (error.code && MISSING.has(error.code)) return null;
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    hasChanges: row.has_changes,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by_name,
    views: Number(row.views),
    leads: Number(row.leads),
    won: Number(row.won),
    conversion: row.conversion === null ? null : Number(row.conversion),
  }));
}

export type EditableForm = {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "live" | "closed";
  subject: string;
  sourceTag: string;
  draft: FormDocument;
  published: FormDocument | null;
  version: number;
  assets: Record<string, FormAsset>;
};

/** One form for the editor, or null when it does not exist or is archived. */
export async function getEditableForm(id: string): Promise<EditableForm | null> {
  const supabase = await createClient();
  if (!supabase || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [form, assets] = await Promise.all([
    supabase
      .from("lead_forms")
      .select("id, name, slug, status, subject, source_tag, draft, published, published_version")
      .eq("id", id)
      .is("archived_at", null)
      .maybeSingle(),
    supabase.from("form_assets").select("id, path, width, height").eq("form_id", id),
  ]);
  if (form.error) throw new Error(form.error.message);
  if (!form.data) return null;

  const draft = formDraftSchema.safeParse(form.data.draft);
  if (!draft.success) return null;
  const published = formDocumentSchema.safeParse(form.data.published);
  return {
    id: form.data.id,
    name: form.data.name,
    slug: form.data.slug,
    status: form.data.status,
    subject: form.data.subject ?? "",
    sourceTag: form.data.source_tag ?? "",
    draft: draft.data,
    published: published.success ? published.data : null,
    version: form.data.published_version,
    assets: Object.fromEntries(
      (assets.data ?? []).map((asset) => [asset.id, { url: formAssetUrl(asset.path), width: asset.width, height: asset.height }]),
    ),
  };
}
