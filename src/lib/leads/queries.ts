import "server-only";

import {
  CLOSED_DAYS_ON_BOARD,
  OPEN_STATUSES,
  sanitizeSearch,
  tashkentDayStart,
} from "@/lib/domain/leads";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { LEADS_PAGE_SIZE, type LeadsSearch } from "@/lib/validation/leads";

const SUMMARY_COLUMNS =
  "id, full_name, phone, source, subject_interest, status, next_contact_at, assigned_to, created_at" as const;

export type LeadSummary = Pick<
  Tables<"leads">,
  | "id"
  | "full_name"
  | "phone"
  | "source"
  | "subject_interest"
  | "status"
  | "next_contact_at"
  | "assigned_to"
  | "created_at"
>;

export type LeadActivity = Pick<
  Tables<"lead_activities">,
  "id" | "kind" | "body" | "from_status" | "to_status" | "created_by" | "created_at"
>;

export type LeadDetail = Tables<"leads"> & { activities: LeadActivity[] };

export type StaffOption = { id: string; full_name: string };
export type GroupOption = { id: string; name: string };

type Filters = Pick<LeadsSearch, "q" | "source" | "assigned">;

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

function searchFilter(query: string): string | null {
  const text = sanitizeSearch(query);
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  const parts = [`full_name.ilike.%${text}%`];
  if (digits.length >= 3) parts.push(`phone.ilike.%${digits}%`);
  return parts.join(",");
}

/** Open leads, plus Won and Lost from the last 30 days. */
export async function getBoardLeads(filters: Filters, now: Date): Promise<LeadSummary[]> {
  const supabase = await db();
  const since = tashkentDayStart(now, -CLOSED_DAYS_ON_BOARD);

  let query = supabase
    .from("leads")
    .select(SUMMARY_COLUMNS)
    .is("archived_at", null)
    .or(`status.in.(${OPEN_STATUSES.join(",")}),updated_at.gte.${since}`)
    .order("next_contact_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);

  const search = searchFilter(filters.q);
  if (search) query = query.or(search);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.assigned) query = query.eq("assigned_to", filters.assigned);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

/** All leads, newest first, 50 per page. */
export async function getListLeads(
  filters: Filters,
  page: number,
): Promise<{ rows: LeadSummary[]; total: number }> {
  const supabase = await db();
  const from = (page - 1) * LEADS_PAGE_SIZE;

  let query = supabase
    .from("leads")
    .select(SUMMARY_COLUMNS, { count: "exact" })
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .range(from, from + LEADS_PAGE_SIZE - 1);

  const search = searchFilter(filters.q);
  if (search) query = query.or(search);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.assigned) query = query.eq("assigned_to", filters.assigned);

  const { data, count, error } = await query;
  // Asking for a page past the end is not an error for the user.
  if (error && error.code !== "PGRST103") throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

/** Open leads whose next contact date is today or earlier. */
export async function getFollowUps(now: Date): Promise<LeadSummary[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("leads")
    .select(SUMMARY_COLUMNS)
    .is("archived_at", null)
    .in("status", [...OPEN_STATUSES])
    .lt("next_contact_at", tashkentDayStart(now, 1))
    .order("next_contact_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return data;
}

export async function getLead(id: string): Promise<LeadDetail | null> {
  const supabase = await db();
  const [lead, activities] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).is("archived_at", null).maybeSingle(),
    supabase
      .from("lead_activities")
      .select("id, kind, body, from_status, to_status, created_by, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);
  if (lead.error) throw new Error(lead.error.message);
  if (activities.error) throw new Error(activities.error.message);
  return lead.data ? { ...lead.data, activities: activities.data } : null;
}

/** Everyone a lead can be assigned to, and every author shown in a timeline. */
export async function getStaff(): Promise<Array<StaffOption & { is_active: boolean }>> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, is_active")
    .order("full_name");
  if (error) throw new Error(error.message);
  return data;
}

/** Groups a trial lesson can be booked in. */
export async function getTrialGroups(): Promise<GroupOption[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("groups")
    .select("id, name")
    .is("archived_at", null)
    .in("status", ["forming", "active"])
    .order("name");
  if (error) throw new Error(error.message);
  return data;
}
