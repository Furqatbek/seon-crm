// Pure rules for the Leads block — docs/SPEC.md → "Business rules → Leads".

import { tashkentDate } from "./time";

export { tashkentDate, tashkentDayStart } from "./time";

export const LEAD_STATUSES = ["new", "contacted", "trial", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  "instagram",
  "telegram",
  "phone_call",
  "walk_in",
  "referral",
  "website",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Stored in leads.lost_reason. "Other" is stored as the text the user typed. */
export const LOST_REASONS = ["price", "schedule", "another_centre", "no_answer"] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export function isLostReasonCode(value: string | null | undefined): value is LostReason {
  return LOST_REASONS.some((reason) => reason === value);
}

/** Stages a lead still needs work in. Won and Lost are final. */
export const OPEN_STATUSES: readonly LeadStatus[] = ["new", "contacted", "trial"];

/** Won and Lost columns show this many days. */
export const CLOSED_DAYS_ON_BOARD = 30;

/**
 * Whether a lead may be moved from one stage to another by hand.
 * A won lead is read-only. Won is reached only through Convert to student,
 * which also creates the student.
 */
export function canMoveLead(from: LeadStatus, to: LeadStatus): boolean {
  if (from === to) return false;
  if (from === "won" || to === "won") return false;
  return true;
}

/**
 * Any way people type an Uzbek mobile number → "+998XXXXXXXXX", or null.
 * Accepts "+998 90 123 45 67", "998901234567", "90 123-45-67", "(90) 1234567".
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\+?[\d\s()-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith("998")) return `+${digits}`;
  return null;
}

/** A next-contact day picked in the form → the instant stored (09:00 in Tashkent). */
export function nextContactTimestamp(day: string): string {
  return `${day}T09:00:00+05:00`;
}

/** An open lead whose next contact date is today or earlier (Tashkent days). */
export function isFollowUpDue(
  lead: { status: LeadStatus; next_contact_at: string | null },
  now: Date,
): boolean {
  if (!lead.next_contact_at || !OPEN_STATUSES.includes(lead.status)) return false;
  return tashkentDate(lead.next_contact_at) <= tashkentDate(now);
}

/**
 * Makes free text safe to put inside a PostgREST or=(…) filter and an ilike
 * pattern: the characters that have a meaning there are dropped.
 */
export function sanitizeSearch(query: string): string {
  return query
    .replace(/[,()"\\%_*:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
