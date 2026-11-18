"use server";

// The form editor's writes. docs/SPEC.md → "Lead forms add-on": "Form builder",
// "Editor with live preview". The database decides who may do what (row level
// security, publish_lead_form()); these actions check the shape of the input.

import { refresh } from "next/cache";
import sharp from "sharp";

import { getSignedInUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  ASSET_KINDS,
  ASSET_MAX_BYTES,
  ASSET_TYPES,
  FORMS_ERRORS,
  createFormSchema,
  formIdSchema,
  saveDraftSchema,
  slugSchema,
  statusSchema,
  type AssetKind,
  type FormsErrorKey,
  type FormsResult,
} from "@/lib/validation/forms";

import { BLANK_DOCUMENT } from "./blank";
import { formDocumentSchema, formDraftSchema, type FormDocument } from "./document";
import { formAssetUrl, refreshPublicForm, type FormAsset } from "./public";
import { FORM_TEMPLATES } from "./templates";
import { slugProblem, slugify } from "./url";

const fail = (error: { code?: string } | null): { ok: false; error: FormsErrorKey } => ({
  ok: false,
  error: (error?.code && FORMS_ERRORS[error.code]) || "generic",
});

async function staff() {
  const [user, supabase] = await Promise.all([getSignedInUser(), createClient()]);
  return supabase && user && user.role !== "teacher" ? { user, supabase } : null;
}
type Staff = NonNullable<Awaited<ReturnType<typeof staff>>>;

