import { z } from "zod";

import { formDraftSchema } from "@/lib/forms/document";

export const FORMS_ERROR_KEYS = [
  "generic",
  "notAllowed",
  "notFound",
  "invalid",
  "incomplete",
  "consentOwner",
  "slugFormat",
  "slugReserved",
  "slugTaken",
  "fileInvalid",
] as const;
export type FormsErrorKey = (typeof FORMS_ERROR_KEYS)[number];

export type FormsResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: FormsErrorKey };

/** Database error codes → messages. EF001 and EF002 are raised by publish_lead_form(). */
export const FORMS_ERRORS: Record<string, FormsErrorKey> = {
  "42501": "notAllowed",
  P0002: "notFound",
  EF001: "consentOwner",
  EF002: "incomplete",
  "23505": "slugTaken",
};

/** PNG, JPG or WebP up to 5 MB. Everything is stored as WebP. */
export const ASSET_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const ASSET_KINDS = ["logo", "background", "image", "share"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

const id = z.uuid();

export const createFormSchema = z.object({
  /** A template's key, or "blank". */
  template: z.string().max(40),
});

export const saveDraftSchema = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(120),
  sourceTag: z.string().trim().max(60),
  document: formDraftSchema,
});

export const slugSchema = z.object({ id, slug: z.string().trim().max(60) });
export const statusSchema = z.object({ id, status: z.enum(["live", "closed"]) });
export const formIdSchema = z.object({ id });
