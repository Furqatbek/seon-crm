import { z } from "zod";

import { LEAD_SOURCES, LEAD_STATUSES, normalizePhone } from "@/lib/domain/leads";

// Messages are keys under leads.errors in messages/*.json.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .transform((value) => (value === "" ? null : value));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid");

export const leadFormSchema = z.object({
  full_name: z.string().trim().min(1, "nameRequired").max(120, "tooLong"),
  phone: z
    .string()
    .transform((value, ctx) => {
      const phone = normalizePhone(value);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "phoneInvalid" });
        return z.NEVER;
      }
      return phone;
    }),
  source: z.enum(LEAD_SOURCES, "sourceRequired"),
  subject_interest: optionalText(120),
  preferred_time: optionalText(120),
  assigned_to: z.union([z.uuid(), z.literal("")]).transform((value) => value || null),
  next_contact: z.union([day, z.literal("")]).transform((value) => value || null),
  notes: optionalText(2000),
});
export type LeadFormInput = z.input<typeof leadFormSchema>;
export type LeadFormValues = z.output<typeof leadFormSchema>;

export const moveLeadSchema = z
  .object({
    id: z.uuid(),
    to: z.enum(LEAD_STATUSES),
    // Lost: a reason code, or the text typed for "other".
    lostReason: z.string().trim().max(200, "tooLong").optional(),
    // Trial: the group and the date of the trial lesson.
    trialGroupId: z.uuid().optional(),
    trialDate: day.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.to === "lost" && !value.lostReason) {
      ctx.addIssue({ code: "custom", message: "lostReasonRequired", path: ["lostReason"] });
    }
    if (value.to === "trial" && !value.trialGroupId) {
      ctx.addIssue({ code: "custom", message: "trialGroupRequired", path: ["trialGroupId"] });
    }
    if (value.to === "trial" && !value.trialDate) {
      ctx.addIssue({ code: "custom", message: "trialDateRequired", path: ["trialDate"] });
    }
  });
export type MoveLeadInput = z.input<typeof moveLeadSchema>;

export const leadActivitySchema = z
  .object({
    leadId: z.uuid(),
    kind: z.enum(["note", "call"]),
    body: z.string().trim().max(2000, "tooLong"),
  })
  // A note is its text; a call may be logged without a comment.
  .refine((value) => value.kind === "call" || value.body !== "", {
    message: "noteRequired",
    path: ["body"],
  });
export type LeadActivityInput = z.input<typeof leadActivitySchema>;

export type LeadErrorKey =
  | "nameRequired"
  | "phoneInvalid"
  | "sourceRequired"
  | "dateInvalid"
  | "tooLong"
  | "lostReasonRequired"
  | "trialGroupRequired"
  | "trialDateRequired"
  | "noteRequired"
  | "moveNotAllowed"
  | "notFound"
  | "notAllowed"
  | "generic";

export type LeadResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: LeadErrorKey };

/** URL state of /leads: a link reopens the same view. */
export const leadsSearchSchema = z.object({
  view: z.enum(["board", "list"]).catch("board"),
  q: z.string().max(80).catch(""),
  source: z.enum(LEAD_SOURCES).optional().catch(undefined),
  assigned: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
  lead: z.uuid().optional().catch(undefined),
});
export type LeadsSearch = z.output<typeof leadsSearchSchema>;

export { PAGE_SIZE as LEADS_PAGE_SIZE } from "@/lib/pagination";
