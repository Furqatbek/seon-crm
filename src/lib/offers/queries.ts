import "server-only";

import { SESSIONS_AHEAD_DAYS, SESSIONS_BACK_DAYS, addDays } from "@/lib/domain/open-lessons";
import { createClient } from "@/lib/supabase/server";
import type { BookingStatus, VoucherStatus, VoucherType } from "@/lib/validation/offers";

// Vouchers and open lessons, read as the signed-in user: Row Level Security
// decides what comes back (the owner and managers everything, a teacher their
// own slots and the bookings on them).

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}
/** The tables are not there yet: a deploy is ahead of its migration. */
const missing = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202";

export type VoucherSettings = {
  percent_enabled: boolean;
  percent_weight: number;
  percent_value: number;
  fixed_enabled: boolean;
  fixed_weight: number;
  fixed_value: number;
  trial_enabled: boolean;
  trial_weight: number;
  trial_value: number;
  valid_days: number;
};

export async function getVoucherSettings(): Promise<VoucherSettings | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("voucher_settings")
    .select("percent_enabled, percent_weight, percent_value, fixed_enabled, fixed_weight, fixed_value, trial_enabled, trial_weight, trial_value, valid_days")
    .maybeSingle();
  if (error && !missing(error)) throw new Error(error.message);
  return data ?? null;
}

export type LeadVoucher = { code: string; type: VoucherType; value: number; status: VoucherStatus; expires_at: string; redeemed_at: string | null };
export type LeadBooking = { id: string; title: string; session_date: string; start_time: string; status: BookingStatus };
export type LeadOffer = { voucher: LeadVoucher | null; bookings: LeadBooking[] };

/** A voucher past its date is expired, whether or not the hourly job has run. */
const statusOf = (status: VoucherStatus, expiresAt: string, now: Date): VoucherStatus => (status === "issued" && Date.parse(expiresAt) <= now.getTime() ? "expired" : status);

/** What the app gave a lead's person: their voucher and their open-lesson bookings, the latest first. */
export async function getLeadOffer(leadId: string, now = new Date()): Promise<LeadOffer> {
  const supabase = await db();
  const [voucher, bookings] = await Promise.all([
    supabase.from("vouchers").select("code, type, value, status, expires_at, redeemed_at").eq("lead_id", leadId).order("issued_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("open_lesson_bookings").select("id, slot_id, session_date, status").eq("lead_id", leadId).order("session_date", { ascending: false }).limit(20),
  ]);
  if (missing(voucher.error) || missing(bookings.error)) return { voucher: null, bookings: [] };
  if (voucher.error || bookings.error) throw new Error((voucher.error ?? bookings.error)!.message);
  const slotIds = [...new Set(bookings.data.map((booking) => booking.slot_id))];
  const slots = slotIds.length > 0 ? await supabase.from("open_lesson_slots").select("id, title, start_time").in("id", slotIds) : { data: [], error: null };
  if (slots.error) throw new Error(slots.error.message);
  const slotOf = new Map((slots.data ?? []).map((slot) => [slot.id, slot]));
  return {
    voucher: voucher.data ? { ...voucher.data, status: statusOf(voucher.data.status, voucher.data.expires_at, now) } : null,
    bookings: bookings.data.map((booking) => ({
      id: booking.id,
      title: slotOf.get(booking.slot_id)?.title ?? "",
      session_date: booking.session_date,
      start_time: (slotOf.get(booking.slot_id)?.start_time ?? "").slice(0, 5),
      status: booking.status,
    })),
  };
}

export type OpenLessonSlot = {
  id: string;
  title: string;
  korean_level: "beginner" | "topik1" | "topik2" | null;
  weekday: number;
  /** "HH:MM" */
  start_time: string;
  duration_min: number;
  room: string | null;
  teacher_id: string | null;
  teacher: string | null;
  seats: number;
  is_active: boolean;
};

export type SessionBooking = {
  id: string;
  slot_id: string;
  session_date: string;
  status: BookingStatus;
  lead_id: string | null;
  /** The person, when the reader may see them (the owner and managers). */
  name: string | null;
  phone: string | null;
};

export type OpenLessonsData = { slots: OpenLessonSlot[]; bookings: SessionBooking[] };

/** The slots that are not archived, and the bookings from two weeks back to four weeks ahead. */
export async function getOpenLessons(today: string): Promise<OpenLessonsData> {
  const supabase = await db();
  const [slots, bookings] = await Promise.all([
    supabase.from("open_lesson_slots").select("id, title, korean_level, weekday, start_time, duration_min, room, teacher_id, seats, is_active").is("archived_at", null).order("weekday").order("start_time"),
    supabase
      .from("open_lesson_bookings")
      .select("id, slot_id, session_date, status, lead_id, profile_id")
      .gte("session_date", addDays(today, -SESSIONS_BACK_DAYS))
      .lte("session_date", addDays(today, SESSIONS_AHEAD_DAYS))
      .neq("status", "cancelled")
      .order("booked_at")
      .limit(1000),
  ]);
  if (missing(slots.error) || missing(bookings.error)) return { slots: [], bookings: [] };
  if (slots.error || bookings.error) throw new Error((slots.error ?? bookings.error)!.message);
  const teacherIds = [...new Set(slots.data.flatMap((slot) => (slot.teacher_id ? [slot.teacher_id] : [])))];
  const profileIds = [...new Set(bookings.data.map((booking) => booking.profile_id))];
  const [teachers, people] = await Promise.all([
    teacherIds.length > 0 ? supabase.from("teachers").select("id, full_name").in("id", teacherIds) : null,
    // A teacher is not shown who booked: the rows simply do not come back.
    profileIds.length > 0 ? supabase.from("profiles").select("id, full_name, phone").in("id", profileIds) : null,
  ]);
  const teacherOf = new Map((teachers?.data ?? []).map((teacher) => [teacher.id, teacher.full_name]));
  const personOf = new Map((people?.data ?? []).map((person) => [person.id, person]));
  return {
    slots: slots.data.map((slot) => ({ ...slot, start_time: slot.start_time.slice(0, 5), teacher: slot.teacher_id ? (teacherOf.get(slot.teacher_id) ?? null) : null })),
    bookings: bookings.data.map((booking) => ({
      id: booking.id,
      slot_id: booking.slot_id,
      session_date: booking.session_date,
      status: booking.status,
      lead_id: booking.lead_id,
      name: personOf.get(booking.profile_id)?.full_name ?? null,
      phone: personOf.get(booking.profile_id)?.phone ?? null,
    })),
  };
}

export type VoucherReportRow = { type: VoucherType; issued: number; redeemed: number; expired: number };

/** Vouchers issued between two Tashkent days, by type, with how many were used and how many expired. */
export async function getVoucherReport(from: string, to: string): Promise<VoucherReportRow[]> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("voucher_report", { p_from: from, p_to: to });
  if (error) {
    if (missing(error)) return [];
    throw new Error(error.message);
  }
  return data ?? [];
}