/** An address nobody uses yet: "free-trial", then "free-trial-2", "free-trial-3"… */
async function freeSlug(supabase: Staff["supabase"], wanted: string): Promise<string> {
  const base = slugProblem(wanted) ? "form" : wanted;
  const { data } = await supabase.from("lead_forms").select("slug").like("slug", `${base}%`);
  const taken = new Set((data ?? []).map((row) => row.slug));
  if (!taken.has(base) && !slugProblem(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** New form, blank or from a template. It starts as a draft. */
export async function createForm(input: unknown): Promise<FormsResult<{ id: string }>> {
  const parsed = createFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ctx = await staff();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const template = FORM_TEMPLATES.find((item) => item.key === parsed.data.template);
  if (!template && parsed.data.template !== "blank") return { ok: false, error: "invalid" };
  const document = formDocumentSchema.parse(template?.document ?? BLANK_DOCUMENT);
  const title = document.texts.title[document.default_language] ?? "";
  const name = template?.name ?? title;

  const { data, error } = await ctx.supabase
    .from("lead_forms")
    .insert({
      name,
      slug: await freeSlug(ctx.supabase, template?.slug ?? (slugify(title) || "form")),
      source_tag: template?.source_tag ?? null,
      draft: document as unknown as NonNullable<Json>,
    })
    .select("id")
    .single();
  if (error) return fail(error);
  refresh();
  return { ok: true, data: { id: data.id } };
}

/** A copy of a form's draft under a new address, as a draft. Pictures are shared with the original. */
export async function duplicateForm(input: unknown): Promise<FormsResult<{ id: string }>> {
  const parsed = formIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ctx = await staff();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const [source, assets] = await Promise.all([
    ctx.supabase.from("lead_forms").select("name, slug, subject, source_tag, draft").eq("id", parsed.data.id).maybeSingle(),
    ctx.supabase.from("form_assets").select("id, kind, path, width, height").eq("form_id", parsed.data.id),
  ]);
  if (source.error) return fail(source.error);
  if (!source.data) return { ok: false, error: "notFound" };

  const { data, error } = await ctx.supabase
    .from("lead_forms")
    .insert({
      name: `${source.data.name} (2)`.slice(0, 120),
      slug: await freeSlug(ctx.supabase, `${source.data.slug}-copy`.slice(0, 55)),
      subject: source.data.subject,
      source_tag: source.data.source_tag,
      draft: source.data.draft,
    })
    .select("id")
    .single();
  if (error) return fail(error);

  // The copy gets its own asset rows (same files), and its draft points at them.
  if (assets.data && assets.data.length > 0) {
    const copies = assets.data.map((asset) => ({ from: asset.id, row: { ...asset, id: crypto.randomUUID(), form_id: data.id } }));
    await ctx.supabase.from("form_assets").insert(copies.map((copy) => copy.row));
    let draft = JSON.stringify(source.data.draft);
    for (const copy of copies) draft = draft.replaceAll(copy.from, copy.row.id);
    await ctx.supabase.from("lead_forms").update({ draft: JSON.parse(draft) as NonNullable<Json> }).eq("id", data.id);
  }
  refresh();
  return { ok: true, data: { id: data.id } };
}

/** Archive a form: it leaves the list and its page stops working. Owner only (the database refuses anyone else). */
export async function archiveForm(input: unknown): Promise<FormsResult> {
  const parsed = formIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ctx = await staff();
  if (!ctx || ctx.user.role !== "owner") return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase
    .from("lead_forms")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .select("slug")
    .maybeSingle();
  if (error) return fail(error);
  if (!data) return { ok: false, error: "notFound" };
  refreshPublicForm(data.slug);
  refresh();
  return { ok: true };
}

/** The editor's auto-save: the draft, name, subject and source tag. Visitors see nothing of it. */
export async function saveDraft(input: unknown): Promise<FormsResult> {
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ctx = await staff();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { id, name, subject, sourceTag, document } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("lead_forms")
    .update({ name, subject: subject || null, source_tag: sourceTag || null, draft: document as unknown as NonNullable<Json> })
    .eq("id", id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) return fail(error);
  return data ? { ok: true } : { ok: false, error: "notFound" };
}

/** Change a form's address. Old links stop working at once. */
export async function changeSlug(input: unknown): Promise<FormsResult<{ slug: string }>> {
  const parsed = slugSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const problem = slugProblem(parsed.data.slug);
  if (problem) return { ok: false, error: problem === "reserved" ? "slugReserved" : "slugFormat" };
  const ctx = await staff();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const before = await ctx.supabase.from("lead_forms").select("slug").eq("id", parsed.data.id).maybeSingle();
  if (!before.data) return { ok: false, error: "notFound" };
  const { error } = await ctx.supabase.from("lead_forms").update({ slug: parsed.data.slug }).eq("id", parsed.data.id);
  if (error) return fail(error);
  refreshPublicForm(before.data.slug);
  refreshPublicForm(parsed.data.slug);
  return { ok: true, data: { slug: parsed.data.slug } };
}

/**
 * Publish: the saved draft becomes what visitors see, the version is kept in
 * the history, and the cached public page is refreshed.
 */
export async function publishForm(input: unknown): Promise<FormsResult<{ version: number; status: "live" | "closed"; published: FormDocument }>> {
  const parsed = formIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ctx = await staff();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const form = await ctx.supabase.from("lead_forms").select("slug, draft").eq("id", parsed.data.id).is("archived_at", null).maybeSingle();
  if (form.error) return fail(form.error);
  if (!form.data) return { ok: false, error: "notFound" };
  // A draft may be half-finished; what is published must be a complete form.
  const document = formDocumentSchema.safeParse(form.data.draft);
  if (!document.success) return { ok: false, error: "incomplete" };

  const { data: version, error } = await ctx.supabase.rpc("publish_lead_form", { p_id: parsed.data.id });
  if (error) return fail(error);
  const after = await ctx.supabase.from("lead_forms").select("status").eq("id", parsed.data.id).single();
  refreshPublicForm(form.data.slug);
  return { ok: true, data: { version, status: after.data?.status === "closed" ? "closed" : "live", published: document.data } };
}

/** Close a live form (visitors see the closed message) or open it again. */
export async function setFormStatus(input: unknown): Promise<FormsResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ctx = await staff();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase
    .from("lead_forms")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .not("published", "is", null)
    .select("slug")
    .maybeSingle();
  if (error) return fail(error);
  if (!data) return { ok: false, error: "notFound" };
  refreshPublicForm(data.slug);
  return { ok: true };
}

export type FormVersion = { version: number; publishedAt: string; publishedBy: string | null; content: FormDocument | null };

/** Every publish of a form, newest first, for Version history. */
export async function getFormVersions(input: unknown): Promise<FormsResult<FormVersion[]>> {
  const parsed = formIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ctx = await staff();
  if (!ctx) return { ok: false, error: "notAllowed" };

  const { data, error } = await ctx.supabase
    .from("lead_form_versions")
    .select("version, published_at, published_by, content")
    .eq("form_id", parsed.data.id)
    .order("version", { ascending: false })
    .limit(100);
  if (error) return fail(error);
  const ids = [...new Set((data ?? []).map((row) => row.published_by).filter((value): value is string => Boolean(value)))];
  const people = ids.length > 0 ? await ctx.supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map((people.data ?? []).map((person) => [person.id, person.full_name]));
  return {
    ok: true,
    data: (data ?? []).map((row) => {
      const content = formDraftSchema.safeParse(row.content);
      return {
        version: row.version,
        publishedAt: row.published_at,
        publishedBy: row.published_by ? (names.get(row.published_by) ?? null) : null,
        content: content.success ? content.data : null,
      };
    }),
  };
}

/**
 * A picture for a form: logo, background, a picture in the form or the share
 * image. PNG, JPG or WebP up to 5 MB; stored as WebP, at most 2400 px a side.
 */
export async function uploadFormAsset(form: FormData): Promise<FormsResult<{ id: string; asset: FormAsset }>> {
  const file = form.get("file");
  const formId = formIdSchema.safeParse({ id: form.get("formId") });
  const kind = form.get("kind");
  if (!formId.success || typeof kind !== "string" || !(ASSET_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "invalid" };
  if (!(file instanceof File) || !(ASSET_TYPES as readonly string[]).includes(file.type) || file.size === 0 || file.size > ASSET_MAX_BYTES) {
    return { ok: false, error: "fileInvalid" };
  }
  const ctx = await staff();
  if (!ctx) return { ok: false, error: "notAllowed" };

  let webp: { data: Buffer; info: { width: number; height: number } };
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    // Not really a picture, whatever its name says.
    return { ok: false, error: "fileInvalid" };
  }

  const path = `${formId.data.id}/${crypto.randomUUID()}.webp`;
  const stored = await ctx.supabase.storage.from("form-assets").upload(path, webp.data, { contentType: "image/webp", cacheControl: "31536000" });
  if (stored.error) return { ok: false, error: "fileInvalid" };
  const { data, error } = await ctx.supabase
    .from("form_assets")
    .insert({ form_id: formId.data.id, kind: kind as AssetKind, path, width: webp.info.width, height: webp.info.height })
    .select("id")
    .single();
  if (error) return fail(error);
  return { ok: true, data: { id: data.id, asset: { url: formAssetUrl(path), width: webp.info.width, height: webp.info.height } } };
}
