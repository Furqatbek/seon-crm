import "server-only";

import { monthInstants } from "@/lib/domain/payments";
import { PAGE_SIZE } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import type { PaymentMethod } from "@/lib/validation/finance";

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export type MonthSummary = { collected: number; billed: number; debt: number };

/** Owner only: the database refuses anyone else. */
export async function getMonthSummary(month: string): Promise<MonthSummary> {
  const supabase = await db();
  const { data, error } = await supabase
    .rpc("finance_month_summary", { p_month: `${month}-01` })
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export type PaymentRow = Pick<
  Tables<"payments">,
  "id" | "paid_at" | "receipt_no" | "amount" | "method" | "note" | "voided_at" | "void_reason"
> & {
  student: { id: string; full_name: string } | null;
  group: { name: string } | null;
  received: { full_name: string } | null;
};

export async function getPayments(filters: {
  month: string;
  method?: PaymentMethod;
  page: number;
}): Promise<{ rows: PaymentRow[]; total: number }> {
  const supabase = await db();
  const { start, end } = monthInstants(filters.month);
  const from = (filters.page - 1) * PAGE_SIZE;

  let query = supabase
    .from("payments")
    .select(
      "id, paid_at, receipt_no, amount, method, note, voided_at, void_reason, student:students(id, full_name), group:groups(name), received:profiles!payments_received_by_fkey(full_name)",
      { count: "exact" },
    )
    .gte("paid_at", start)
    .lt("paid_at", end)
    .order("paid_at", { ascending: false })
    .order("receipt_no", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (filters.method) query = query.eq("method", filters.method);

  const { data, count, error } = await query;
  if (error && error.code !== "PGRST103") throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

export type DebtorRow = {
  id: string;
  full_name: string;
  phone: string;
  /** Below zero. */
  balance: number;
  oldestUnpaidMonth: string | null;
  groups: Array<{ id: string; name: string }>;
  lastPaymentAt: string | null;
};

/**
 * Students in debt, largest debt first, one page: a balance below zero after
 * the due day of the current month, or a fee from an earlier month still
 * unpaid. Decided, sorted and paged in the database (list_debtors), so the
 * last payment and the count never depend on how many rows the API returns.
 */
export async function getDebtors(page: number): Promise<{ rows: DebtorRow[]; total: number }> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("list_debtors", {
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  if (data.length === 0 && page > 1) {
    // Past the last page: the count still has to be right for the pager.
    const first = await supabase.rpc("list_debtors", { p_limit: 1, p_offset: 0 });
    if (first.error) throw new Error(first.error.message);
    return { rows: [], total: first.data[0]?.total ?? 0 };
  }
  return {
    rows: data.map((row) => ({
      id: row.student_id,
      full_name: row.full_name,
      phone: row.phone,
      balance: row.balance,
      oldestUnpaidMonth: row.oldest_unpaid_month,
      groups: row.groups as DebtorRow["groups"],
      lastPaymentAt: row.last_payment_at,
    })),
    total: data[0]?.total ?? 0,
  };
}

export type ChargeRow = Pick<
  Tables<"charges">,
  | "id"
  | "type"
  | "amount"
  | "base_amount"
  | "discount_amount"
  | "is_prorated"
  | "lessons_counted"
  | "lessons_in_month"
  | "note"
  | "created_at"
> & {
  student: { id: string; full_name: string } | null;
  group: { name: string } | null;
};

/** A billing month's charges, newest first. */
export async function getMonthCharges(
  month: string,
  page: number,
): Promise<{ rows: ChargeRow[]; total: number }> {
  const supabase = await db();
  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await supabase
    .from("charges")
    .select(
      "id, type, amount, base_amount, discount_amount, is_prorated, lessons_counted, lessons_in_month, note, created_at, student:students(id, full_name), group:groups(name)",
      { count: "exact" },
    )
    .eq("billing_month", `${month}-01`)
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + PAGE_SIZE - 1);
  if (error && error.code !== "PGRST103") throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

export type Receipt = Pick<
  Tables<"payments">,
  "id" | "paid_at" | "receipt_no" | "amount" | "method" | "note" | "voided_at" | "void_reason"
> & {
  student: { full_name: string } | null;
  group: { name: string } | null;
  received: { full_name: string } | null;
  centreName: string;
};

export async function getReceipt(id: string): Promise<Receipt | null> {
  const supabase = await db();
  const [payment, centre] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, paid_at, receipt_no, amount, method, note, voided_at, void_reason, student:students(full_name), group:groups(name), received:profiles!payments_received_by_fkey(full_name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("centre_settings").select("centre_name").maybeSingle(),
  ]);
  if (payment.error) throw new Error(payment.error.message);
  if (!payment.data) return null;
  return { ...payment.data, centreName: centre.data?.centre_name ?? "" };
}
