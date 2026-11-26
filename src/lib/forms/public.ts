import "server-only";

import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { formDocumentSchema, type FormDocument } from "./document";

export type FormAsset = { url: string; width: number | null; height: number | null };

/** A form as visitors get it: the published document only, never the draft. */
export type PublicForm = {
  id: string;
  name: string;
  slug: string;
  status: "live" | "closed";
  document: FormDocument;
  assets: Record<string, FormAsset>;
};

const tag = (slug: string) => `lead-form:${slug}`;

/** Where a picture in the public form-assets bucket is served from. */
export function formAssetUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/form-assets/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * The published form at this address, or null. Cached per slug: publishing
 * calls refreshPublicForm(); without that a change shows within a minute.
 */
export async function getPublicForm(slug: string): Promise<PublicForm | null> {
  "use cache";
  cacheTag(tag(slug));
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });

  const db = createAdminClient();
  if (!db || !/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const { data, error } = await db.rpc("public_form", { p_slug: slug });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const document = formDocumentSchema.safeParse(data.document);
  if (!document.success) return null;
  const assets: Record<string, FormAsset> = {};
  for (const [id, asset] of Object.entries((data.assets ?? {}) as Record<string, { path: string; width: number | null; height: number | null }>)) {
    assets[id] = { url: formAssetUrl(asset.path), width: asset.width, height: asset.height };
  }
  return {
    id: String(data.id),
    name: String(data.name),
    slug: String(data.slug),
    status: data.status === "closed" ? "closed" : "live",
    document: document.data,
    assets,
  };
}

/** Called when a form is published, closed or reopened: visitors see it at once. */
export function refreshPublicForm(slug: string): void {
  revalidateTag(tag(slug), { expire: 0 });
}

/** One more view of this form today. Nothing about the visitor is kept. */
export async function countFormView(formId: string): Promise<void> {
  const db = createAdminClient();
  if (!db) return;
  await db.rpc("form_count_view", { p_form_id: formId });
}
